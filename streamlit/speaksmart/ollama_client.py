"""Small, testable adapter for Ollama's local HTTP API."""

import json
import re
from urllib.parse import urlparse

import requests


class OllamaError(RuntimeError):
    """A friendly error for model/server problems."""


def validate_local_url(base_url):
    url = urlparse(base_url)
    if url.scheme != "http" or url.hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("Ollama URL must be a local HTTP address")
    return base_url.rstrip("/")


class OllamaClient:
    def __init__(self, base_url="http://127.0.0.1:11434", model="qwen3:1.7b", session=None):
        self.base_url = validate_local_url(base_url)
        self.model = model.strip()
        self.session = session or requests.Session()
        self.session.trust_env = False  # Localhost should not go through a system proxy.

    def available_models(self):
        try:
            response = self.session.get(f"{self.base_url}/api/tags", timeout=3)
            response.raise_for_status()
            return [item["name"] for item in response.json().get("models", [])]
        except (requests.RequestException, ValueError, KeyError) as exc:
            raise OllamaError("Ollama is not reachable. Start Ollama and check the local address.") from exc

    def _chat_json(self, messages):
        payload = {
            "model": self.model,
            "messages": messages,
            "format": "json",
            "stream": False,
            "think": False,
            "options": {"temperature": 0.4, "num_predict": 450},
        }
        try:
            response = self.session.post(f"{self.base_url}/api/chat", json=payload, timeout=120)
            response.raise_for_status()
            content = response.json()["message"]["content"]
            return json.loads(content)
        except requests.ConnectionError as exc:
            raise OllamaError("Ollama is not running. Start it, then try again.") from exc
        except requests.Timeout as exc:
            raise OllamaError("The model took too long. Try a shorter sentence or a smaller model.") from exc
        except requests.HTTPError as exc:
            status = exc.response.status_code if exc.response is not None else "unknown"
            raise OllamaError(f"Ollama returned HTTP {status}. Check that '{self.model}' is downloaded.") from exc
        except (ValueError, KeyError, TypeError) as exc:
            raise OllamaError("The model returned an unreadable answer. Please try again.") from exc

    def practice(self, topic, history, learner_text):
        system = (
            "You are SpeakSmart, an encouraging conversation partner and English tutor for a beginner. "
            f"Practice topic: {topic}. Return ONLY a JSON object with four string keys: "
            "reply, correction, explanation, tip. No markdown. "
            "The reply must RESPOND to the meaning of the learner's latest message in simple English "
            "and ask ONE relevant follow-up question. Do not put the correction in reply. "
            "The correction must rewrite ONLY the learner's latest message from the learner's perspective; "
            "keep the intended meaning and pronouns such as I/my. If it needs no change, use an empty string. "
            "The explanation must name the actual before-and-after words in one short sentence, "
            "such as 'Use enjoy with I, not enjoys.' Avoid technical grammar labels. "
            "If there is no correction, the explanation must be empty. "
            "The tip must be one short useful phrase or vocabulary tip. "
            "Example: If the learner says 'Yesterday I go to the market.', return "
            "{\"reply\":\"That sounds nice! What did you buy at the market?\","
            "\"correction\":\"Yesterday I went to the market.\","
            "\"explanation\":\"Went is the past tense of go.\","
            "\"tip\":\"Try: I bought some fruit.\"}."
        )
        messages = [{"role": "system", "content": system}]
        for item in history[-8:]:
            if item["role"] in {"user", "assistant"}:
                messages.append({"role": item["role"], "content": item["content"]})
        messages.append({"role": "user", "content": learner_text})
        result = parse_practice(self._chat_json(messages))
        if not result["correction"] or _words(result["correction"]) == _words(learner_text):
            result["correction"] = ""
            result["explanation"] = ""
        elif result["correction"]:
            result["explanation"] = grounded_explanation(
                learner_text, result["correction"], result["explanation"]
            )
        return result

    def grammar(self, sentence):
        messages = [
            {"role": "system", "content": (
                "You are a patient English grammar teacher. Correct the user's sentence while keeping its meaning. "
                "Return ONLY a JSON object with keys corrected (string), explanation (short string), "
                "examples (array of exactly two short strings showing the rule). "
                "If already correct, repeat it and say so in the explanation. No markdown."
            )},
            {"role": "user", "content": sentence},
        ]
        result = parse_grammar(self._chat_json(messages))
        result["explanation"] = grounded_explanation(sentence, result["corrected"], result["explanation"])
        return result

    def grammar_chat(self, question, selected_index, learner_message, history=None):
        """Discuss one curated grammar answer without asking the model to grade it."""
        answer = question["options"][question["answer"]]
        chosen = question["options"][selected_index]
        system = (
            "You are ALTRON, a friendly English grammar tutor for a beginner. "
            "A teacher verified this multiple-choice question and answer. Do not change the answer key. "
            "Answer in at most two short sentences. Use only the verified explanation and example below. "
            "Do not invent a different grammar rule or example. If asked for an example, repeat the verified example exactly. "
            "If the question is outside this rule, say you can only discuss this question. "
            "Return ONLY JSON with one string key: reply. No markdown. "
            f"Question: {question['question']} Options: {question['options']}. "
            f"Learner chose: {chosen}. Correct answer: {answer}. "
            f"Verified explanation: {question['explanation']}. "
            f"Verified example: {question.get('example', answer)}"
        )
        messages = [{"role": "system", "content": system}]
        for item in (history or [])[-6:]:
            if item.get("role") in {"user", "assistant"}:
                messages.append({"role": item["role"], "content": item["content"]})
        messages.append({"role": "user", "content": learner_message[:500]})
        data = self._chat_json(messages)
        if not isinstance(data, dict):
            raise OllamaError("The tutor returned an invalid answer. Please try again.")
        reply = _required_string(data, "reply")
        if not reply:
            raise OllamaError("The tutor returned an empty answer. Please try again.")
        return reply


def _words(text):
    return re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", text.lower())


def grounded_explanation(original, corrected, generated):
    """Give a reliable short reason for simple edits; keep AI text for complex ones."""
    before, after = _words(original), _words(corrected)
    if before == after:
        return "Your sentence is already clear."
    changes = [(old, new) for old, new in zip(before, after) if old != new]
    if len(before) == len(after) and len(changes) == 1:
        old, new = changes[0]
        if (new == old + "s" or new == old + "es" or
                old == new + "s" or old == new + "es"):
            return f"Use '{new}' instead of '{old}' so the verb agrees with the subject."
        past_forms = {"go": "went", "eat": "ate", "see": "saw", "buy": "bought",
                      "do": "did", "have": "had", "is": "was", "are": "were"}
        if past_forms.get(old) == new:
            return f"Use '{new}', the past tense of '{old}', for a completed action."
        if "already correct" in generated.lower():
            return f"Use '{new}' instead of '{old}' in this sentence."
    if "already correct" in generated.lower():
        return "The corrected version changes the wording to make the sentence clearer."
    return generated


def _required_string(data, key):
    value = data.get(key)
    if not isinstance(value, str):
        raise OllamaError(f"The model omitted the '{key}' field. Please try again.")
    return value.strip()


def parse_practice(data):
    if not isinstance(data, dict):
        raise OllamaError("The model returned an invalid practice answer.")
    result = {key: _required_string(data, key) for key in ("reply", "correction", "explanation", "tip")}
    if not result["reply"]:
        raise OllamaError("The model returned an empty reply. Please try again.")
    return result


def parse_grammar(data):
    if not isinstance(data, dict):
        raise OllamaError("The model returned an invalid grammar answer.")
    corrected = _required_string(data, "corrected")
    explanation = _required_string(data, "explanation")
    examples = data.get("examples")
    if not corrected or not explanation or not isinstance(examples, list) or len(examples) != 2:
        raise OllamaError("The model returned an incomplete grammar answer. Please try again.")
    if any(not isinstance(item, str) or not item.strip() for item in examples):
        raise OllamaError("The model returned invalid examples. Please try again.")
    return {"corrected": corrected, "explanation": explanation,
            "examples": [item.strip() for item in examples]}

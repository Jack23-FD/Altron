import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

from speaksmart import db
from speaksmart.ollama_client import (OllamaClient, OllamaError, grounded_explanation,
                                     parse_grammar, parse_practice, validate_local_url)
from speaksmart.quiz import grade, load_questions, pick_random_question


class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.db_path = Path(self.directory.name) / "nested" / "test.db"
        db.init_db(self.db_path)
        self.learner = db.get_or_create_learner(self.db_path, "Alex")

    def tearDown(self):
        self.directory.cleanup()

    def test_profiles_exchanges_and_progress(self):
        self.assertEqual(db.get_or_create_learner(self.db_path, "alex")["id"], self.learner["id"])
        session = db.create_conversation(self.db_path, self.learner["id"], "Travel")
        db.save_exchange(self.db_path, session, "I go yesterday", {
            "reply": "Where did you go?", "correction": "I went yesterday.",
            "explanation": "Went is past tense.", "tip": "Use went for past travel.",
        })
        messages = db.list_messages(self.db_path, session)
        self.assertEqual([m["role"] for m in messages], ["user", "assistant"])
        self.assertEqual(messages[1]["correction"], "I went yesterday.")
        db.save_grammar_check(self.db_path, self.learner["id"], "She go", {
            "corrected": "She goes", "explanation": "Subject agreement.", "examples": ["He goes.", "She walks."]
        })
        db.save_quiz_attempt(self.db_path, self.learner["id"], "G01", 1, True)
        db.save_quiz_attempt(self.db_path, self.learner["id"], "G02", 2, False)
        self.assertEqual(db.progress(self.db_path, self.learner["id"]), {
            "conversations": 1, "turns": 1, "grammar_checks": 1,
            "quiz_attempts": 2, "correct": 1, "accuracy": 50,
        })
        self.assertEqual(len(db.list_grammar_checks(self.db_path, self.learner["id"])), 1)

    def test_empty_name_rejected(self):
        with self.assertRaises(ValueError):
            db.get_or_create_learner(self.db_path, "   ")

    def test_daily_goal_and_activity_count(self):
        learner_id = self.learner["id"]
        self.assertEqual(db.get_daily_goal(self.db_path, learner_id), 5)
        db.set_daily_goal(self.db_path, learner_id, 3)
        self.assertEqual(db.get_daily_goal(self.db_path, learner_id), 3)
        with self.assertRaises(ValueError):
            db.set_daily_goal(self.db_path, learner_id, 0)
        session = db.create_conversation(self.db_path, learner_id, "Daily practice")
        db.save_exchange(self.db_path, session, "Hello", {
            "reply": "Hi!", "correction": "", "explanation": "", "tip": "Keep talking."
        })
        db.save_grammar_check(self.db_path, learner_id, "I goes", {
            "corrected": "I go", "explanation": "Agreement.", "examples": ["I go.", "We go."]
        })
        db.save_quiz_attempt(self.db_path, learner_id, "G01", 1, True)
        self.assertEqual(db.daily_progress(self.db_path, learner_id)["total"], 3)


class ModelTests(unittest.TestCase):
    def test_local_url_only(self):
        self.assertEqual(validate_local_url("http://localhost:11434/"), "http://localhost:11434")
        with self.assertRaises(ValueError):
            validate_local_url("https://example.com")

    def test_parse_answers(self):
        self.assertEqual(parse_practice({"reply": "Hi!", "correction": "", "explanation": "", "tip": "Hello"})["reply"], "Hi!")
        self.assertEqual(parse_grammar({"corrected": "I went.", "explanation": "Past tense.",
                                        "examples": ["She went.", "We went."]})["examples"][0], "She went.")
        with self.assertRaises(OllamaError):
            parse_grammar({"corrected": "I went.", "explanation": "Past tense.", "examples": []})

    def test_chat_request_shape_and_history(self):
        session = Mock()
        session.post.return_value.json.return_value = {"message": {"content":
            '{"reply":"Hello!","correction":"","explanation":"","tip":"Say hello."}'}}
        result = OllamaClient(session=session).practice("College", [
            {"role": "user", "content": "My college is nearby."},
            {"role": "assistant", "content": "How do you get there?"},
        ], "I walking there.")
        self.assertEqual(result["reply"], "Hello!")
        payload = session.post.call_args.kwargs["json"]
        self.assertEqual(payload["model"], "qwen3:1.7b")
        self.assertFalse(payload["stream"])
        self.assertEqual(payload["messages"][-1]["content"], "I walking there.")

    def test_grounded_explanations_for_common_changes(self):
        self.assertIn("agrees with the subject", grounded_explanation(
            "My brother walk to school.", "My brother walks to school.",
            "Walk is the past tense of walk."))
        self.assertIn("past tense", grounded_explanation(
            "Yesterday I go to the market.", "Yesterday I went to the market.",
            "The sentence is already correct."))
        self.assertEqual(grounded_explanation("Hello!", "Hello!", "wrong"),
                         "Your sentence is already clear.")

    def test_grammar_chat_uses_verified_answer(self):
        session = Mock()
        session.post.return_value.json.return_value = {"message": {"content": '{"reply":"Use goes with she."}'}}
        question = load_questions()[0]
        reply = OllamaClient(session=session).grammar_chat(question, 0, "Why is my answer wrong?")
        self.assertEqual(reply, "Use goes with she.")
        messages = session.post.call_args.kwargs["json"]["messages"]
        self.assertIn("Correct answer: She goes to college every day.", messages[0]["content"])
        self.assertIn("Verified example: He walks to school every day.", messages[0]["content"])
        self.assertEqual(messages[-1]["content"], "Why is my answer wrong?")


class QuizTests(unittest.TestCase):
    def test_bank_and_grading(self):
        questions = load_questions()
        self.assertEqual(len({q["id"] for q in questions}), len(questions))
        for question in questions:
            self.assertTrue(grade(question, question["answer"]))
            self.assertFalse(grade(question, (question["answer"] + 1) % 4))

    def test_random_question_does_not_repeat(self):
        questions = [q for q in load_questions() if q["category"] == "Grammar"]
        chosen = pick_random_question(questions, previous_id=questions[0]["id"])
        self.assertNotEqual(chosen["id"], questions[0]["id"])
        with self.assertRaises(ValueError):
            pick_random_question([])


if __name__ == "__main__":
    unittest.main()

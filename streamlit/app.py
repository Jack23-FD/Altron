"""Streamlit entry point for the English Teacher mini project."""

import os
from pathlib import Path

import streamlit as st

from speaksmart import db
from speaksmart.ollama_client import OllamaClient, OllamaError
from speaksmart.quiz import grade, load_questions, pick_random_question

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("SPEAKSMART_DB", ROOT / "data" / "speaksmart.db"))
MODEL = os.getenv("SPEAKSMART_MODEL", "qwen3:1.7b")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
TOPICS = ["Everyday life", "College", "Job interview", "Travel", "Shopping", "Free conversation"]

st.set_page_config(page_title="ALTRON · English Teacher", page_icon="💬", layout="wide")
st.markdown("""
<style>
  .stApp { background: #f7f9fc; color: #172b4d; }
  [data-testid="stMainBlockContainer"] { padding-top: 1.6rem; }
  [data-testid="stSidebar"] { background: #eaf3f7; color: #172b4d; border-right: 1px solid #d6e3eb; }
  [data-testid="stSidebar"] p, [data-testid="stSidebar"] label,
  [data-testid="stSidebar"] h3, [data-testid="stSidebar"] small { color: #172b4d; }
  .hero { padding: 1rem 1.5rem; border-radius: 18px; background: linear-gradient(115deg,#0b5b75,#246b99 65%,#4f77c7); color: white; margin-bottom: .6rem; }
  .hero h1 { font-size: 1.9rem; margin: 0; color: white; }
  .hero p { margin: .25rem 0 0; color: #e5f6ff; }
  .eyebrow { text-transform: uppercase; letter-spacing: .14em; font-weight: 700; font-size: .8rem; color: #c9eef6; }
  div.stButton > button[kind="primary"], div.stFormSubmitButton > button[kind="primary"] {
    background: #087c91; border-color: #087c91; color: #fff; font-weight: 700;
  }
  div.stButton > button[kind="primary"]:hover, div.stFormSubmitButton > button[kind="primary"]:hover {
    background: #066579; border-color: #066579; color: #fff;
  }
  [data-testid="stTextArea"] textarea, [data-testid="stTextInput"] input {
    background: #fff !important; color: #172b4d !important;
    border: 2px solid #a7bdca !important; border-radius: 12px;
    caret-color: #087c91 !important; font-size: 1rem;
  }
  [data-testid="stTextArea"] textarea:focus, [data-testid="stTextInput"] input:focus {
    border-color: #087c91 !important; box-shadow: 0 0 0 3px #087c9129;
  }
  [data-testid="stTextArea"] textarea::placeholder, [data-testid="stTextInput"] input::placeholder {
    color: #5e7181 !important; opacity: 1;
  }
  [data-testid="stForm"] { background: #fff; border: 1px solid #d6e3eb; border-radius: 16px; padding: 1rem; }
  button[role="tab"] { color: #24445c !important; font-weight: 650; }
  button[role="tab"][aria-selected="true"] { color: #075d70 !important; }
  [data-testid="stChatMessage"] { background: #fff; border: 1px solid #dce7ee; border-radius: 14px; }
  div[data-testid="stMetric"] { border: 1px solid #dce7ee; background: white; border-radius: 16px; padding: 1rem; }
</style>
""", unsafe_allow_html=True)
st.markdown('<div class="hero"><div class="eyebrow">Your private English practice space</div>'
            '<h1>ALTRON · English Teacher</h1><p>Practice a conversation, understand your grammar, and build confidence one step at a time.</p></div>',
            unsafe_allow_html=True)

db.init_db(DB_PATH)
if not db.list_learners(DB_PATH):
    db.get_or_create_learner(DB_PATH, "Demo Learner")
learners = db.list_learners(DB_PATH)


@st.cache_data(ttl=10, show_spinner=False)
def model_status(base_url, model):
    try:
        names = OllamaClient(base_url, model).available_models()
        if model not in names:
            return f"Ollama is running, but {model} is not downloaded. Run: ollama pull {model}", False
        return f"Ready · {model}", True
    except (OllamaError, ValueError) as exc:
        return str(exc), False


with st.sidebar:
    st.subheader("Your learning space")
    learner_ids = [item["id"] for item in learners]
    if st.session_state.get("learner_id") not in learner_ids:
        st.session_state["learner_id"] = learner_ids[0]
    selected_id = st.selectbox("Learner", learner_ids,
                               index=learner_ids.index(st.session_state["learner_id"]),
                               format_func=lambda item_id: next(x["name"] for x in learners if x["id"] == item_id))
    st.session_state["learner_id"] = selected_id
    with st.expander("Add a learner"):
        with st.form("add_learner", clear_on_submit=True):
            new_name = st.text_input("Name", max_chars=40)
            if st.form_submit_button("Create learner"):
                try:
                    st.session_state["learner_id"] = db.get_or_create_learner(DB_PATH, new_name)["id"]
                    st.rerun()
                except ValueError as exc:
                    st.error(str(exc))
    st.divider()
    status, ready = model_status(OLLAMA_URL, MODEL)
    if ready:
        st.success(status)
    else:
        st.warning(status)
    st.caption("AI runs on your computer through Ollama. Your learning history stays in local SQLite.")
    st.caption("The quiz works even if Ollama is offline.")

learner_id = st.session_state["learner_id"]
practice_tab, grammar_tab, challenge_tab, quiz_tab, progress_tab = st.tabs(
    ["💬 Conversation", "✏️ Grammar lab", "🎲 Grammar chat", "🧩 Quick quiz", "📈 Progress & history"]
)

with practice_tab:
    st.header("Conversation practice")
    st.caption("Pick a topic, write a message, and receive a natural reply with a gentle correction.")
    conversations = db.list_conversations(DB_PATH, learner_id)
    options = [None] + [item["id"] for item in conversations]
    session_key = f"conversation_{learner_id}"
    pending_conversation = st.session_state.pop(f"pending_{session_key}", None)
    if pending_conversation is not None:
        st.session_state[session_key] = pending_conversation
    if st.session_state.get(session_key) not in options:
        st.session_state[session_key] = None
    session_col, topic_col = st.columns(2)
    selected_conversation = session_col.selectbox(
        "Practice session", options, key=session_key,
        format_func=lambda value: "＋ New conversation" if value is None else next(
            f"{item['topic']} · {item['created_at'][:10]} · #{item['id']}" for item in conversations if item["id"] == value),
    )
    if selected_conversation is None:
        topic = topic_col.selectbox("Topic", TOPICS)
        messages = []
    else:
        topic = next(item["topic"] for item in conversations if item["id"] == selected_conversation)
        topic_col.caption(f"Topic: {topic}")
        messages = db.list_messages(DB_PATH, selected_conversation)
    draft_key = f"draft_{learner_id}"
    if st.session_state.pop(f"clear_{draft_key}", False):
        st.session_state[draft_key] = ""
    st.subheader("Write your reply")
    with st.form(f"chat_form_{learner_id}", clear_on_submit=False):
        learner_text = st.text_area("Your message", key=draft_key, height=130, max_chars=1200,
                                    placeholder="Type here, for example: I want to tell you about my day.")
        send = st.form_submit_button("Send message", type="primary", disabled=not ready)
    with st.expander("🎙️ Optional voice input"):
        st.caption("Record a short English message. Local transcription requires the optional voice install; the first use downloads a free model.")
        audio = st.audio_input("Record your message", key=f"audio_{learner_id}")
        if st.button("Transcribe recording", disabled=audio is None):
            try:
                from speaksmart.voice import transcribe_wav
                with st.spinner("Transcribing on this computer…"):
                    transcript = transcribe_wav(audio.getvalue())
                if transcript:
                    st.session_state[draft_key] = transcript
                    st.success("Transcript added to the message box. Review it before sending.")
                else:
                    st.warning("No words were detected. Try a clearer recording.")
            except (RuntimeError, ValueError, OSError) as exc:
                st.error(str(exc))

    if send:
        learner_text = learner_text.strip()
        if not learner_text:
            st.warning("Write or record a message first.")
        else:
            try:
                client = OllamaClient(OLLAMA_URL, MODEL)
                with st.spinner("Your tutor is thinking…"):
                    result = client.practice(topic, messages, learner_text)
                conversation_id = selected_conversation or db.create_conversation(DB_PATH, learner_id, topic)
                db.save_exchange(DB_PATH, conversation_id, learner_text, result)
                st.session_state[f"pending_{session_key}"] = conversation_id
                st.session_state[f"clear_{draft_key}"] = True
                st.rerun()
            except (OllamaError, ValueError) as exc:
                st.error(str(exc))

    if messages:
        st.subheader("Your conversation")
        for message in messages:
            with st.chat_message(message["role"]):
                st.write(message["content"])
                if message["role"] == "assistant":
                    if message["correction"]:
                        st.markdown(f"**Better way to say it:** {message['correction']}")
                    if message["explanation"]:
                        st.caption(f"Why: {message['explanation']}")
                    if message["tip"]:
                        st.caption(f"Tip: {message['tip']}")

with grammar_tab:
    st.header("Grammar lab")
    st.caption("Paste one sentence or a short paragraph. SpeakSmart preserves your meaning and explains the changes.")
    with st.form(f"grammar_form_{learner_id}"):
        grammar_text = st.text_area("Text to check", height=130, max_chars=1200,
                                    placeholder="Example: She go to college yesterday.")
        check = st.form_submit_button("Check grammar", type="primary", disabled=not ready)
    if check:
        if not grammar_text.strip():
            st.warning("Enter some text to check.")
        else:
            try:
                with st.spinner("Checking your grammar…"):
                    result = OllamaClient(OLLAMA_URL, MODEL).grammar(grammar_text.strip())
                db.save_grammar_check(DB_PATH, learner_id, grammar_text.strip(), result)
                st.session_state[f"grammar_result_{learner_id}"] = result
            except (OllamaError, ValueError) as exc:
                st.error(str(exc))
    result = st.session_state.get(f"grammar_result_{learner_id}")
    if result:
        st.success(result["corrected"])
        st.markdown(f"**Explanation:** {result['explanation']}")
        st.markdown("**More examples**")
        for example in result["examples"]:
            st.write(f"• {example}")

with challenge_tab:
    st.header("Random grammar chat")
    st.caption("ALTRON asks a random grammar question. The answer key is checked locally; Ollama adds a short explanation and answers follow-up questions.")
    grammar_questions = [q for q in load_questions() if q["category"] == "Grammar"]
    challenge_key = f"challenge_question_{learner_id}"
    answer_key = f"challenge_answer_{learner_id}"
    chat_key = f"challenge_chat_{learner_id}"
    round_key = f"challenge_round_{learner_id}"
    round_index = st.session_state.get(round_key, 0)
    if challenge_key not in st.session_state:
        st.session_state[challenge_key] = pick_random_question(grammar_questions)
    question = st.session_state[challenge_key]
    if st.button("Ask another random grammar question", key=f"new_challenge_{learner_id}"):
        st.session_state[challenge_key] = pick_random_question(grammar_questions, question["id"])
        st.session_state[round_key] = round_index + 1
        st.session_state.pop(answer_key, None)
        st.session_state.pop(chat_key, None)
        st.rerun()
    with st.chat_message("assistant"):
        st.write(question["question"])
    answer_state = st.session_state.get(answer_key)
    with st.form(f"challenge_form_{learner_id}_{round_index}"):
        selected = st.radio("Your answer", ["Choose an answer…"] + question["options"],
                            key=f"challenge_choice_{learner_id}_{round_index}")
        send_answer = st.form_submit_button("Answer ALTRON", type="primary", disabled=answer_state is not None)
    if send_answer:
        if selected == "Choose an answer…":
            st.warning("Choose an answer first.")
        else:
            choice = question["options"].index(selected)
            correct = grade(question, choice)
            db.save_quiz_attempt(DB_PATH, learner_id, question["id"], choice, correct)
            reply = ""
            learner_prompt = f"I chose: {selected}. Please explain this grammar rule simply."
            if ready:
                try:
                    with st.spinner("ALTRON is thinking…"):
                        reply = OllamaClient(OLLAMA_URL, MODEL).grammar_chat(question, choice, learner_prompt)
                except (OllamaError, ValueError) as exc:
                    st.warning(f"The saved answer is ready, but ALTRON could not add a reply: {exc}")
            st.session_state[answer_key] = {"choice": choice, "reply": reply}
            st.session_state[chat_key] = ([{"role": "user", "content": learner_prompt},
                                           {"role": "assistant", "content": reply}] if reply else [])
            st.rerun()
    if answer_state is not None:
        choice = answer_state["choice"]
        with st.chat_message("user"):
            st.write(question["options"][choice])
        if grade(question, choice):
            st.success("Correct! 🎉")
        else:
            st.error(f"The correct answer is: {question['options'][question['answer']]}")
        st.info(f"Teacher-checked reason: {question['explanation']}")
        if question.get("example"):
            st.caption(f"Checked example: {question['example']}")
        if answer_state["reply"]:
            with st.chat_message("assistant"):
                st.write(answer_state["reply"])
                st.caption("Extra explanation from local Ollama")
        history = st.session_state.get(chat_key, [])
        for message in history[2:]:
            with st.chat_message(message["role"]):
                st.write(message["content"])
        if ready:
            with st.form(f"challenge_followup_{learner_id}_{round_index}", clear_on_submit=True):
                follow_up = st.text_input("Ask ALTRON about this rule", max_chars=500,
                                          placeholder="Why do we use this word?")
                ask = st.form_submit_button("Ask follow-up")
            if ask and follow_up.strip():
                try:
                    with st.spinner("ALTRON is thinking…"):
                        reply = OllamaClient(OLLAMA_URL, MODEL).grammar_chat(
                            question, choice, follow_up.strip(), history)
                    st.session_state[chat_key] = history + [
                        {"role": "user", "content": follow_up.strip()},
                        {"role": "assistant", "content": reply},
                    ]
                    st.rerun()
                except (OllamaError, ValueError) as exc:
                    st.error(str(exc))
        else:
            st.caption("Start Ollama to ask ALTRON a follow-up. The checked answer works offline.")

with quiz_tab:
    st.header("Quick quiz")
    st.caption("Short curated questions give instant feedback without an internet connection or model.")
    questions = load_questions()
    category = st.selectbox("Category", ["Grammar", "Vocabulary"])
    group = [q for q in questions if q["category"] == category]
    index_key = f"quiz_index_{learner_id}_{category}"
    feedback_key = f"quiz_feedback_{learner_id}_{category}"
    index = st.session_state.get(index_key, 0)
    if index >= len(group):
        st.success("You finished this set. Nice work!")
        if st.button("Practice this set again"):
            st.session_state[index_key] = 0
            st.session_state.pop(feedback_key, None)
            st.rerun()
    else:
        question = group[index]
        st.progress(index / len(group), text=f"Question {index + 1} of {len(group)}")
        st.subheader(question["question"])
        selected = st.radio("Choose one answer", ["Select an answer…"] + question["options"],
                            key=f"choice_{learner_id}_{category}_{index}")
        feedback = st.session_state.get(feedback_key)
        if st.button("Check answer", type="primary", disabled=feedback is not None):
            if selected == "Select an answer…":
                st.warning("Choose an answer first.")
            else:
                choice = question["options"].index(selected)
                correct = grade(question, choice)
                db.save_quiz_attempt(DB_PATH, learner_id, question["id"], choice, correct)
                st.session_state[feedback_key] = correct
                st.rerun()
        if feedback is not None:
            if feedback:
                st.success("Correct! 🎉")
            else:
                st.error(f"Not quite. The answer is: {question['options'][question['answer']]}")
            st.info(question["explanation"])
            if st.button("Next question"):
                st.session_state[index_key] = index + 1
                st.session_state.pop(feedback_key, None)
                st.rerun()

with progress_tab:
    st.header("Progress & history")
    goal = db.get_daily_goal(DB_PATH, learner_id)
    today = db.daily_progress(DB_PATH, learner_id)
    st.subheader("Today's practice goal")
    st.progress(min(today["total"] / goal, 1.0), text=f"{today['total']} of {goal} activities completed today")
    st.caption(f"{today['turns']} conversation messages · {today['grammar_checks']} grammar checks · {today['quiz_answers']} quiz answers. Day: {today['date']} on this computer.")
    with st.form(f"daily_goal_form_{learner_id}"):
        chosen_goal = st.number_input("Daily activity goal", min_value=1, max_value=50, value=goal, step=1)
        if st.form_submit_button("Save daily goal"):
            db.set_daily_goal(DB_PATH, learner_id, int(chosen_goal))
            st.rerun()
    stats = db.progress(DB_PATH, learner_id)
    cols = st.columns(4)
    cols[0].metric("Conversations", stats["conversations"])
    cols[1].metric("Messages practiced", stats["turns"])
    cols[2].metric("Grammar checks", stats["grammar_checks"])
    cols[3].metric("Quiz accuracy", f"{stats['accuracy']}%" if stats["quiz_attempts"] else "—")
    st.caption(f"Quiz answers: {stats['correct']} correct out of {stats['quiz_attempts']} attempts. Accuracy is a practice indicator, not a proficiency score.")
    st.subheader("Recent quiz attempts")
    attempts = db.list_quiz_attempts(DB_PATH, learner_id)
    if attempts:
        for row in attempts:
            label = "✅ Correct" if row["is_correct"] else "↻ Try again"
            st.write(f"{row['created_at'].replace('T', ' ')[:16]} UTC · {row['question_id']} · {label}")
    else:
        st.info("No quiz attempts yet. Try a quick question!")
    st.subheader("Recent grammar checks")
    checks = db.list_grammar_checks(DB_PATH, learner_id)
    if checks:
        for row in checks:
            with st.expander(f"{row['created_at'][:10]} · {row['original'][:70]}"):
                st.write(f"**Original:** {row['original']}")
                st.write(f"**Corrected:** {row['corrected']}")
                st.write(f"**Explanation:** {row['explanation']}")
    else:
        st.info("Your grammar checks will appear here.")
    st.caption("Past conversations can be reopened from the Conversation tab.")

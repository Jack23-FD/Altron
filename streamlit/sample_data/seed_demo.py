"""Add clearly labeled example history to an otherwise empty Demo Learner profile."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from speaksmart import db  # noqa: E402


def main():
    db_path = ROOT / "data" / "speaksmart.db"
    db.init_db(db_path)
    learner = db.get_or_create_learner(db_path, "Demo Learner")
    stats = db.progress(db_path, learner["id"])
    if any(stats[key] for key in ("conversations", "grammar_checks", "quiz_attempts")):
        print("Demo Learner already has history; no sample records added.")
        return
    conversation = db.create_conversation(db_path, learner["id"], "Everyday life")
    db.save_exchange(db_path, conversation, "Yesterday I go to the library.", {
        "reply": "That sounds productive! What did you read at the library?",
        "correction": "Yesterday I went to the library.",
        "explanation": "Use went, the past tense of go, for yesterday.",
        "tip": "Try: I borrowed a book about...",
    })
    db.save_grammar_check(db_path, learner["id"], "She go to college every day.", {
        "corrected": "She goes to college every day.",
        "explanation": "Use goes with she in the simple present tense.",
        "examples": ["He walks to class.", "My friend studies English."],
    })
    db.save_quiz_attempt(db_path, learner["id"], "G01", 1, True)
    print("Added one labeled sample conversation, grammar check, and quiz attempt.")


if __name__ == "__main__":
    main()

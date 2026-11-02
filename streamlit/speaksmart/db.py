"""SQLite persistence. One connection is opened per operation for Streamlit reruns."""

import sqlite3
from contextlib import contextmanager
from datetime import datetime, time, timedelta, timezone
from pathlib import Path


@contextmanager
def _connect(db_path):
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def init_db(db_path):
    with _connect(db_path) as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS learners (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL COLLATE NOCASE UNIQUE,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY,
                learner_id INTEGER NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
                topic TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY,
                conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                role TEXT NOT NULL CHECK(role IN ('user','assistant')),
                content TEXT NOT NULL,
                correction TEXT NOT NULL DEFAULT '',
                explanation TEXT NOT NULL DEFAULT '',
                tip TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS grammar_checks (
                id INTEGER PRIMARY KEY,
                learner_id INTEGER NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
                original TEXT NOT NULL,
                corrected TEXT NOT NULL,
                explanation TEXT NOT NULL,
                examples TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS quiz_attempts (
                id INTEGER PRIMARY KEY,
                learner_id INTEGER NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
                question_id TEXT NOT NULL,
                selected_index INTEGER NOT NULL,
                is_correct INTEGER NOT NULL CHECK(is_correct IN (0,1)),
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS learner_settings (
                learner_id INTEGER PRIMARY KEY REFERENCES learners(id) ON DELETE CASCADE,
                daily_goal INTEGER NOT NULL DEFAULT 5 CHECK(daily_goal BETWEEN 1 AND 50)
            );
            CREATE INDEX IF NOT EXISTS idx_conversations_learner ON conversations(learner_id);
            CREATE INDEX IF NOT EXISTS idx_attempts_learner ON quiz_attempts(learner_id);
        """)


def get_or_create_learner(db_path, name):
    name = " ".join(name.split())
    if not 1 <= len(name) <= 40:
        raise ValueError("Name must contain 1 to 40 characters")
    with _connect(db_path) as db:
        db.execute("INSERT OR IGNORE INTO learners (name, created_at) VALUES (?, ?)", (name, _now()))
        return dict(db.execute("SELECT id, name FROM learners WHERE name = ? COLLATE NOCASE", (name,)).fetchone())


def list_learners(db_path):
    with _connect(db_path) as db:
        return [dict(row) for row in db.execute("SELECT id, name FROM learners ORDER BY name")]


def create_conversation(db_path, learner_id, topic):
    with _connect(db_path) as db:
        cursor = db.execute(
            "INSERT INTO conversations (learner_id, topic, created_at) VALUES (?, ?, ?)",
            (learner_id, topic, _now()),
        )
        return cursor.lastrowid


def list_conversations(db_path, learner_id):
    with _connect(db_path) as db:
        return [dict(row) for row in db.execute(
            "SELECT id, topic, created_at FROM conversations WHERE learner_id = ? ORDER BY id DESC",
            (learner_id,),
        )]


def list_messages(db_path, conversation_id):
    with _connect(db_path) as db:
        return [dict(row) for row in db.execute(
            "SELECT role, content, correction, explanation, tip, created_at FROM messages "
            "WHERE conversation_id = ? ORDER BY id", (conversation_id,),
        )]


def save_exchange(db_path, conversation_id, learner_text, result):
    now = _now()
    with _connect(db_path) as db:
        db.execute("INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, 'user', ?, ?)",
                   (conversation_id, learner_text, now))
        db.execute("""INSERT INTO messages
            (conversation_id, role, content, correction, explanation, tip, created_at)
            VALUES (?, 'assistant', ?, ?, ?, ?, ?)""",
            (conversation_id, result["reply"], result["correction"], result["explanation"], result["tip"], now))


def save_grammar_check(db_path, learner_id, original, result):
    with _connect(db_path) as db:
        db.execute("""INSERT INTO grammar_checks
            (learner_id, original, corrected, explanation, examples, created_at)
            VALUES (?, ?, ?, ?, ?, ?)""",
            (learner_id, original, result["corrected"], result["explanation"],
             "\n".join(result["examples"]), _now()))


def list_grammar_checks(db_path, learner_id, limit=20):
    with _connect(db_path) as db:
        return [dict(row) for row in db.execute(
            "SELECT original, corrected, explanation, examples, created_at FROM grammar_checks "
            "WHERE learner_id = ? ORDER BY id DESC LIMIT ?", (learner_id, limit),
        )]


def save_quiz_attempt(db_path, learner_id, question_id, selected_index, is_correct):
    with _connect(db_path) as db:
        db.execute("""INSERT INTO quiz_attempts
            (learner_id, question_id, selected_index, is_correct, created_at)
            VALUES (?, ?, ?, ?, ?)""",
            (learner_id, question_id, selected_index, int(is_correct), _now()))


def list_quiz_attempts(db_path, learner_id, limit=50):
    with _connect(db_path) as db:
        return [dict(row) for row in db.execute(
            "SELECT question_id, selected_index, is_correct, created_at FROM quiz_attempts "
            "WHERE learner_id = ? ORDER BY id DESC LIMIT ?", (learner_id, limit),
        )]


def progress(db_path, learner_id):
    with _connect(db_path) as db:
        conversations = db.execute("SELECT COUNT(*) FROM conversations WHERE learner_id = ?", (learner_id,)).fetchone()[0]
        turns = db.execute("""SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id
            WHERE c.learner_id = ? AND m.role = 'user'""", (learner_id,)).fetchone()[0]
        checks = db.execute("SELECT COUNT(*) FROM grammar_checks WHERE learner_id = ?", (learner_id,)).fetchone()[0]
        attempts, correct = db.execute("SELECT COUNT(*), COALESCE(SUM(is_correct),0) FROM quiz_attempts WHERE learner_id = ?",
                                       (learner_id,)).fetchone()
        return {"conversations": conversations, "turns": turns, "grammar_checks": checks,
                "quiz_attempts": attempts, "correct": correct,
                "accuracy": round(correct / attempts * 100) if attempts else 0}


def get_daily_goal(db_path, learner_id):
    with _connect(db_path) as db:
        row = db.execute("SELECT daily_goal FROM learner_settings WHERE learner_id = ?", (learner_id,)).fetchone()
        return row[0] if row else 5


def set_daily_goal(db_path, learner_id, goal):
    if not isinstance(goal, int) or not 1 <= goal <= 50:
        raise ValueError("Daily goal must be between 1 and 50")
    with _connect(db_path) as db:
        db.execute("""INSERT INTO learner_settings (learner_id, daily_goal) VALUES (?, ?)
            ON CONFLICT(learner_id) DO UPDATE SET daily_goal = excluded.daily_goal""", (learner_id, goal))


def daily_progress(db_path, learner_id, day=None):
    """Count today's completed actions using the computer's local calendar day."""
    day = day or datetime.now().astimezone().date()
    local_zone = datetime.now().astimezone().tzinfo
    start = datetime.combine(day, time.min, local_zone).astimezone(timezone.utc).isoformat(timespec="seconds")
    end = datetime.combine(day + timedelta(days=1), time.min, local_zone).astimezone(timezone.utc).isoformat(timespec="seconds")
    with _connect(db_path) as db:
        turns = db.execute("""SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id
            WHERE c.learner_id = ? AND m.role = 'user' AND m.created_at >= ? AND m.created_at < ?""",
            (learner_id, start, end)).fetchone()[0]
        checks = db.execute("SELECT COUNT(*) FROM grammar_checks WHERE learner_id = ? AND created_at >= ? AND created_at < ?",
                            (learner_id, start, end)).fetchone()[0]
        quizzes = db.execute("SELECT COUNT(*) FROM quiz_attempts WHERE learner_id = ? AND created_at >= ? AND created_at < ?",
                             (learner_id, start, end)).fetchone()[0]
        return {"date": day.isoformat(), "turns": turns, "grammar_checks": checks,
                "quiz_answers": quizzes, "total": turns + checks + quizzes}

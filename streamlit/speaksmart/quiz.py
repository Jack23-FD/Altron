"""A small curated question bank that works without an AI model."""

import json
import random
from pathlib import Path

QUESTIONS_FILE = Path(__file__).resolve().parent.parent / "sample_data" / "questions.json"


def load_questions(path=QUESTIONS_FILE):
    with open(path, encoding="utf-8") as file:
        questions = json.load(file)
    for question in questions:
        if len(question["options"]) != 4 or not 0 <= question["answer"] < 4:
            raise ValueError(f"Invalid answer choices in {question['id']}")
    return questions


def grade(question, selected_index):
    if not 0 <= selected_index < len(question["options"]):
        raise ValueError("Selected answer is outside the available options")
    return selected_index == question["answer"]


def pick_random_question(questions, previous_id=None, rng=None):
    """Choose a question without repeating the last one when alternatives exist."""
    if not questions:
        raise ValueError("No questions are available")
    choices = [question for question in questions if question["id"] != previous_id]
    return (rng or random).choice(choices or questions)

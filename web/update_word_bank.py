"""Refresh Jack's bundled vocabulary from the free Dictionary API."""

import json
from pathlib import Path

import requests


WORDS = (
    "generous", "fragile", "grateful", "cautious", "diligent", "enormous",
    "brief", "vivid", "ancient", "reliable", "curious", "peaceful",
)
API = "https://api.dictionaryapi.dev/api/v2/entries/en/"
OUTPUT = Path(__file__).resolve().parent / "public" / "word_bank.json"


def definition_for(word):
    response = requests.get(API + word, timeout=20)
    response.raise_for_status()
    entries = response.json()
    for entry in entries:
        for meaning in entry.get("meanings", []):
            if meaning.get("partOfSpeech") != "adjective":
                continue
            for item in meaning.get("definitions", []):
                definition = item.get("definition", "").strip()
                if 10 <= len(definition) <= 180:
                    return definition
    raise ValueError(f"No suitable adjective definition for {word}")


def main():
    words = []
    for word in WORDS:
        try:
            words.append([word, definition_for(word)])
        except (requests.RequestException, ValueError) as error:
            print(f"Skipping {word}: {error}")
    if len(words) < 6:
        raise RuntimeError("Too few dictionary definitions were available; old word bank is unchanged")
    OUTPUT.write_text(json.dumps(words, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {len(words)} API definitions to {OUTPUT}")


if __name__ == "__main__":
    main()

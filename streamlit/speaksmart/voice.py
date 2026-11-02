"""Optional local speech transcription; dependencies load only when requested."""

import os
import tempfile
from functools import lru_cache


@lru_cache(maxsize=1)
def _model():
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise RuntimeError("Install optional voice support: pip install -r requirements-voice.txt") from exc
    return WhisperModel("tiny.en", device="cpu", compute_type="int8")


def transcribe_wav(wav_bytes):
    if not wav_bytes:
        raise ValueError("Record audio before transcribing.")
    path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as file:
            file.write(wav_bytes)
            path = file.name
        segments, _ = _model().transcribe(path, language="en", beam_size=1)
        return " ".join(segment.text.strip() for segment in segments).strip()
    finally:
        if path and os.path.exists(path):
            os.remove(path)

"""Transcribe one short learner recording with a local Whisper model."""

import json
import sys
from pathlib import Path

import av
from faster_whisper import WhisperModel


HERE = Path(__file__).resolve().parent
MODEL_CACHE = HERE / "model-cache"
MODEL_NAME = "base"


def model() -> WhisperModel:
    MODEL_CACHE.mkdir(exist_ok=True)
    return WhisperModel(MODEL_NAME, device="cpu", compute_type="int8", download_root=str(MODEL_CACHE))


def main() -> int:
    if len(sys.argv) == 2 and sys.argv[1] == "--warmup":
        model()
        (HERE / ".voice-ready-base").write_text("base\n", encoding="utf-8")
        print(json.dumps({"ready": True, "model": MODEL_NAME}))
        return 0
    if len(sys.argv) != 3 or sys.argv[2] not in ("en", "ta"):
        print("Usage: transcribe.py AUDIO_FILE en|ta", file=sys.stderr)
        return 2
    audio_path = Path(sys.argv[1])
    language = sys.argv[2]
    if not audio_path.is_file():
        print("Audio file not found", file=sys.stderr)
        return 2
    duration = 0.0
    with av.open(str(audio_path)) as container:
        for frame in container.decode(audio=0):
            duration += frame.samples / frame.sample_rate
            if duration > 25:
                raise ValueError("Recording exceeds 25 seconds")
    if duration < 0.2:
        raise ValueError("Recording is too short")
    segments, _ = model().transcribe(
        str(audio_path), language=language, beam_size=3,
        condition_on_previous_text=False,
    )
    text = " ".join(segment.text.strip() for segment in segments).strip()
    print(json.dumps({"text": text[:1200], "language": language}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Speech recognition failed: {exc}", file=sys.stderr)
        raise SystemExit(1)

"""Kokoro TtsProvider implementation.

Japanese-only for now (this app only reads Japanese EPUBs). Constructing
KPipeline loads a ~327MB PyTorch model (auto-downloaded from Hugging Face
Hub on first use, see CLAUDE.md) and the full-UniDic-backed misaki Japanese
tokenizer -- expensive enough that this should be constructed once and
reused, not per-request. See backend/README.md for the one-time full-UniDic
setup step this requires.
"""

import io
from importlib.metadata import version as pkg_version

import soundfile as sf
import torch
from kokoro import KPipeline

from app.tts.base import TtsDescriptor, TtsProvider

_SAMPLE_RATE = 24000


class KokoroProvider(TtsProvider):
    def __init__(self) -> None:
        self._pipeline = KPipeline(lang_code="j")

    def synthesize(self, text: str, voice: str, speed: float, lang: str, **settings: object) -> bytes:
        if lang != "ja":
            raise ValueError(f"KokoroProvider only supports lang='ja', got {lang!r}")

        chunks = [audio for _, _, audio in self._pipeline(text, voice=voice, speed=speed)]
        if not chunks:
            raise RuntimeError(f"Kokoro produced no audio for: {text!r}")

        audio = chunks[0] if len(chunks) == 1 else torch.cat(chunks)

        buffer = io.BytesIO()
        sf.write(buffer, audio.numpy(), _SAMPLE_RATE, format="WAV")
        return buffer.getvalue()

    def descriptor(self) -> TtsDescriptor:
        return TtsDescriptor(model="kokoro-82m", version=pkg_version("kokoro"))


_provider: KokoroProvider | None = None


def get_provider() -> KokoroProvider:
    # Lazy, not a module-level singleton like dictionary.py's _jam or
    # morphology.py's _tagger: constructing KPipeline is expensive (loads a
    # PyTorch model) and importing this module shouldn't force every test
    # run or app startup to pay that cost before anything actually needs TTS.
    global _provider
    if _provider is None:
        _provider = KokoroProvider()
    return _provider

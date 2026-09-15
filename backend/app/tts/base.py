"""Provider interface for text-to-speech backends.

Kokoro is the only implementation for now; VOICEVOX, AivisSpeech, and macOS
say/AVSpeechSynthesizer are meant to implement this same interface later
without reshaping the reader (see CLAUDE.md).
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class TtsDescriptor:
    model: str
    version: str


class TtsProvider(ABC):
    @abstractmethod
    def synthesize(self, text: str, voice: str, speed: float, lang: str, **settings: object) -> bytes:
        """Synthesize `text` and return encoded audio bytes."""

    @abstractmethod
    def descriptor(self) -> TtsDescriptor:
        """Report the model + version producing this provider's audio.

        Used as part of the TTS cache key, so re-tuning a setting or
        bumping a model version correctly misses the cache instead of
        serving stale audio (see CLAUDE.md).
        """

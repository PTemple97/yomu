from app.tts.base import TtsDescriptor, TtsProvider
from app.tts.cache import synthesize_cached


class FakeProvider(TtsProvider):
    def __init__(self) -> None:
        self.call_count = 0

    def synthesize(self, text: str, voice: str, speed: float, lang: str, **settings: object) -> bytes:
        self.call_count += 1
        return f"audio:{text}:{voice}:{speed}:{lang}".encode()

    def descriptor(self) -> TtsDescriptor:
        return TtsDescriptor(model="fake", version="1")


def test_repeat_identical_request_only_calls_synthesize_once(isolate_tts_cache) -> None:
    provider = FakeProvider()

    first = synthesize_cached(provider, "こんにちは", voice="jf_alpha", speed=1.0, lang="ja")
    second = synthesize_cached(provider, "こんにちは", voice="jf_alpha", speed=1.0, lang="ja")

    assert first == second
    assert provider.call_count == 1


def test_changing_speed_misses_the_cache(isolate_tts_cache) -> None:
    provider = FakeProvider()

    synthesize_cached(provider, "こんにちは", voice="jf_alpha", speed=1.0, lang="ja")
    synthesize_cached(provider, "こんにちは", voice="jf_alpha", speed=1.2, lang="ja")

    assert provider.call_count == 2


def test_changing_voice_misses_the_cache(isolate_tts_cache) -> None:
    provider = FakeProvider()

    synthesize_cached(provider, "こんにちは", voice="jf_alpha", speed=1.0, lang="ja")
    synthesize_cached(provider, "こんにちは", voice="jm_kumo", speed=1.0, lang="ja")

    assert provider.call_count == 2


def test_changing_text_misses_the_cache(isolate_tts_cache) -> None:
    provider = FakeProvider()

    synthesize_cached(provider, "こんにちは", voice="jf_alpha", speed=1.0, lang="ja")
    synthesize_cached(provider, "さようなら", voice="jf_alpha", speed=1.0, lang="ja")

    assert provider.call_count == 2

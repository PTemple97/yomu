import pytest

from app.tts.kokoro_provider import KokoroProvider


@pytest.fixture(scope="module")
def provider() -> KokoroProvider:
    # Constructing this loads the Kokoro model + Japanese tokenizer once and
    # shares it across this file's tests -- slow (real model, real
    # synthesis, no mocking), by design: this is meant to catch real setup
    # problems (missing UniDic data, a broken model download), not just
    # exercise a mock.
    return KokoroProvider()


def test_synthesize_returns_non_empty_wav_bytes(provider: KokoroProvider) -> None:
    audio = provider.synthesize("猫が窓辺で寝ている。", voice="jf_alpha", speed=1.0, lang="ja")

    assert isinstance(audio, bytes)
    assert len(audio) > 0
    assert audio[:4] == b"RIFF"  # WAV container


def test_descriptor_reports_model_and_version(provider: KokoroProvider) -> None:
    descriptor = provider.descriptor()

    assert descriptor.model
    assert descriptor.version


def test_synthesize_rejects_non_japanese_lang(provider: KokoroProvider) -> None:
    with pytest.raises(ValueError, match="ja"):
        provider.synthesize("hello", voice="af_heart", speed=1.0, lang="en")

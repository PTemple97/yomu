import pytest

from app.tts import cache as tts_cache


@pytest.fixture
def isolate_tts_cache(tmp_path, monkeypatch):
    """Redirects the TTS cache's DB/audio paths to a per-test tmp dir.

    Without this, tests would read/write backend/data/tts_cache.db for real,
    leaking cache entries between test runs.
    """
    data_dir = tmp_path / "data"
    monkeypatch.setattr(tts_cache, "_DATA_DIR", data_dir)
    monkeypatch.setattr(tts_cache, "_DB_PATH", data_dir / "tts_cache.db")
    monkeypatch.setattr(tts_cache, "_AUDIO_DIR", data_dir / "tts_audio")

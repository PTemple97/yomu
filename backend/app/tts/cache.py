"""On-disk cache for synthesized TTS audio.

Keyed by a hash of (model, model version, voice, speed, language, the
normalized sentence text) -- not just voice + text, per CLAUDE.md: re-tuning
speed or bumping a model version must correctly miss the cache rather than
serve stale audio.

Opens a fresh sqlite3 connection per call rather than keeping one open at
module scope: FastAPI runs sync route handlers on a thread pool, and a
persistent connection can be handed a request on a different thread than the
one that created it, which sqlite3 forbids -- hit this exact bug with
jamdict in app/dictionary.py (see its reuse_ctx=False comment).
"""

import hashlib
import sqlite3
from contextlib import closing
from pathlib import Path

from app.tts.base import TtsProvider

_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
_DB_PATH = _DATA_DIR / "tts_cache.db"
_AUDIO_DIR = _DATA_DIR / "tts_audio"


def _connect() -> sqlite3.Connection:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    _AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(_DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS tts_cache (
            cache_key TEXT PRIMARY KEY,
            audio_path TEXT NOT NULL
        )
        """
    )
    return conn


def compute_cache_key(model: str, model_version: str, voice: str, speed: float, lang: str, text: str) -> str:
    # \x1f (unit separator) between fields, not a printable delimiter like
    # "|", so a field value containing the delimiter can't collide two
    # otherwise-different keys.
    raw = "\x1f".join([model, model_version, voice, repr(speed), lang, text])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def get_cached_audio(cache_key: str) -> bytes | None:
    with closing(_connect()) as conn:
        row = conn.execute("SELECT audio_path FROM tts_cache WHERE cache_key = ?", (cache_key,)).fetchone()

    if row is None:
        return None

    path = Path(row[0])
    if not path.is_file():
        return None

    return path.read_bytes()


def store_audio(cache_key: str, audio_bytes: bytes) -> None:
    path = _AUDIO_DIR / f"{cache_key}.wav"
    path.write_bytes(audio_bytes)

    with closing(_connect()) as conn:
        conn.execute(
            "INSERT OR REPLACE INTO tts_cache (cache_key, audio_path) VALUES (?, ?)",
            (cache_key, str(path)),
        )
        conn.commit()


def synthesize_cached(provider: TtsProvider, text: str, voice: str, speed: float, lang: str) -> bytes:
    descriptor = provider.descriptor()
    cache_key = compute_cache_key(descriptor.model, descriptor.version, voice, speed, lang, text)

    cached = get_cached_audio(cache_key)
    if cached is not None:
        return cached

    audio = provider.synthesize(text, voice=voice, speed=speed, lang=lang)
    store_audio(cache_key, audio)
    return audio

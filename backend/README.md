# backend

Python + FastAPI backend for yomu. See the repo root `CLAUDE.md` for
architecture.

## Setup

```
uv sync
```

## Running

```
uv run uvicorn app.main:app --reload
```

## Tests

```
uv run pytest
```

## One-time TTS setup: the full UniDic dictionary

Japanese TTS (`app/tts/kokoro_provider.py`) goes through `misaki[ja]`, which
uses `Cutlet` -> `fugashi` -> `mecab` for tokenization. This is a **different
dictionary than the one `app/morphology.py` uses** for word segmentation:

- `app/morphology.py` uses `unidic-lite` -- a small dictionary bundled
  directly in the pip package, no extra setup.
- `misaki[ja]` (TTS only) needs the **full `unidic` package** instead. The
  `unidic` pip package itself is just a downloader shim; the actual
  dictionary data (~526MB) is not included and must be fetched separately:

  ```
  uv run python -m unidic download
  ```

  Without this step, constructing a Japanese `KPipeline` fails immediately
  with `RuntimeError: Failed initializing MeCab` (it can't find
  `unidic/dicdir/mecabrc`).

This is a **manual, one-time step** -- intentionally not auto-triggered by
the app on startup, since it's a ~526MB download and failures should be
visible/actionable during setup, not surprise a request at runtime.

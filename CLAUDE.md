# yomu — Japanese EPUB reader with local TTS, lookup, and Anki mining

A local-first Mac app: read Japanese EPUBs, hear them read aloud via local TTS,
tap a word to see its dictionary entry, and mine words straight into Anki.
Python backend, TypeScript/epub.js frontend, everything running on localhost.

## Architecture Principles

**The frontend owns normalization.**
The DOM only exists in the browser. The frontend walks the rendered epub.js
DOM, produces one canonical normalized text string, and records an offset map
(a sorted array of runs: `{ node, domStart, domEnd, normStart, normEnd }`)
tying every normalized character back to its DOM origin. The backend never
sees the DOM — it receives a string and returns sentences/tokens as
`[start, end)` offset ranges into that exact string. It does not re-normalize
in a way that shifts offsets.

Segmentation and tokenization are a pure function of the normalized string —
no DOM access, no side effects, deterministic given the same input. This
applies to that code path specifically; the backend as a whole is stateful
(SQLite, cached audio, the mining queue) — see Component Map.

**Code points, not UTF-16 units, are the canonical offset unit.**
JS strings are UTF-16; Python strings are code points. A supplementary-plane
kanji is two UTF-16 units but one code point — this desyncs offsets silently
on exactly the rare kanji a learner most wants to look up. On the JS side,
always iterate with `Array.from(str)` or spread, never `.length`/`.charAt`/
`.slice`. There must be a test with a CJK Ext-B character locking this down.

**Ruby/furigana handling.** Walking `<ruby>漢字<rt>かんじ</rt></ruby>`: emit
the base text into the normalized buffer, skip `rt`/`rp` contents entirely.
Furigana is an annotation, not reading-order text.

**Sentence segmentation and morphological tokenization are separate
components.** `SentenceSegmenter` runs first over the whole normalized string
and defines the TTS/highlight units (rule-based: 。！？ plus closing brackets
」』）, with DOM block boundaries as hard breaks). A morphological tokenizer
runs *within* each sentence to produce word boundaries, lemmas, readings, and
POS. Neither depends on the other's internals — segmentation must work even
with a stub tokenizer, and tokenization must not need sentence boundaries to
function.

Morphology uses fugashi (MeCab) as the default tokenizer for M1. Sudachi is a
candidate alternative (better handling of some proper nouns/neologisms) but
not implemented. Unlike TTS, there's no provider interface here yet —
introduce one only if a second tokenizer actually becomes necessary.

**Durable anchors vs runtime identity.** The offset run array is rebuilt per
section render — it's runtime-only. For anything persisted (highlights,
reading position, the sentence a card was mined from), convert the DOM Range
to an EPUB CFI via epub.js's `cfiFromRange`. Model IDs: sentences are
`sectionHref#s{index}`, tokens are `{sentenceId}.t{index}` (deterministic
given deterministic segmentation). CFI is what gets written to disk.

**Click resolution.** `caretRangeFromPoint(x, y)` (note: WebKit/Safari
spelling, relevant since this runs in a Mac webview) → DOM node+offset → run
array → normalized offset → the token whose range contains it.

**Highlighting uses the CSS Custom Highlight API**, not span-wrapping — a
`Highlight` over a Range doesn't mutate the DOM, so it can't corrupt the
frontend's own offset map.

**JMdict results and LLM-generated explanations are different types, never
merged.** `LexicalEntry` (deterministic, from `jamdict`, keyed by lemma) is
the authoritative lexical source and renders first, always. `ContextualExplanation`
(LLM-generated, clearly labeled, generated on demand) is a separate field,
separate UI region, and can never overwrite or blend into dictionary fields.
ContextualExplanation is out of scope for Milestone 1. LexicalEntry (JMdict)
is in scope — see Current Milestone.

**TTS sits behind a provider interface.** `TtsProvider` exposes
`synthesize(text, voice, speed, lang, **settings) → audio + metadata` and a
`descriptor()` reporting model + version. Kokoro, VOICEVOX, AivisSpeech, and
macOS `say`/AVSpeechSynthesizer each implement it; the reader only depends on
the interface. Sentence-level sync only for now — the sentence is both the
TTS unit and the highlight unit. Word-level karaoke-style sync (forced
alignment) is an explicit non-goal unless revisited later.

**TTS cache keys include:** model, model version, voice, speed, language, the
normalized sentence text, and any other synthesis settings — not just
voice + sentence. Re-tuning speed or bumping a model version must correctly
miss the cache rather than serve stale audio.

**Mining never blocks on Anki.** The Mine action always writes to a local
`mining_queue` table (status `pending`) and returns success immediately. A
sync worker (on startup, on an interval, and on manual trigger) probes
AnkiConnect's `version` action and drains pending notes via `addNotes` when
available, using a content hash for idempotency so replay can't double-add.
Anki being closed is a normal state, not an error condition.

## Component Map

- `frontend/` — TypeScript + Vite + epub.js. Renders EPUBs, shows the lookup
  popup. Owns the DOM walk, offset-map construction, click resolution, and
  highlight painting — this is real logic, not thin glue. It asks the
  backend only for segmentation, tokenization, and dictionary lookups; it
  does not duplicate backend logic.
- `backend/` — Python + FastAPI. Services: Library (EPUB ingest via
  ebooklib), SentenceSegmenter, Morphology (fugashi/MeCab), Dictionary
  (JMdict via jamdict), TTS (provider interface), Anki (AnkiConnect +
  mining queue). SQLite for library/position/highlights/token cache/mining
  queue; filesystem for EPUBs and cached TTS audio (keyed by cache hash).

## Conventions

- Python: `uv` for environment/dependency management, `pytest` for tests.
- Frontend: Vite + TypeScript, epub.js for rendering.
- Small, verifiable commits — one behavior, run it, commit, with a real
  message (not "wip").
- Before writing non-trivial code, propose the approach and wait for
  confirmation rather than jumping straight to implementation.

## Current Milestone

**Milestone 1 (small, scoped tightly):** import/render an EPUB section,
build the normalized text + offset run array, POST the string to the
backend, get back sentences + tokens with offsets, resolve a click to a
token, lemmatize it, display its JMdict entry in a popup.

Explicitly out of scope for M1: TTS, Anki mining, LLM contextual
explanations, CFI persistence. The sentence segmenter can be near-trivial
(e.g. one sentence per block) since lookup doesn't need good boundaries yet
— but it must remain its own component so TTS can slot in later without
reshaping anything.

The one non-negotiable for M1: a passing test that round-trips offsets
through a CJK Ext-B (supplementary-plane) character, since every later
milestone assumes offsets are correct.

## Known Follow-ups

- **Reading position uses a single fixed `localStorage` key.** This only
  works because there's exactly one hardcoded book (`/sample.epub`). It needs
  to become a per-book key (e.g. derived from the book's identifier) once a
  real library/multi-book feature exists — otherwise opening a second book
  will silently resume at the first book's saved position.

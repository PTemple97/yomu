"""JMdict lookup via jamdict (backed by the jamdict-data prebuilt sqlite DB)."""

import re
from dataclasses import dataclass

from jamdict import Jamdict

# reuse_ctx=False: by default Jamdict caches one sqlite3 connection across
# calls, opened lazily on whichever thread calls lookup() first. FastAPI runs
# sync route handlers on a thread pool, so a later request can land on a
# different thread than the one that opened it -- sqlite3 connections can't
# cross threads. Disabling reuse makes each lookup() open its own connection
# on the calling thread; that's cheap enough for single-word lookups.
_jam = Jamdict(reuse_ctx=False)


@dataclass(frozen=True)
class LexicalEntry:
    lemma: str
    readings: list[str]
    glosses: list[str]


# JMdict priority tags, grouped by how strongly they signal a common word.
# An entry with no tags at all ranks below both tiers.
_PRIORITY_TIER_1 = {"news1", "ichi1", "spec1", "gai1"}
_PRIORITY_TIER_2 = {"news2", "ichi2", "spec2", "gai2"}


def _priority_tags(entry, lemma: str) -> set[str]:
    # Priority tags belong to a specific kanji/kana form, not the entry as a
    # whole -- e.g. 野's "の" reading is ichi1/news1/nf04, but the same
    # entry's rare alternate reading "や" isn't tagged at all. Only tags on
    # the form matching the queried text count, so a rare reading can't
    # borrow a sibling reading's frequency.
    tags: set[str] = set()
    for form in (*entry.kanji_forms, *entry.kana_forms):
        if form.text == lemma:
            tags.update(form.pri)
    return tags


def _priority_score(entry, lemma: str) -> tuple[int, int]:
    tags = _priority_tags(entry, lemma)
    if tags & _PRIORITY_TIER_1:
        tier = 0
    elif tags & _PRIORITY_TIER_2:
        tier = 1
    else:
        tier = 2

    nf_numbers = [
        int(tag[2:]) for tag in tags if tag.startswith("nf") and tag[2:].isdigit()
    ]
    # Many tier-1 entries (esp. spec1) are common function words that don't
    # fit the news-corpus frequency scheme at all, so they carry no nf
    # number -- that's not evidence of rarity. Treat "no number" as
    # tied-for-best within its tier, not worse than a numbered entry.
    nf_score = min(nf_numbers) if nf_numbers else 0

    return (tier, nf_score)


# Maps Morphology's UniDic-style Japanese POS categories (see
# app/morphology.py) to a whole-word regex over JMdict's English POS tag
# strings. Word boundaries matter: a "動詞" (verb) hint must not match
# "adverb", and "adjective" must not match "adjectival nouns ...".
_POS_HINT_PATTERNS: dict[str, re.Pattern[str]] = {
    "名詞": re.compile(r"\bnoun\b", re.IGNORECASE),
    "動詞": re.compile(r"\bverb\b", re.IGNORECASE),
    "形容詞": re.compile(r"\badjective\b", re.IGNORECASE),
    "形状詞": re.compile(r"\badjectival\b", re.IGNORECASE),
    "副詞": re.compile(r"\badverb\b", re.IGNORECASE),
    "助詞": re.compile(r"\bparticle\b", re.IGNORECASE),
    "助動詞": re.compile(r"\bauxiliary\b", re.IGNORECASE),
    "接続詞": re.compile(r"\bconjunction\b", re.IGNORECASE),
    "連体詞": re.compile(r"\badnominal\b", re.IGNORECASE),
    "感動詞": re.compile(r"\binterjection\b", re.IGNORECASE),
    "代名詞": re.compile(r"\bpronoun\b", re.IGNORECASE),
    "接頭辞": re.compile(r"\bprefix\b", re.IGNORECASE),
    "接尾辞": re.compile(r"\bsuffix\b", re.IGNORECASE),
}


def _matches_pos_hint(entry, pos_hint: str | None) -> bool:
    if pos_hint is None:
        return True
    pattern = _POS_HINT_PATTERNS.get(pos_hint)
    if pattern is None:
        # Unrecognized hint: don't penalize anything, just fall back to
        # priority-only ranking.
        return True
    return any(pattern.search(pos) for sense in entry.senses for pos in sense.pos)


def _rank_key(entry, lemma: str, pos_hint: str | None) -> tuple[int, int, int]:
    pos_score = 0 if _matches_pos_hint(entry, pos_hint) else 1
    tier, nf_score = _priority_score(entry, lemma)
    return (pos_score, tier, nf_score)


def lookup(lemma: str, pos_hint: str | None = None) -> LexicalEntry | None:
    result = _jam.lookup(lemma)
    if not result.entries:
        return None

    entry = min(result.entries, key=lambda e: _rank_key(e, lemma, pos_hint))

    # JMdict lists a word's forms with its preferred/most common spelling
    # first. Prefer the kanji headword; fall back to the kana form for
    # kana-only words (e.g. some onomatopoeia, loanwords).
    if entry.kanji_forms:
        canonical_lemma = entry.kanji_forms[0].text
    else:
        canonical_lemma = entry.kana_forms[0].text
    readings = [kana_form.text for kana_form in entry.kana_forms]
    glosses = [
        gloss.text
        for sense in entry.senses
        for gloss in sense.gloss
        if gloss.lang == "eng"
    ]

    return LexicalEntry(lemma=canonical_lemma, readings=readings, glosses=glosses)

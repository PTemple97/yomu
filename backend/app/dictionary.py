"""JMdict lookup via jamdict (backed by the jamdict-data prebuilt sqlite DB)."""

from dataclasses import dataclass

from jamdict import Jamdict

_jam = Jamdict()


@dataclass(frozen=True)
class LexicalEntry:
    lemma: str
    readings: list[str]
    glosses: list[str]


def lookup(lemma: str) -> LexicalEntry | None:
    result = _jam.lookup(lemma)
    if not result.entries:
        return None

    entry = result.entries[0]
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

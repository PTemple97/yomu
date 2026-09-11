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
    readings = [kana_form.text for kana_form in entry.kana_forms]
    glosses = [
        gloss.text
        for sense in entry.senses
        for gloss in sense.gloss
        if gloss.lang == "eng"
    ]

    return LexicalEntry(lemma=lemma, readings=readings, glosses=glosses)

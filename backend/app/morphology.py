"""Morphological tokenization via fugashi (MeCab) + unidic-lite.

fugashi reports token boundaries as byte lengths (MeCab operates on encoded
byte strings under the hood), not code-point offsets. Rather than trust
those, we reconstruct code-point offsets ourselves: `surface` and
`white_space` on each node are already decoded `str` objects, and Python's
`str` is code-point indexed, so accumulating `len(white_space) + len(surface)`
across tokens in order gives exact code-point positions into the original
text -- verified to round-trip even across a supplementary-plane character.
"""

from dataclasses import dataclass

import fugashi

_tagger = fugashi.Tagger()


@dataclass(frozen=True)
class Token:
    surface: str
    start: int
    end: int
    lemma: str
    reading: str | None
    pos: str


def tokenize(text: str) -> list[Token]:
    tokens: list[Token] = []
    pos = 0

    for word in _tagger(text):
        start = pos + len(word.white_space)
        end = start + len(word.surface)
        pos = end

        feature = word.feature
        lemma = feature.lemma or word.surface
        reading = feature.pron or feature.kana

        tokens.append(
            Token(
                surface=word.surface,
                start=start,
                end=end,
                lemma=lemma,
                reading=reading,
                pos=feature.pos1,
            )
        )

    return tokens

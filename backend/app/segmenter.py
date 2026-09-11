"""Rule-based Japanese sentence segmentation.

Offsets are code-point offsets into the input string. Python's `str` is
already indexed by Unicode code point (not UTF-16 code units), so no special
handling is needed here the way it is on the JS side.
"""

from dataclasses import dataclass

TERMINAL_PUNCTUATION = "。！？"

# Closing brackets only extend a sentence that a terminal-punctuation mark
# already ended -- they are not boundary triggers on their own. Without this,
# a bare closing quote like the 」 in "「大丈夫？」" would split off into its
# own one-character sentence instead of staying attached to "...？」".
CLOSING_BRACKETS = "」』）"


@dataclass(frozen=True)
class Sentence:
    id: int
    start: int
    end: int


def segment(text: str) -> list[Sentence]:
    sentences: list[Sentence] = []
    start = 0
    i = 0
    n = len(text)

    def emit(end: int) -> None:
        if end > start:
            sentences.append(Sentence(id=len(sentences), start=start, end=end))

    while i < n:
        ch = text[i]

        if ch in TERMINAL_PUNCTUATION:
            j = i + 1
            while j < n and text[j] in CLOSING_BRACKETS:
                j += 1
            emit(j)
            start = j
            i = j
            continue

        if ch == "\n" and i + 1 < n and text[i + 1] == "\n":
            emit(i)
            i += 2
            start = i
            continue

        i += 1

    emit(n)
    return sentences

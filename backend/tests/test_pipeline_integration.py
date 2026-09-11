"""Chains segmenter -> morphology -> dictionary end to end.

Segments a short passage, tokenizes its first sentence, lemmatizes the
first content word (skipping particles/auxiliaries/punctuation), and
looks that lemma up in JMdict.
"""

from app.dictionary import lookup
from app.morphology import tokenize
from app.segmenter import segment

NON_CONTENT_POS = {"助詞", "助動詞", "補助記号", "記号"}


def test_segment_tokenize_lemmatize_lookup_pipeline() -> None:
    text = "走った。犬が寝ている。"

    sentences = segment(text)
    assert len(sentences) == 2

    first_sentence = sentences[0]
    first_sentence_text = text[first_sentence.start : first_sentence.end]
    assert first_sentence_text == "走った。"

    tokens = tokenize(first_sentence_text)
    content_word = next(t for t in tokens if t.pos not in NON_CONTENT_POS)
    assert content_word.surface == "走っ"
    assert content_word.lemma == "走る"

    entry = lookup(content_word.lemma)

    assert entry is not None
    assert entry.lemma == "走る"
    assert len(entry.glosses) > 0
    assert any("run" in gloss.lower() for gloss in entry.glosses)

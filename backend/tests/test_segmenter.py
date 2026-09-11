from app.segmenter import segment


def test_single_sentence() -> None:
    text = "これはテストです。"

    sentences = segment(text)

    assert len(sentences) == 1
    assert sentences[0].id == 0
    assert sentences[0].start == 0
    assert sentences[0].end == len(text)
    assert text[sentences[0].start : sentences[0].end] == text


def test_multiple_sentences() -> None:
    text = "犬が走る。猫が寝る。"

    sentences = segment(text)

    assert len(sentences) == 2
    assert [s.id for s in sentences] == [0, 1]
    assert text[sentences[0].start : sentences[0].end] == "犬が走る。"
    assert text[sentences[1].start : sentences[1].end] == "猫が寝る。"
    # Contiguous, no gaps or overlap.
    assert sentences[0].end == sentences[1].start


def test_sentence_ending_in_closing_bracket() -> None:
    text = "「大丈夫？」と聞いた。"

    sentences = segment(text)

    assert len(sentences) == 2
    assert text[sentences[0].start : sentences[0].end] == "「大丈夫？」"
    assert text[sentences[1].start : sentences[1].end] == "と聞いた。"


def test_no_trailing_punctuation() -> None:
    text = "これは終わりです"

    sentences = segment(text)

    assert len(sentences) == 1
    assert sentences[0].start == 0
    assert sentences[0].end == len(text)
    assert text[sentences[0].start : sentences[0].end] == text


def test_empty_string() -> None:
    assert segment("") == []


def test_double_newline_is_a_hard_boundary() -> None:
    text = "一段落目です\n\n二段落目です"

    sentences = segment(text)

    assert len(sentences) == 2
    assert text[sentences[0].start : sentences[0].end] == "一段落目です"
    assert text[sentences[1].start : sentences[1].end] == "二段落目です"

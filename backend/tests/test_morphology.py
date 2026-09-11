from app.morphology import tokenize


def test_simple_sentence_offsets_match_substrings() -> None:
    text = "猫が走る"

    tokens = tokenize(text)

    assert [t.surface for t in tokens] == ["猫", "が", "走る"]
    for token in tokens:
        assert text[token.start : token.end] == token.surface
    assert tokens[0].start == 0
    assert tokens[-1].end == len(text)


def test_offsets_survive_a_supplementary_plane_character() -> None:
    text = "猫が 走っていた。𠮟る"

    tokens = tokenize(text)

    for token in tokens:
        assert text[token.start : token.end] == token.surface
    assert tokens[-1].end == len(text)
    assert any(t.surface == "𠮟" for t in tokens)


def test_inflected_verb_resolves_to_dictionary_form_lemma() -> None:
    text = "猫が走っていた"

    tokens = tokenize(text)

    inflected = next(t for t in tokens if t.surface == "走っ")
    assert inflected.lemma == "走る"
    assert inflected.pos == "動詞"

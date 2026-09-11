from app.dictionary import lookup


def test_common_word_has_known_definition() -> None:
    entry = lookup("猫")

    assert entry is not None
    assert entry.lemma == "猫"
    assert "ねこ" in entry.readings
    assert any("cat" in gloss.lower() for gloss in entry.glosses)


def test_nonexistent_word_returns_none() -> None:
    assert lookup("asdkfjaslkdfjaslkdfj") is None


def test_lemma_is_the_dictionary_canonical_spelling_not_the_input() -> None:
    # Looking up by the kana reading should still resolve to the entry's
    # preferred kanji headword, not echo the kana we searched with.
    entry = lookup("ねこ")

    assert entry is not None
    assert entry.lemma == "猫"
    assert entry.lemma != "ねこ"

"""Covers dictionary.lookup()'s entry-ranking logic.

jamdict returns every JMdict entry matching a reading, in an arbitrary
(id-based) order. Without ranking, `entries[0]` can land on a rare kanji
homophone instead of the common word actually intended -- e.g. the
grammatical particle が resolving to 蛾 ("moth").
"""

from app.dictionary import lookup


def test_particle_ga_resolves_to_the_particle_not_the_moth() -> None:
    # が the particle has only a spec1 tag (no nf number); 蛾 "moth" has
    # news2/nf40. Tier (spec1 is tier-1, news2 is tier-2) must win over
    # any raw frequency number.
    entry = lookup("が")

    assert entry is not None
    assert entry.lemma == "が"
    assert not any("moth" in gloss.lower() for gloss in entry.glosses)
    assert any("subject" in gloss.lower() for gloss in entry.glosses)


def test_particle_mo_resolves_to_the_particle_not_seaweed() -> None:
    # Both the も particle (spec1, no nf number) and 藻 "seaweed"
    # (news1/nf22) are tier-1 -- this is the case a naive "no number is
    # worse" tiebreak gets backwards, since it would rank 藻's nf22 above
    # the particle's absent number.
    entry = lookup("も")

    assert entry is not None
    assert entry.lemma == "も"
    assert not any("seaweed" in gloss.lower() for gloss in entry.glosses)
    assert any("also" in gloss.lower() for gloss in entry.glosses)


def test_spec1_with_no_number_beats_a_numbered_news1_entry() -> None:
    # Dedicated lock-in for the tiebreak fix: の the particle (spec1, no
    # nf number) vs. 野 "field" (ichi1/news1/nf04 -- a real, fairly low
    # frequency number). Both tier-1; "no number" must not be treated as
    # worse than nf04.
    entry = lookup("の")

    assert entry is not None
    assert entry.lemma == "の"
    assert not any("field" in gloss.lower() for gloss in entry.glosses)
    assert any("possessive" in gloss.lower() for gloss in entry.glosses)


def test_pos_hint_changes_ranking_when_it_disagrees_with_priority_alone() -> None:
    # そう has two tier-1, no-nf-number entries that tie under priority
    # alone: an auxiliary ("seems that", ichi1) and an adverb (然う, "so",
    # spec1). Without a hint the tie resolves to whichever jamdict lists
    # first (the auxiliary). A "副詞" (adverb) hint should flip the winner
    # to the adverb entry instead -- proving the hint is actually doing
    # something, not just agreeing with the default.
    default_entry = lookup("そう")
    assert default_entry is not None
    assert default_entry.lemma == "そう"
    assert any("seem" in gloss.lower() for gloss in default_entry.glosses)

    hinted_entry = lookup("そう", pos_hint="副詞")
    assert hinted_entry is not None
    assert hinted_entry.lemma == "然う"
    assert any("thus" in gloss.lower() or "so" in gloss.lower() for gloss in hinted_entry.glosses)
    assert hinted_entry.lemma != default_entry.lemma

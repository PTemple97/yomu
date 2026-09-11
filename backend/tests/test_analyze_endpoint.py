from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_analyze_returns_sentences_and_tokens_with_correct_offsets() -> None:
    text = "猫が走った。犬が寝ている。"

    response = client.post("/analyze", json={"text": text})

    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"sentences", "tokens"}

    sentences = body["sentences"]
    assert len(sentences) == 2
    assert [s["id"] for s in sentences] == [0, 1]
    for s in sentences:
        assert set(s.keys()) == {"id", "start", "end", "text"}
        assert text[s["start"] : s["end"]] == s["text"]
    assert sentences[0]["text"] == "猫が走った。"
    assert sentences[1]["text"] == "犬が寝ている。"
    # Contiguous, no gaps or overlap.
    assert sentences[0]["end"] == sentences[1]["start"]

    tokens = body["tokens"]
    assert len(tokens) > 0
    for t in tokens:
        assert set(t.keys()) == {
            "sentence_id",
            "start",
            "end",
            "surface",
            "lemma",
            "reading",
            "pos",
        }
        # Token offsets are into the original posted text, not the
        # per-sentence substring.
        assert text[t["start"] : t["end"]] == t["surface"]

    first_sentence_tokens = [t for t in tokens if t["sentence_id"] == 0]
    second_sentence_tokens = [t for t in tokens if t["sentence_id"] == 1]
    assert [t["surface"] for t in first_sentence_tokens] == [
        "猫",
        "が",
        "走っ",
        "た",
        "。",
    ]
    assert [t["surface"] for t in second_sentence_tokens] == [
        "犬",
        "が",
        "寝",
        "て",
        "いる",
        "。",
    ]

    inflected = next(t for t in first_sentence_tokens if t["surface"] == "走っ")
    assert inflected["lemma"] == "走る"
    assert inflected["start"] == 2
    assert inflected["end"] == 4


def test_analyze_empty_text_returns_empty_results() -> None:
    response = client.post("/analyze", json={"text": ""})

    assert response.status_code == 200
    assert response.json() == {"sentences": [], "tokens": []}

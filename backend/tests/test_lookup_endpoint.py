from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_lookup_returns_lexical_entry_for_known_word() -> None:
    response = client.post("/lookup", json={"lemma": "猫"})

    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"lemma", "readings", "glosses"}
    assert body["lemma"] == "猫"
    assert "ねこ" in body["readings"]
    assert any("cat" in gloss.lower() for gloss in body["glosses"])


def test_lookup_returns_404_for_unknown_word() -> None:
    response = client.post("/lookup", json={"lemma": "asdkfjaslkdfjaslkdfj"})

    assert response.status_code == 404

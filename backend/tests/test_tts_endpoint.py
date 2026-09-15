from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_tts_returns_wav_audio(isolate_tts_cache) -> None:
    response = client.post("/tts", json={"sentence_id": "s1", "text": "猫が窓辺で寝ている。"})

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"
    assert response.content[:4] == b"RIFF"
    assert len(response.content) > 0

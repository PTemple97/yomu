from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.dictionary import lookup
from app.morphology import tokenize
from app.segmenter import segment

app = FastAPI()

# The frontend (Vite dev server) runs on a different origin/port than this
# backend, so browser fetches need CORS allowed. Everything here runs on
# localhost for now (per the project's local-first design), so this stays
# permissive rather than hardcoding a specific dev port.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


class AnalyzeRequest(BaseModel):
    text: str


class SentenceOut(BaseModel):
    id: int
    start: int
    end: int
    text: str


class TokenOut(BaseModel):
    sentence_id: int
    start: int
    end: int
    surface: str
    lemma: str
    reading: str | None
    pos: str


class AnalyzeResponse(BaseModel):
    sentences: list[SentenceOut]
    tokens: list[TokenOut]


@app.post("/analyze")
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    text = request.text
    sentences = segment(text)

    sentence_outs: list[SentenceOut] = []
    token_outs: list[TokenOut] = []

    for sentence in sentences:
        sentence_text = text[sentence.start : sentence.end]
        sentence_outs.append(
            SentenceOut(
                id=sentence.id,
                start=sentence.start,
                end=sentence.end,
                text=sentence_text,
            )
        )

        # Tokenizing per sentence (rather than the whole text at once) keeps
        # segmentation and tokenization decoupled, per the architecture: each
        # sentence's tokens are re-based from local offsets to offsets into
        # the original posted text.
        for token in tokenize(sentence_text):
            token_outs.append(
                TokenOut(
                    sentence_id=sentence.id,
                    start=sentence.start + token.start,
                    end=sentence.start + token.end,
                    surface=token.surface,
                    lemma=token.lemma,
                    reading=token.reading,
                    pos=token.pos,
                )
            )

    return AnalyzeResponse(sentences=sentence_outs, tokens=token_outs)


class LookupRequest(BaseModel):
    lemma: str
    # Optional UniDic-style POS tag (e.g. "助詞") from the Morphology token
    # for the word being looked up, used to break ties between homophone
    # entries in favor of the one consistent with how the word is actually
    # being used. Not yet sent by the frontend -- see app/dictionary.py.
    pos_hint: str | None = None


class LexicalEntryOut(BaseModel):
    lemma: str
    readings: list[str]
    glosses: list[str]


@app.post("/lookup")
def lookup_lemma(request: LookupRequest) -> LexicalEntryOut:
    entry = lookup(request.lemma, pos_hint=request.pos_hint)
    if entry is None:
        raise HTTPException(status_code=404, detail="lemma not found")

    return LexicalEntryOut(
        lemma=entry.lemma, readings=entry.readings, glosses=entry.glosses
    )

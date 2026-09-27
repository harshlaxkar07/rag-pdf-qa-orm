"""
HTTP layer for the ORM build of the PDF question-answering pipeline.

Wraps the ingestion and retrieval functions from ``main`` in a FastAPI
application and serves the console from ``frontend/``.

Run with::

    uvicorn api:app --reload
"""

from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from main import (
    COMPLETED_DIR,
    DOCUMENTS_DIR,
    GROQ_MODEL,
    build_context,
    groq_client,
    process_pdf,
    search_documents,
    setup_database,
)
from orm.db import get_session
from orm.models import RagDocument


BASE_DIR = Path(__file__).resolve().parent

FRONTEND_DIR = BASE_DIR / "frontend"


# ============================================================
# Schemas
# ============================================================

class AskRequest(BaseModel):
    question: str = Field(min_length=1, description="Question to answer from the library.")
    top_k: int = Field(default=4, ge=1, le=20, description="How many chunks to retrieve.")


class Source(BaseModel):
    filename: str
    page: int | None = None
    similarity: float | None = None
    content: str


class AskResponse(BaseModel):
    answer: str
    sources: list[Source]


class Document(BaseModel):
    filename: str
    file_type: str
    file_size: int
    chunks: int


class StatsResponse(BaseModel):
    documents: list[Document]
    total_chunks: int


class IngestResponse(BaseModel):
    message: str
    filename: str
    chunks: int


# ============================================================
# Application
# ============================================================

app = FastAPI(
    title="PDF Question Answering — ORM",
    version="1.0.0",
    description=(
        "Retrieval-augmented question answering over PDFs, with the vector "
        "store modelled as a SQLAlchemy entity. The console is served at /ui."
    ),
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    """
    Make sure the extension, tables and indexes exist.
    """

    setup_database()


# ============================================================
# Routes
# ============================================================

@app.get("/api/health", tags=["Health"])
def health() -> dict[str, object]:
    """
    Liveness probe that also reports how much is indexed.
    """

    session = get_session()

    try:
        chunks = session.scalar(
            select(func.count()).select_from(RagDocument)
        ) or 0

        documents = session.scalar(
            select(func.count(func.distinct(RagDocument.filename)))
        ) or 0

    finally:
        session.close()

    return {
        "status": "healthy",
        "backend": "SQLAlchemy ORM",
        "documents": documents,
        "chunks": chunks,
    }


@app.get("/api/stats", response_model=StatsResponse, tags=["Library"])
def stats() -> StatsResponse:
    """
    One row per indexed document, with its chunk count.
    """

    session = get_session()

    try:
        rows = session.execute(
            select(
                RagDocument.filename,
                RagDocument.file_type,
                func.max(RagDocument.file_size),
                func.count(RagDocument.id),
            )
            .group_by(RagDocument.filename, RagDocument.file_type)
            .order_by(RagDocument.filename)
        ).all()

    finally:
        session.close()

    documents = [
        Document(
            filename=filename,
            file_type=file_type,
            file_size=file_size or 0,
            chunks=chunks,
        )
        for filename, file_type, file_size, chunks in rows
    ]

    return StatsResponse(
        documents=documents,
        total_chunks=sum(document.chunks for document in documents),
    )


@app.post("/api/ingest", response_model=IngestResponse, tags=["Library"])
async def ingest(file: UploadFile = File(...)) -> IngestResponse:
    """
    Store an uploaded PDF, embed every chunk and index it.
    """

    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files can be ingested.",
        )

    DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)

    pdf_path = DOCUMENTS_DIR / Path(file.filename).name

    pdf_path.write_bytes(await file.read())

    before = _chunk_count(pdf_path.name)

    try:
        process_pdf(pdf_path)

    except Exception as error:
        if pdf_path.exists():
            pdf_path.unlink()

        raise HTTPException(
            status_code=500,
            detail=f"Could not index the document: {error}",
        ) from error

    chunks = _chunk_count(pdf_path.name) - before

    return IngestResponse(
        message=(
            f"Indexed {chunks} chunks from {pdf_path.name}."
            if chunks
            else f"{pdf_path.name} is already in the index."
        ),
        filename=pdf_path.name,
        chunks=max(chunks, 0),
    )


@app.post("/api/ask", response_model=AskResponse, tags=["Ask"])
def ask(request: AskRequest) -> AskResponse:
    """
    Answer a question from the indexed library and return the passages used.
    """

    try:
        results = search_documents(request.question, top_k=request.top_k)

        answer = _compose_answer(request.question, results)

    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail=f"Could not answer the question: {error}",
        ) from error

    sources = []

    for document, distance in results:
        metadata = document.document_metadata or {}

        sources.append(
            Source(
                filename=document.filename,
                page=metadata.get("page"),
                similarity=max(0.0, 1.0 - float(distance)),
                content=document.content,
            )
        )

    return AskResponse(answer=answer, sources=sources)


# ============================================================
# Helpers
# ============================================================

SYSTEM_PROMPT = """
You are a document question-answering assistant.

Your job is to answer the user's question using
ONLY the provided document context.

Rules:

1. Do not use outside knowledge.
2. Do not invent information.
3. If the answer is not present in the context,
   say that the answer was not found in the
   provided documents.
4. Give a clear and direct answer.
5. When useful, mention the source filename
   and page number.
"""


def _compose_answer(question: str, results) -> str:
    """
    Turn already-retrieved chunks into an answer with a single model call.
    """

    if not results:
        return "I couldn't find any information in the documents."

    context = build_context(results)

    user_prompt = f"""
DOCUMENT CONTEXT:

{context}


USER QUESTION:

{question}


Answer the question using only the document context.
"""

    response = groq_client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.2,
        max_tokens=1024,
    )

    return response.choices[0].message.content


def _chunk_count(filename: str) -> int:
    """
    Number of chunks currently stored for one filename.
    """

    session = get_session()

    try:
        return session.scalar(
            select(func.count())
            .select_from(RagDocument)
            .where(RagDocument.filename == filename)
        ) or 0

    finally:
        session.close()


# ============================================================
# Console
# ============================================================

if FRONTEND_DIR.is_dir():

    app.mount(
        "/ui",
        StaticFiles(directory=FRONTEND_DIR, html=True),
        name="ui",
    )

    @app.get("/", include_in_schema=False)
    def console() -> RedirectResponse:
        """
        Send the application root to the console.
        """

        return RedirectResponse(url="/ui/")


__all__ = ["app", "COMPLETED_DIR"]

# PDF Question Answering — SQLAlchemy ORM

Ask questions about your PDFs and get answers grounded in the pages themselves, with the vector store modelled as a first-class SQLAlchemy entity.

This is the **ORM build**. Chunks are ordinary mapped objects with a `pgvector` column, so a similarity search reads like any other SQLAlchemy query and every row comes back as a typed Python object. If you already model your data with SQLAlchemy, the vector store slots in without a second mental model.

> This is one of three builds of the same pipeline, each using a different persistence layer:
> [`rag-pdf-qa-orm`](https://github.com/harshlaxkar07/rag-pdf-qa-orm) (SQLAlchemy ORM),
> [`rag-pdf-qa-pgvector`](https://github.com/harshlaxkar07/rag-pdf-qa-pgvector) (LangChain PGVector) and
> [`rag-pdf-qa-raw-sql`](https://github.com/harshlaxkar07/rag-pdf-qa-raw-sql) (hand-written SQL).
> Same behaviour, same console, three ways of getting there.

---

## Highlights

| | |
|---|---|
| **Typed rows** | Every chunk is a `RagDocument` instance with real attributes, not a dict |
| **One query language** | Similarity search is expressed with `select()` and `order_by()` like anything else |
| **Duplicate detection** | Filename, type and size are checked before a document is embedded again |
| **Cited answers** | Every answer arrives with the passages, page numbers and similarity scores behind it |
| **Web console** | Ingest, ask and browse the library at `/` |
| **Archive on success** | Processed PDFs move to `completed_embedding/` so the input folder stays clean |

---

## The console

The API serves its own front end — start the server and open the root URL.

**Ask** — type a question and get the answer rendered with proper formatting, alongside the exact passages it was written from. Each source expands to show the chunk in full, with its filename, page number and similarity score.

**Ingest PDFs** — drop files in and watch each one embed, with a live chunk count when it lands in the index.

**Library** — every indexed document with its size, chunk count, and its share of the whole index.

**How it works** — the retrieval and generation settings this build is running with, laid out in one place.

---

## How it works

### Ingestion

```
PDF in documents/
   │
   ├─ 1. Load    PyPDFLoader reads the file page by page, keeping page numbers as metadata
   ├─ 2. Split   1000-character chunks with 200 characters of overlap
   ├─ 3. Embed   all-MiniLM-L6-v2 turns each chunk into a 384-dimension vector
   ├─ 4. Store   each chunk becomes a RagDocument row with a Vector(384) column
   └─ 5. Archive the processed PDF moves to completed_embedding/
```

### Answering

```
Question
   │
   ├─ 1. Embed     the question goes through the same embedding model
   ├─ 2. Retrieve  a SQLAlchemy query orders by cosine_distance and takes the top k
   ├─ 3. Ground    the retrieved passages become the context block
   └─ 4. Generate  Groq writes the answer from that context alone
```

---

## Tech stack

**API** FastAPI · Uvicorn · Pydantic v2
**Store** PostgreSQL · pgvector · SQLAlchemy 2.0 · psycopg 3
**Embeddings** sentence-transformers via langchain-huggingface
**Generation** Groq
**Documents** PyPDFLoader · LangChain text splitters
**Front end** Vanilla HTML, CSS and JavaScript — no build step

---

## Getting started

### Prerequisites

- Python 3.11 or newer
- PostgreSQL 15 or newer with the [`pgvector`](https://github.com/pgvector/pgvector) extension available
- A [Groq API key](https://console.groq.com)

### 1. Install

```bash
git clone https://github.com/harshlaxkar07/rag-pdf-qa-orm.git
cd rag-pdf-qa-orm

python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pip install "fastapi>=0.115" "uvicorn[standard]>=0.32" python-multipart
```

### 2. Create the database

```bash
createdb ragdb
psql ragdb -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

The tables and indexes are created for you on first start.

### 3. Configure

Create a `.env` file in the project root:

```ini
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-password
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=ragdb

GROQ_API_KEY=your-groq-key
GROQ_MODEL=openai/gpt-oss-20b
```

### 4. Run

```bash
uvicorn api:app --reload
```

| URL | What it is |
|---|---|
| `http://localhost:8000/` | The console |
| `http://localhost:8000/docs` | Interactive OpenAPI documentation |
| `http://localhost:8000/api/health` | Health probe with live index counts |

You can also drive it from the terminal — put PDFs in `documents/` and run:

```bash
python main.py
```

---

## API reference

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/health` | Liveness probe, plus document and chunk counts |
| `GET` | `/api/stats` | One row per indexed document with its chunk count |
| `POST` | `/api/ingest` | Upload a PDF, embed it and add it to the index |
| `POST` | `/api/ask` | Answer a question and return the passages used |

### Asking a question

```bash
curl -X POST http://localhost:8000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "How does the retrieval step work?", "top_k": 4}'
```

```json
{
  "answer": "The retrieval step embeds the question with the same model used at ingestion ...",
  "sources": [
    {
      "filename": "Architecture and Workflow of LLM-Based AI Retrieval Systems.pdf",
      "page": 4,
      "similarity": 0.912,
      "content": "Retrieval begins by projecting the user query into the same embedding space ..."
    }
  ]
}
```

### Ingesting a document

```bash
curl -X POST http://localhost:8000/api/ingest -F "file=@report.pdf"
```

---

## Retrieval settings

| Setting | Value |
|---|---|
| Embedding model | `sentence-transformers/all-MiniLM-L6-v2` |
| Vector size | 384 dimensions |
| Distance | Cosine |
| Chunk size | 1000 characters |
| Chunk overlap | 200 characters |
| Generation | Groq |

---

## The model

```python
class RagDocument(Base):
    __tablename__ = "rag_documents_orm"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    filename: Mapped[str] = mapped_column(Text, nullable=False)
    file_type: Mapped[str] = mapped_column(Text, nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    document_metadata: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    embedding: Mapped[list[float]] = mapped_column(Vector(384), nullable=False)
```

Retrieval is then just a query:

```python
distance = RagDocument.embedding.cosine_distance(query_vector)

statement = (
    select(RagDocument, distance.label("distance"))
    .order_by(distance)
    .limit(top_k)
)
```

---

## Project structure

```
rag-pdf-qa-orm/
├── api.py                   FastAPI application, the HTTP layer and the static mount
├── main.py                  Ingestion, retrieval and the terminal chat loop
├── orm/
│   ├── models.py            RagDocument — the mapped entity with its Vector column
│   ├── db.py                Engine, session factory and table creation
│   └── schema.sql           Enables the pgvector extension
├── documents/               Drop PDFs here
├── completed_embedding/     Processed PDFs land here
├── frontend/                The console
└── requirements.txt
```

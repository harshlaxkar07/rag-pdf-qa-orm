import os
import shutil
from pathlib import Path

from dotenv import load_dotenv
from groq import Groq
from sqlalchemy import select, text

from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings

from orm.db import engine, create_tables, get_session
from orm.models import RagDocument


# ============================================================
# ENVIRONMENT
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

load_dotenv(BASE_DIR / ".env")


GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not GROQ_API_KEY:
    raise RuntimeError(
        "GROQ_API_KEY is missing from your .env file."
    )


GROQ_MODEL = os.getenv(
    "GROQ_MODEL",
    "openai/gpt-oss-20b",
)


groq_client = Groq(
    api_key=GROQ_API_KEY
)


# ============================================================
# PATHS
# ============================================================

SCHEMA_FILE = BASE_DIR / "orm" / "schema.sql"

DOCUMENTS_DIR = BASE_DIR / "documents"

COMPLETED_DIR = BASE_DIR / "completed_embedding"


DOCUMENTS_DIR.mkdir(
    parents=True,
    exist_ok=True,
)

COMPLETED_DIR.mkdir(
    parents=True,
    exist_ok=True,
)


# ============================================================
# EMBEDDING MODEL
# ============================================================

print("Loading embedding model...")

embeddings = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2"
)

print("Embedding model loaded.")


# ============================================================
# DATABASE SETUP
# ============================================================

def setup_database():

    print("\nSetting up database...")

    # --------------------------------------------------------
    # Enable pgvector
    # --------------------------------------------------------

    with engine.connect() as connection:

        with open(
            SCHEMA_FILE,
            "r",
            encoding="utf-8",
        ) as file:

            sql = file.read()

        connection.execute(text(sql))
        connection.commit()

    # --------------------------------------------------------
    # Create ORM tables
    # --------------------------------------------------------

    create_tables()

    print("Database and tables are ready.")


# ============================================================
# CHECK DOCUMENT
# ============================================================

def document_already_exists(
    filename: str,
    file_type: str,
    file_size: int,
) -> bool:

    session = get_session()

    try:

        document = (
            session.query(RagDocument)
            .filter(
                RagDocument.filename == filename,
                RagDocument.file_type == file_type,
                RagDocument.file_size == file_size,
            )
            .first()
        )

        return document is not None

    finally:

        session.close()


# ============================================================
# PROCESS ONE PDF
# ============================================================

def process_pdf(pdf_path: Path):

    print(
        f"\nProcessing: {pdf_path.name}"
    )

    filename = pdf_path.name
    file_type = pdf_path.suffix.lower()
    file_size = pdf_path.stat().st_size

    print(
        f"File size: {file_size} bytes"
    )

    # --------------------------------------------------------
    # Duplicate check
    # --------------------------------------------------------

    if document_already_exists(
        filename,
        file_type,
        file_size,
    ):

        print(
            f"'{filename}' already exists "
            f"in the database."
        )

        # Move duplicate/previously processed PDF
        # out of the input directory.
        destination = COMPLETED_DIR / filename

        if destination.exists():
            destination.unlink()

        shutil.move(
            str(pdf_path),
            str(destination),
        )

        print(
            f"Moved existing document to: "
            f"{destination}"
        )

        return

    # --------------------------------------------------------
    # Load PDF
    # --------------------------------------------------------

    print("Loading PDF...")

    loader = PyPDFLoader(
        str(pdf_path)
    )

    documents = loader.load()

    print(
        f"PDF loaded successfully: "
        f"{len(documents)} pages"
    )

    if not documents:

        print(
            "PDF contains no readable pages."
        )

        return

    # --------------------------------------------------------
    # Split document
    # --------------------------------------------------------

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
    )

    chunks = splitter.split_documents(
        documents
    )

    print(
        f"Created {len(chunks)} text chunks."
    )

    if not chunks:

        print(
            "No chunks were generated."
        )

        return

    # --------------------------------------------------------
    # Database session
    # --------------------------------------------------------

    session = get_session()

    inserted_count = 0

    try:

        # ----------------------------------------------------
        # Generate embeddings
        # ----------------------------------------------------

        for index, chunk in enumerate(
            chunks,
            start=1,
        ):

            print(
                f"Embedding chunk "
                f"{index}/{len(chunks)}...",
                end="\r",
            )

            vector = embeddings.embed_query(
                chunk.page_content
            )

            document = RagDocument(
                filename=filename,
                file_type=file_type,
                file_size=file_size,
                content=chunk.page_content,
                document_metadata=chunk.metadata,
                embedding=vector,
            )

            session.add(document)

            inserted_count += 1

        # ----------------------------------------------------
        # Save
        # ----------------------------------------------------

        session.commit()

        print()

        print(
            f"Successfully inserted "
            f"{inserted_count} chunks."
        )

    except Exception:

        session.rollback()

        print()

        print(
            "Database insertion failed."
        )

        raise

    finally:

        session.close()

    # --------------------------------------------------------
    # Move PDF
    # --------------------------------------------------------

    destination = COMPLETED_DIR / filename

    if destination.exists():
        destination.unlink()

    shutil.move(
        str(pdf_path),
        str(destination),
    )

    print(
        f"PDF moved to: {destination}"
    )


# ============================================================
# PROCESS ALL PDFs
# ============================================================

def process_pdfs():

    print(
        "\nSearching for PDF files..."
    )

    pdf_files = list(
        DOCUMENTS_DIR.glob("*.pdf")
    )

    if not pdf_files:

        print(
            f"\nNo PDF files found in:"
            f"\n{DOCUMENTS_DIR}"
        )

        return

    print(
        f"Found {len(pdf_files)} PDF file(s)."
    )

    for pdf_path in pdf_files:

        process_pdf(pdf_path)


# ============================================================
# VECTOR SEARCH
# ============================================================

def search_documents(
    question: str,
    top_k: int = 5,
):
    """
    Convert the question into an embedding
    and retrieve the most similar document chunks.
    """

    print(
        "\nSearching relevant document chunks..."
    )

    # --------------------------------------------------------
    # Create embedding for user question
    # --------------------------------------------------------

    query_vector = embeddings.embed_query(
        question
    )

    # --------------------------------------------------------
    # Calculate cosine distance
    # --------------------------------------------------------

    distance = (
        RagDocument.embedding.cosine_distance(
            query_vector
        )
    )

    # --------------------------------------------------------
    # SQLAlchemy query
    # --------------------------------------------------------

    statement = (
        select(
            RagDocument,
            distance.label("distance"),
        )
        .order_by(distance)
        .limit(top_k)
    )

    session = get_session()

    try:

        results = session.execute(
            statement
        ).all()

        return results

    finally:

        session.close()


# ============================================================
# BUILD CONTEXT
# ============================================================

def build_context(results):

    context_parts = []

    for index, (document, distance) in enumerate(
        results,
        start=1,
    ):

        metadata = (
            document.document_metadata
            or {}
        )

        page = metadata.get(
            "page",
            "unknown",
        )

        context_parts.append(
            f"""
--- SOURCE {index} ---
Filename: {document.filename}
Page: {page}
Similarity distance: {distance:.4f}

Content:
{document.content}
"""
        )

    return "\n".join(
        context_parts
    )


# ============================================================
# ASK QUESTION
# ============================================================

def ask_question(
    question: str,
    top_k: int = 5,
):

    # --------------------------------------------------------
    # Retrieve relevant chunks
    # --------------------------------------------------------

    results = search_documents(
        question,
        top_k=top_k,
    )

    if not results:

        return (
            "I couldn't find any information "
            "in the documents."
        )

    # --------------------------------------------------------
    # Build context
    # --------------------------------------------------------

    context = build_context(
        results
    )

    # --------------------------------------------------------
    # Prompt
    # --------------------------------------------------------

    system_prompt = """
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

    user_prompt = f"""
DOCUMENT CONTEXT:

{context}


USER QUESTION:

{question}


Answer the question using only the document context.
"""

    # --------------------------------------------------------
    # Call Groq
    # --------------------------------------------------------

    print(
        "Generating answer with Groq..."
    )

    response = groq_client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": user_prompt,
            },
        ],
        temperature=0.2,
        max_tokens=1024,
    )

    answer = (
        response
        .choices[0]
        .message
        .content
    )

    return answer


# ============================================================
# SHOW DATABASE CONTENT
# ============================================================

def test_select():

    session = get_session()

    try:

        documents = (
            session.query(RagDocument)
            .all()
        )

        print(
            f"\nDatabase contains "
            f"{len(documents)} chunks."
        )

        for document in documents:

            print(
                document.id,
                document.filename,
            )

    finally:

        session.close()


# ============================================================
# INTERACTIVE QUESTION LOOP
# ============================================================

def question_loop():

    print("\n" + "=" * 60)
    print("DOCUMENT QUESTION ANSWERING")
    print("=" * 60)

    print(
        "\nAsk questions about your PDF."
    )

    print(
        "Type 'exit' to stop."
    )

    print()

    while True:

        try:

            question = input(
                "Question: "
            ).strip()

        except KeyboardInterrupt:

            print(
                "\nExiting..."
            )

            break

        # ----------------------------------------------------
        # Empty question
        # ----------------------------------------------------

        if not question:

            continue

        # ----------------------------------------------------
        # Exit
        # ----------------------------------------------------

        if question.lower() in {
            "exit",
            "quit",
        }:

            print(
                "\nExiting..."
            )

            break

        # ----------------------------------------------------
        # Ask
        # ----------------------------------------------------

        try:

            answer = ask_question(
                question,
                top_k=5,
            )

            print(
                "\nAnswer:"
            )

            print(
                answer
            )

            print(
                "\n" + "-" * 60
            )

        except Exception as error:

            print(
                "\nError while answering:"
            )

            print(error)

            print(
                "-" * 60
            )


# ============================================================
# MAIN
# ============================================================

def main():

    print("=" * 60)
    print("RAG PDF QUESTION ANSWERING SYSTEM")
    print("=" * 60)

    # --------------------------------------------------------
    # 1. Database
    # --------------------------------------------------------

    setup_database()

    # --------------------------------------------------------
    # 2. Ingest new PDFs
    # --------------------------------------------------------

    process_pdfs()

    # --------------------------------------------------------
    # 3. Ask questions
    # --------------------------------------------------------

    question_loop()

    print(
        "\nRAG application stopped."
    )


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    main()
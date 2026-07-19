"""
SQLAlchemy Database Connection, Engine, and Session Management.

Provides:
    engine      : SQLAlchemy engine bound to DATABASE_URL (SQLite by default).
    SessionLocal: Session factory for creating DB sessions.
    get_db()    : FastAPI dependency that yields a session per request.

SQLite Optimizations Applied (via PRAGMA):
    WAL mode       : Write-Ahead Logging allows concurrent reads during writes.
    NORMAL sync    : Reduces fsync overhead while maintaining crash safety.
    64MB cache     : Keeps hot pages in memory for repeated queries.
    Foreign keys   : Enforces referential integrity (OFF by default in SQLite).
"""

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator

from config import settings


# ══════════════════════════════════════════════════════════════════════════════
# Engine
# ══════════════════════════════════════════════════════════════════════════════

engine = create_engine(
    settings.database_url,
    connect_args={
        "check_same_thread": False,  # Required: SQLite + multi-threaded FastAPI
    },
    echo=False,  # Set True for SQL query logging during development
    pool_pre_ping=True,  # Validate connections before use (avoids stale connections)
)


# ══════════════════════════════════════════════════════════════════════════════
# SQLite PRAGMA Configuration (applied on every new connection)
# ══════════════════════════════════════════════════════════════════════════════

@event.listens_for(engine, "connect")
def set_sqlite_pragmas(dbapi_connection, connection_record):
    """
    Apply performance and safety PRAGMAs to every new SQLite connection.

    Called automatically by SQLAlchemy on each new connection in the pool.
    """
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")        # Concurrent read-write
    cursor.execute("PRAGMA synchronous=NORMAL")       # Balance speed vs. safety
    cursor.execute("PRAGMA cache_size=-65536")        # 64MB in-memory page cache
    cursor.execute("PRAGMA foreign_keys=ON")          # Enforce FK constraints
    cursor.execute("PRAGMA temp_store=MEMORY")        # Temp tables in RAM
    cursor.close()


# ══════════════════════════════════════════════════════════════════════════════
# Session Factory
# ══════════════════════════════════════════════════════════════════════════════

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
)


# ══════════════════════════════════════════════════════════════════════════════
# FastAPI Dependency
# ══════════════════════════════════════════════════════════════════════════════

def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency: yields one DB session per HTTP request.

    Usage in route handlers:
        @router.get("/items")
        def read_items(db: Session = Depends(get_db)):
            return db.query(Item).all()

    The session is ALWAYS closed in the finally block, even if the route
    handler raises an exception. This prevents connection pool exhaustion.
    """
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()

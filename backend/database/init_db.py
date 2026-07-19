"""
Database Initialization.

Creates all SQLAlchemy ORM tables defined in database.models.
This is idempotent — safe to call on every application startup.
SQLAlchemy uses CREATE TABLE IF NOT EXISTS semantics internally.
"""

import logging

from database.connection import engine
from database.models import Base

logger = logging.getLogger(__name__)


def init_database() -> None:
    """
    Create all tables defined by the ORM models.

    Called once during application startup via the FastAPI lifespan hook
    in main.py. If tables already exist, this is a no-op.

    Raises:
        Exception: Propagated if the database engine cannot connect or
                   table creation fails (logged before re-raise).
    """
    try:
        Base.metadata.create_all(bind=engine)
        table_names = list(Base.metadata.tables.keys())
        logger.info(
            "Database initialized. Tables: %s",
            ", ".join(table_names)
        )
    except Exception as exc:
        logger.error("Database initialization failed: %s", exc)
        raise

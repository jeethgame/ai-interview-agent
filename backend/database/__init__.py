"""
Database package for handling all database operations.
"""

# ── SQLAlchemy async engine for team-B platform endpoints ──
import os
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base

from .db_manager import DatabaseManager

_db_url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./project08.db")
_qb_url = os.getenv("QUESTION_BANK_DATABASE_URL", "")

_is_postgres = _db_url.startswith("postgresql")
DB_DRIVER = "postgresql" if _is_postgres else "sqlite"  # exposed for health checks
_engine = create_async_engine(
    _db_url, echo=False, future=True,
    pool_pre_ping=True,
    **({"pool_size": 5, "max_overflow": 10} if _is_postgres else {}),
)
_AsyncSessionLocal = async_sessionmaker(
    bind=_engine, class_=AsyncSession,
    expire_on_commit=False, autocommit=False, autoflush=False,
)
AsyncSessionLocal = _AsyncSessionLocal

_qb_engine = create_async_engine(_qb_url, echo=False, pool_pre_ping=True) if _qb_url else None
_QuestionBankSessionLocal = (
    async_sessionmaker(bind=_qb_engine, class_=AsyncSession,
                       expire_on_commit=False, autoflush=False)
    if _qb_engine else None
)

Base = declarative_base()

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with _AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

async def get_question_bank_db() -> AsyncGenerator[AsyncSession, None]:
    if _QuestionBankSessionLocal is None:
        raise RuntimeError("QUESTION_BANK_DATABASE_URL not configured")
    async with _QuestionBankSessionLocal() as session:
        yield session

async def init_db() -> None:
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # candidate_scorecards has no ORM model — create it explicitly
        from sqlalchemy import text
        if _is_postgres:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS candidate_scorecards (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
                    session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
                    overall_score DOUBLE PRECISION,
                    dimension_scores JSONB,
                    readiness_score DOUBLE PRECISION,
                    rubric_band VARCHAR(50),
                    role VARCHAR(255),
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE(user_id, session_id)
                )
            """))
        else:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS candidate_scorecards (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
                    session_id TEXT NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
                    overall_score REAL,
                    dimension_scores TEXT,
                    readiness_score REAL,
                    rubric_band TEXT,
                    role TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, session_id)
                )
            """))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_scorecard_user ON candidate_scorecards(user_id)"
        ))
        # Add difficulty to formal_exams if missing (Alembic-free migration)
        try:
            await conn.execute(text("ALTER TABLE formal_exams ADD COLUMN difficulty VARCHAR(50) DEFAULT 'medium'"))
        except Exception:
            pass  # Column already exists

        # Add topic_focus / question_count to placement_drives if missing
        try:
            await conn.execute(text("ALTER TABLE placement_drives ADD COLUMN topic_focus TEXT DEFAULT ''"))
        except Exception:
            pass  # Column already exists
        try:
            await conn.execute(text("ALTER TABLE placement_drives ADD COLUMN question_count INTEGER DEFAULT 5"))
        except Exception:
            pass  # Column already exists


__all__ = ["AsyncSessionLocal", "Base", "DatabaseManager", "get_db", "get_question_bank_db", "init_db"]
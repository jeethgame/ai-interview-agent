"""
Database manager — all agent operations via SQLAlchemy async (RDS PostgreSQL).
Replaces the Supabase SDK client.
"""

import uuid
import json
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta

from sqlalchemy import select, update, delete, text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import get_logger

logger = get_logger(__name__)


def _get_session() -> AsyncSession:
    from backend.database import _AsyncSessionLocal
    return _AsyncSessionLocal()


def _is_valid_uuid(val: str) -> bool:
    try:
        uuid.UUID(str(val))
        return True
    except (ValueError, AttributeError):
        return False


class DatabaseManager:
    """Agent DB operations backed by RDS via SQLAlchemy async."""

    # health-check sentinel so main.py can detect real vs mock
    rds = True

    # ── User ──────────────────────────────────────────────────────────────

    async def register_user(self, email: str, password: str, name: str) -> Dict[str, Any]:
        from backend.models.core import PlatformUser
        import jwt as pyjwt, os
        user_id = str(uuid.uuid4())
        async with _get_session() as s:
            s.add(PlatformUser(id=uuid.UUID(user_id), email=email, name=name,
                               auth_provider="mock", role="candidate"))
            await s.commit()
        token = pyjwt.encode({"sub": user_id, "email": email,
                               "exp": datetime.utcnow() + timedelta(hours=24)},
                              os.getenv("SECRET_KEY", "dev"), algorithm="HS256")
        return {"access_token": token, "refresh_token": token,
                "user": {"id": user_id, "email": email, "name": name}}

    async def login_user(self, email: str, password: str) -> Dict[str, Any]:
        from backend.models.core import PlatformUser
        import jwt as pyjwt, os
        async with _get_session() as s:
            row = (await s.execute(
                select(PlatformUser).where(PlatformUser.email == email)
            )).scalar_one_or_none()
        if not row:
            raise Exception("User not found")
        token = pyjwt.encode({"sub": str(row.id), "email": email,
                               "exp": datetime.utcnow() + timedelta(hours=24)},
                              os.getenv("SECRET_KEY", "dev"), algorithm="HS256")
        return {"access_token": token, "refresh_token": token,
                "user": {"id": str(row.id), "email": email, "name": row.name}}

    async def refresh_token(self, refresh_token: str) -> Dict[str, Any]:
        import jwt as pyjwt, os
        payload = pyjwt.decode(refresh_token, os.getenv("SECRET_KEY", "dev"),
                               algorithms=["HS256"], options={"verify_exp": False})
        new_token = pyjwt.encode({**payload, "exp": datetime.utcnow() + timedelta(hours=24)},
                                 os.getenv("SECRET_KEY", "dev"), algorithm="HS256")
        return {"access_token": new_token, "refresh_token": new_token,
                "user": {"id": payload.get("sub"), "email": payload.get("email")}}

    async def get_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        if not _is_valid_uuid(user_id):
            return None
        from backend.models.core import PlatformUser
        async with _get_session() as s:
            row = await s.get(PlatformUser, uuid.UUID(user_id))
        if not row:
            return None
        return {"id": str(row.id), "email": row.email, "name": row.name, "role": row.role}

    # ── Session ───────────────────────────────────────────────────────────

    async def create_session(self, user_id: Optional[str] = None,
                             initial_config: Optional[Dict] = None) -> str:
        from backend.models.core import InterviewSession, PlatformUser
        session_id = str(uuid.uuid4())

        # Resolve or create a platform user to satisfy the FK
        resolved_uid: uuid.UUID
        if user_id and _is_valid_uuid(user_id):
            resolved_uid = uuid.UUID(user_id)
            # Upsert so mock-auth users exist in platform_users
            async with _get_session() as s:
                exists = await s.get(PlatformUser, resolved_uid)
                if not exists:
                    s.add(PlatformUser(id=resolved_uid, email=f"{user_id}@mock.internal",
                                       name="Mock User", auth_provider="mock", role="candidate"))
                    await s.commit()
        else:
            # Create/reuse an anonymous platform user
            anon_email = "anonymous@internal"
            async with _get_session() as s:
                row = (await s.execute(
                    select(PlatformUser).where(PlatformUser.email == anon_email)
                )).scalar_one_or_none()
                if not row:
                    row = PlatformUser(id=uuid.uuid4(), email=anon_email,
                                       name="Anonymous", auth_provider="mock", role="candidate")
                    s.add(row)
                    await s.commit()
                    await s.refresh(row)
                resolved_uid = row.id

        async with _get_session() as s:
            s.add(InterviewSession(
                id=uuid.UUID(session_id),
                user_id=resolved_uid,
                status="active",
                metadata_={"session_config": initial_config or {},
                           "conversation_history": [],
                           "per_turn_feedback_log": [],
                           "session_stats": {}},
            ))
            await s.commit()
        logger.info(f"Created session: {session_id}")
        return session_id

    async def load_session_state(self, session_id: str) -> Optional[Dict]:
        if not _is_valid_uuid(session_id):
            return None
        from backend.models.core import InterviewSession
        async with _get_session() as s:
            row = await s.get(InterviewSession, uuid.UUID(session_id))
        if not row:
            return None
        meta = row.metadata_ or {}
        return {
            "session_id": str(row.id),
            "user_id": str(row.user_id) if row.user_id else None,
            "status": row.status,
            "session_config": meta.get("session_config", {}),
            "conversation_history": meta.get("conversation_history", []),
            "per_turn_feedback_log": meta.get("per_turn_feedback_log", []),
            "final_summary": meta.get("final_summary"),
            "session_stats": meta.get("session_stats", {}),
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }

    async def save_session_state(self, session_id: str, state_data: Dict) -> bool:
        if not _is_valid_uuid(session_id):
            return False
        from backend.models.core import InterviewSession
        meta = {
            "session_config":        state_data.get("session_config", {}),
            "conversation_history":  state_data.get("conversation_history", []),
            "per_turn_feedback_log": state_data.get("per_turn_feedback_log", []),
            "final_summary":         state_data.get("final_summary"),
            "session_stats":         state_data.get("session_stats", {}),
        }
        async with _get_session() as s:
            await s.execute(
                update(InterviewSession)
                .where(InterviewSession.id == uuid.UUID(session_id))
                .values(metadata_=meta, status=state_data.get("status", "active"),
                        updated_at=datetime.utcnow())
            )
            await s.commit()
        return True

    # ── Speech tasks ──────────────────────────────────────────────────────

    async def create_speech_task(self, session_id: str, task_type: str) -> str:
        from backend.models.core import SpeechTask
        task_id = str(uuid.uuid4())
        # skip DB write for anonymous/non-UUID session (no FK to satisfy)
        if not _is_valid_uuid(session_id):
            return task_id
        async with _get_session() as s:
            s.add(SpeechTask(
                id=uuid.UUID(task_id),
                session_id=uuid.UUID(session_id),
                task_type=task_type,
                status="processing",
                metadata_={},
            ))
            await s.commit()
        return task_id

    async def update_speech_task(self, task_id: str, status: str,
                                 progress_data: Optional[Dict] = None,
                                 result_data: Optional[Dict] = None,
                                 error_message: Optional[str] = None) -> bool:
        if not _is_valid_uuid(task_id):
            return False
        from backend.models.core import SpeechTask
        async with _get_session() as s:
            row = await s.get(SpeechTask, uuid.UUID(task_id))
            if not row:
                return False
            row.status = status
            row.error_message = error_message
            meta = row.metadata_ or {}
            if progress_data is not None:
                meta["progress_data"] = progress_data
            if result_data is not None:
                meta["result_data"] = result_data
            row.metadata_ = meta
            if status == "completed":
                row.completed_at = datetime.utcnow()
            await s.commit()
        return True

    async def get_speech_task(self, task_id: str) -> Optional[Dict]:
        if not _is_valid_uuid(task_id):
            return None
        from backend.models.core import SpeechTask
        async with _get_session() as s:
            row = await s.get(SpeechTask, uuid.UUID(task_id))
        if not row:
            return None
        meta = row.metadata_ or {}
        return {
            "task_id": str(row.id),
            "session_id": str(row.session_id),
            "task_type": row.task_type,
            "status": row.status,
            "progress_data": meta.get("progress_data"),
            "result_data": meta.get("result_data"),
            "error_message": row.error_message,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "updated_at": row.completed_at.isoformat() if row.completed_at else None,
        }

    async def get_user_sessions(self, user_id: str, limit: int = 50) -> List[Dict]:
        if not _is_valid_uuid(user_id):
            return []
        from backend.models.core import InterviewSession
        async with _get_session() as s:
            rows = (await s.execute(
                select(InterviewSession)
                .where(InterviewSession.user_id == uuid.UUID(user_id))
                .order_by(InterviewSession.created_at.desc())
                .limit(limit)
            )).scalars().all()
        return [{"session_id": str(r.id), "status": r.status,
                 "created_at": r.created_at.isoformat() if r.created_at else None}
                for r in rows]

    async def cleanup_completed_tasks(self, older_than_hours: int = 24) -> int:
        from backend.models.core import SpeechTask
        cutoff = datetime.utcnow() - timedelta(hours=older_than_hours)
        async with _get_session() as s:
            result = await s.execute(
                delete(SpeechTask)
                .where(SpeechTask.status.in_(["completed", "failed"]))
                .where(SpeechTask.completed_at < cutoff)
            )
            await s.commit()
        return result.rowcount or 0

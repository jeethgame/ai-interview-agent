import logging
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.auth_api import get_current_user_optional
from backend.database import get_question_bank_db
from backend.services.coding_question_service import get_all_questions

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/questions",
    tags=["Questions"],
)


@router.get("")
async def get_questions(
    search: str | None = None,
    difficulty: str | None = None,
    topic: str | None = None,
    limit: int = 100,
    assessment: bool = False,
    db: AsyncSession | None = Depends(get_question_bank_db),
    user: dict | None = Depends(get_current_user_optional),
):
    """
    Search and list questions from Question Bank with difficulty/topic filtering and fallback.
    """
    questions = []

    if db is not None:
        try:
            result = await db.execute(
                text("""
                    SELECT
                        id,
                        title,
                        topic,
                        description,
                        difficulty_level,
                        lpa_level,
                        examples,
                        constraints,
                        test_cases
                    FROM public.interview_questions
                    LIMIT 200
                """)
            )
            rows = result.mappings().all()
            for row in rows:
                qid = str(row["id"])
                diff = str(row.get("difficulty_level") or "medium").lower()
                top = str(row.get("topic") or "General")
                questions.append({
                    "id": qid,
                    "question_id": qid,
                    "title": row.get("title") or "Untitled Problem",
                    "description": row.get("description") or "",
                    "topic": top,
                    "category": top,
                    "ctc_band": row.get("lpa_level") or "Standard",
                    "difficulty": diff,
                    "difficulty_level": diff,
                    "constraints": row.get("constraints") or "",
                    "examples": row.get("examples") or "",
                    "sample_test_cases": row.get("test_cases") or [],
                })
        except Exception as exc:
            logger.warning(f"Could not load questions from external DB: {exc}. Using standard question bank.")

    # If DB returned nothing or wasn't configured, load rich default questions
    if not questions:
        for q in get_all_questions():
            qid = str(q["question_id"])
            diff = str(q.get("difficulty") or "medium").lower()
            top = str(q.get("topic") or "DSA")
            questions.append({
                "id": qid,
                "question_id": qid,
                "title": q["title"],
                "description": q.get("description") or "",
                "topic": top,
                "category": top,
                "ctc_band": q.get("ctc_band") or "Standard",
                "difficulty": diff,
                "difficulty_level": diff,
                "constraints": q.get("constraints") or "",
                "examples": q.get("examples") or "",
                "sample_test_cases": q.get("sample_test_cases") or [],
            })

    # Apply filters
    filtered = questions

    if search:
        s = search.strip().lower()
        filtered = [
            q for q in filtered
            if s in q["title"].lower() or s in q["description"].lower() or s in q["topic"].lower()
        ]

    if difficulty and difficulty.lower() != "all":
        d = difficulty.strip().lower()
        filtered = [q for q in filtered if q["difficulty"].lower() == d]

    if topic and topic.lower() != "all":
        t = topic.strip().lower()
        filtered = [q for q in filtered if t in q["topic"].lower()]

    if assessment:
        import random
        easy = [q for q in filtered if q["difficulty"] == "easy"]
        medium = [q for q in filtered if q["difficulty"] == "medium"]
        hard = [q for q in filtered if q["difficulty"] == "hard"]
        other = [q for q in filtered if q["difficulty"] not in ("easy", "medium", "hard")]

        random.shuffle(easy)
        random.shuffle(medium)
        random.shuffle(hard)
        random.shuffle(other)

        selected = easy[:2] + medium[:2] + hard[:1]
        if len(selected) < 5:
            used_ids = {q["id"] for q in selected}
            rem = [q for q in filtered if q["id"] not in used_ids]
            selected.extend(rem[: 5 - len(selected)])
        random.shuffle(selected)
        return selected[:5]

    return filtered[:limit]
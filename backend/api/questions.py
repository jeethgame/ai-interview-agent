from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_question_bank_db

router = APIRouter(
    prefix="/api/questions",
    tags=["Questions"],
)


@router.get("")
async def get_questions(
    assessment: bool = False,
    db: AsyncSession = Depends(get_question_bank_db),
):
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
            """)
        )

        rows = result.mappings().all()

        questions = []

        for row in rows:
            questions.append({
                "question_id": str(row["id"]),
                "title": row["title"],
                "description": row["description"],
                "topic": row["topic"],
                "ctc_band": row["lpa_level"],
                "difficulty": row["difficulty_level"],
                "constraints": row["constraints"],
                "examples": row["examples"],
                "sample_test_cases": row["test_cases"] or [],
            })

        if assessment:
            import random
            easy = [q for q in questions if (q.get("difficulty") or "").lower() == "easy"]
            medium = [q for q in questions if (q.get("difficulty") or "").lower() == "medium"]
            hard = [q for q in questions if (q.get("difficulty") or "").lower() == "hard"]
            other = [q for q in questions if (q.get("difficulty") or "").lower() not in ("easy", "medium", "hard")]

            random.shuffle(easy)
            random.shuffle(medium)
            random.shuffle(hard)
            random.shuffle(other)

            selected = easy[:2] + medium[:2] + hard[:1]
            if len(selected) < 5:
                used_ids = {q["question_id"] for q in selected}
                rem = [q for q in questions if q["question_id"] not in used_ids]
                selected.extend(rem[: 5 - len(selected)])
            random.shuffle(selected)
            return selected[:5]

        return questions

    except Exception as exc:
        print("Question bank error:", str(exc))

        raise HTTPException(
            status_code=500,
            detail="Unable to fetch questions",
        )
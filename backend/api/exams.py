import html
import json
import logging
from datetime import datetime
from urllib.parse import quote, urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.auth_api import (
    get_current_user,
    get_current_user_optional,
    require_role,
)
from backend.database import get_db
from backend.models.formal_exam import ExamAttempt, FormalExam

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/exams", tags=["Formal Exam Portal & SEB Lockdown (Member B4)"])

class CreateExamRequest(BaseModel):
    title: str
    description: str = "Formal Scheduled Coding Examination"
    duration_minutes: int = 60
    difficulty: str = "medium"  # easy | medium | hard
    seb_required: bool = True
    max_infractions: int = 3
    question_ids: list[str | int] = []

class StartAttemptRequest(BaseModel):
    candidate_id: str

class InfractionRequest(BaseModel):
    candidate_id: str
    reason: str  # WINDOW_BLUR, TAB_SWITCH, FULLSCREEN_EXIT, CLIPBOARD_PASTE

class SubmitExamRequest(BaseModel):
    candidate_id: str
    answers: dict = {}  # question_id -> code

class ExamResponse(BaseModel):
    id: str
    title: str
    description: str
    duration_minutes: int
    difficulty: str = "medium"
    seb_required: bool
    max_infractions: int
    is_active: bool
    question_ids: list[str] = []
    questions: list[dict] = []

class AttemptResponse(BaseModel):
    id: str
    exam_id: str
    candidate_id: str
    infraction_count: int
    status: str  # IN_PROGRESS, SUBMITTED, DISQUALIFIED
    score: int
    started_at: datetime

async def _score_submission(exam: FormalExam, answers: dict) -> int:
    """Run each answer against hidden test cases via Judge0. Returns 0-100."""
    if not answers:
        return 0
    try:
        from backend.api.code_execution_api import LANGUAGE_IDS, _execute_test_case
        from backend.services.coding_question_service import get_hidden_test_cases

        question_ids = json.loads(exam.question_ids or "[]")
        if not question_ids:
            return 0
        total, passed = 0, 0
        for qid in question_ids:
            answer = answers.get(str(qid)) or answers.get(qid)
            if not answer:
                continue
            source_code = answer.get("source_code", "")
            language = answer.get("language", "python").lower()
            if language not in LANGUAGE_IDS:
                continue
            test_cases = get_hidden_test_cases(str(qid))
            for tc in test_cases:
                total += 1
                result = _execute_test_case(source_code, language, tc)
                if result.get("status") == "passed":
                    passed += 1
        if total > 0 and passed > 0:
            return round((passed / total) * 100)
        return 0
    except Exception as e:
        logger.warning("Scoring failed, returning 0: %s", e)
        return 0


@router.post("/create", response_model=ExamResponse)
async def create_exam(
    req: CreateExamRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = require_role("admin", "faculty"),
):
    """Create a formal scheduled coding assessment with lockdown integrity constraints."""
    exam = FormalExam(
        title=req.title,
        description=req.description,
        duration_minutes=req.duration_minutes,
        difficulty=req.difficulty,
        seb_required=req.seb_required,
        max_infractions=req.max_infractions,
        question_ids=json.dumps(req.question_ids),
    )
    db.add(exam)
    await db.commit()
    await db.refresh(exam)

    return ExamResponse(
        id=exam.id,
        title=exam.title,
        description=exam.description,
        duration_minutes=exam.duration_minutes,
        difficulty=exam.difficulty,
        seb_required=exam.seb_required,
        max_infractions=exam.max_infractions,
        is_active=exam.is_active,
    )

def _determine_frontend_base(request: Request, frontend_origin: str | None = None) -> str:
    """Determine the true frontend origin so SEB loads the React SPA, not backend REST endpoints."""
    if frontend_origin and frontend_origin.strip():
        return frontend_origin.strip().rstrip("/")

    origin = request.headers.get("origin")
    if origin and origin.strip():
        return origin.strip().rstrip("/")

    referer = request.headers.get("referer")
    if referer and referer.strip():
        parsed = urlparse(referer)
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}"

    host = request.headers.get("host") or "localhost:3000"
    scheme = "https" if "https" in str(request.base_url) else "http"
    if ":8000" in host:
        host = host.replace(":8000", ":3000")
    return f"{scheme}://{host}"


def _build_seb_config_xml(start_url: str, quit_url: str = "") -> str:
    """Generate clean borderless fullscreen Apple plist XML for Safe Exam Browser."""
    safe_start_url = html.escape(start_url)
    safe_quit_url = html.escape(quit_url or start_url)

    return f"""<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>originatorVersion</key>
    <string>SEB_Win_3.x</string>
    <key>startURL</key>
    <string>{safe_start_url}</string>
    <key>allowQuit</key>
    <true/>
    <key>quitURL</key>
    <string>{safe_quit_url}</string>
    <key>quitURLConfirm</key>
    <false/>
    <key>browserUserAgentWinDesktopMode</key>
    <integer>1</integer>
    <key>browserUserAgentWinDesktopModeCustom</key>
    <string>Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 SEB</string>
    <key>browserViewMode</key>
    <integer>1</integer>
    <key>touchOptimized</key>
    <false/>
    <key>showSideMenu</key>
    <false/>
    <key>enableBrowserWindowToolbar</key>
    <false/>
    <key>hideBrowserWindowToolbar</key>
    <true/>
    <key>showTaskBar</key>
    <false/>
    <key>taskbarHeight</key>
    <integer>0</integer>
    <key>mainBrowserWindowPositioningMode</key>
    <integer>1</integer>
    <key>mainBrowserWindowWidth</key>
    <string>100%</string>
    <key>mainBrowserWindowHeight</key>
    <string>100%</string>
    <key>allowWindowResize</key>
    <false/>
    <key>allowWindowMove</key>
    <false/>
    <key>allowWindowPositioning</key>
    <false/>
    <key>createNewDesktop</key>
    <false/>
    <key>killExplorerShell</key>
    <true/>
    <key>sendBrowserExamKey</key>
    <true/>
</dict>
</plist>"""


@router.get("/seb-config")
async def get_general_seb_config(
    request: Request,
    target_path: str = "/coding",
    auth_token: str | None = None,
    auth_user: str | None = None,
    frontend_origin: str | None = None,
    exam_id: str | None = None,
):
    """
    Download a .seb file configured to launch the Coding Assessment directly in Safe Exam Browser.
    """
    base = _determine_frontend_base(request, frontend_origin)

    query_parts = ["is_seb=true"]
    if exam_id and exam_id != "coding-assessment":
        query_parts.append(f"exam_id={exam_id}")
    if auth_token:
        query_parts.append(f"auth_token={auth_token}")
    if auth_user:
        query_parts.append(f"auth_user={quote(auth_user)}")

    qs = f"?{'&'.join(query_parts)}" if query_parts else ""
    final_path = target_path or "/coding"
    if not final_path.startswith("/"):
        final_path = f"/{final_path}"
    if exam_id and "exam_id" not in final_path and exam_id != "coding-assessment":
        sep = "&" if "?" in final_path else "?"
        final_path = f"{final_path}{sep}exam_id={exam_id}"

    start_url = f"{base}{final_path}{qs}"
    quit_url = f"{base}/seb-quit"

    xml_content = _build_seb_config_xml(start_url=start_url, quit_url=quit_url)

    return Response(
        content=xml_content,
        media_type="application/seb",
        headers={
            "Content-Disposition": 'attachment; filename="AI_Proctor_Assessment.seb"',
            "Cache-Control": "no-cache, no-store, must-revalidate",
        },
    )


@router.get("/seb-status")
async def check_seb_status(request: Request):
    """
    Check if the current client is executing within Safe Exam Browser.
    """
    ua = request.headers.get("user-agent", "")
    seb_hash = request.headers.get("x-safeexambrowser-requesthash")
    seb_config_hash = request.headers.get("x-safeexambrowser-configkeyhash")
    is_seb = "SEB" in ua or "SafeExamBrowser" in ua or bool(seb_hash or seb_config_hash)
    return {
        "is_seb": is_seb,
        "verified_headers": bool(seb_hash or seb_config_hash),
        "request_hash": seb_hash,
        "config_key_hash": seb_config_hash,
        "user_agent": ua,
        "message": "Connected via Safe Exam Browser" if is_seb else "Normal Browser Detected (SEB Required)",
    }


@router.get("/{exam_id}/seb-config")
async def get_exam_seb_config(
    exam_id: str,
    request: Request,
    auth_token: str | None = None,
    auth_user: str | None = None,
    frontend_origin: str | None = None,
    target_path: str | None = None,
):
    """
    Download a .seb configuration file tailored for a specific formal exam ID pointing to the frontend Coding Arena.
    """
    base = _determine_frontend_base(request, frontend_origin)

    query_parts = ["is_seb=true", f"exam_id={exam_id}"]
    if auth_token:
        query_parts.append(f"auth_token={auth_token}")
    if auth_user:
        query_parts.append(f"auth_user={quote(auth_user)}")

    qs = f"?{'&'.join(query_parts)}"
    final_path = target_path or "/coding"
    if not final_path.startswith("/"):
        final_path = f"/{final_path}"

    start_url = f"{base}{final_path}{qs}"
    quit_url = f"{base}/seb-quit"

    xml_content = _build_seb_config_xml(start_url=start_url, quit_url=quit_url)

    return Response(
        content=xml_content,
        media_type="application/seb",
        headers={
            "Content-Disposition": f'attachment; filename="Exam_{exam_id}.seb"',
            "Cache-Control": "no-cache, no-store, must-revalidate",
        },
    )


_EXAM_CACHE: dict[str, dict] = {}

@router.get("/{exam_id}", response_model=ExamResponse)
async def get_exam(
    exam_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user_optional),
):
    """Fetch formal exam configuration and assigned questions directly with high-speed caching."""
    if exam_id in _EXAM_CACHE:
        cached = _EXAM_CACHE[exam_id]
        return ExamResponse(**cached)

    exam = await db.get(FormalExam, exam_id)
    if not exam:
        # Fallback for synthetic/default IDs: auto-seed default assessment
        exam = FormalExam(
            id=exam_id,
            title="Coding Assessment",
            description="Institutional Coding Assessment",
            duration_minutes=90,
            seb_required=True,
            max_infractions=3,
            difficulty="medium",
            question_ids=json.dumps(["Q001", "Q002", "Q003"]),
        )
        db.add(exam)
        await db.commit()
        await db.refresh(exam)

    qids = []
    try:
        qids = json.loads(exam.question_ids or "[]")
    except Exception:
        qids = []

    # Fetch assigned questions directly
    questions_list = []
    from backend.services.coding_question_service import get_all_questions, get_question
    for qid in qids:
        q = get_question(str(qid))
        if q:
            questions_list.append({
                "id": str(qid),
                "question_id": str(qid),
                "title": q.get("title", ""),
                "description": q.get("description", ""),
                "topic": q.get("topic", "DSA"),
                "category": q.get("topic", "DSA"),
                "ctc_band": q.get("ctc_band", "Standard"),
                "difficulty": q.get("difficulty", "Medium"),
                "constraints": q.get("constraints", ""),
                "examples": q.get("examples", ""),
                "sample_test_cases": q.get("sample_test_cases", []),
            })

    # If no custom question objects were matched, populate from standard questions pool
    if not questions_list:
        all_q = get_all_questions()
        for q in all_q[:5]:
            qid = str(q.get("question_id", ""))
            questions_list.append({
                "id": qid,
                "question_id": qid,
                "title": q.get("title", ""),
                "description": q.get("description", ""),
                "topic": q.get("topic", "DSA"),
                "category": q.get("topic", "DSA"),
                "ctc_band": q.get("ctc_band", "Standard"),
                "difficulty": q.get("difficulty", "Medium"),
                "constraints": q.get("constraints", ""),
                "examples": q.get("examples", ""),
                "sample_test_cases": q.get("sample_test_cases", []),
            })

    resp = {
        "id": exam.id,
        "title": exam.title,
        "description": exam.description,
        "duration_minutes": exam.duration_minutes,
        "difficulty": exam.difficulty,
        "seb_required": exam.seb_required,
        "max_infractions": exam.max_infractions,
        "is_active": exam.is_active,
        "question_ids": [str(q) for q in qids],
        "questions": questions_list,
    }
    _EXAM_CACHE[exam_id] = resp
    return ExamResponse(**resp)

@router.post("/{exam_id}/start", response_model=AttemptResponse)
async def start_exam_attempt(
    exam_id: str,
    req: StartAttemptRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Initialize candidate attempt in locked-down environment."""
    exam = await db.get(FormalExam, exam_id)
    if not exam or not exam.is_active:
        raise HTTPException(status_code=400, detail="Exam is not currently active")

    # Check for existing attempt
    stmt = (
        select(ExamAttempt)
        .where(ExamAttempt.exam_id == exam_id, ExamAttempt.candidate_id == req.candidate_id)
    )
    res = await db.execute(stmt)
    existing = res.scalars().first()
    if existing:
        return AttemptResponse(
            id=existing.id,
            exam_id=existing.exam_id,
            candidate_id=existing.candidate_id,
            infraction_count=existing.infraction_count,
            status=existing.status,
            score=existing.score,
            started_at=existing.started_at,
        )

    attempt = ExamAttempt(
        exam_id=exam_id,
        candidate_id=req.candidate_id,
        infraction_count=0,
        infraction_log=json.dumps([]),
        status="IN_PROGRESS",
    )
    db.add(attempt)
    await db.flush()

    return AttemptResponse(
        id=attempt.id,
        exam_id=attempt.exam_id,
        candidate_id=attempt.candidate_id,
        infraction_count=attempt.infraction_count,
        status=attempt.status,
        score=attempt.score,
        started_at=attempt.started_at,
    )

@router.post("/{exam_id}/infraction", response_model=AttemptResponse)
async def log_exam_infraction(
    exam_id: str,
    req: InfractionRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Record proctoring infraction (window blur, tab switch); auto-disqualify after 3 strikes."""
    candidate_id = req.candidate_id or "guest-candidate"

    exam = await db.get(FormalExam, exam_id)
    if not exam:
        exam = FormalExam(
            id=exam_id,
            title="Coding Assessment",
            description="Active candidate coding assessment",
            duration_minutes=150,
            seb_required=True,
            max_infractions=3,
        )
        db.add(exam)
        await db.flush()

    stmt = (
        select(ExamAttempt)
        .where(ExamAttempt.exam_id == exam_id, ExamAttempt.candidate_id == candidate_id)
    )
    res = await db.execute(stmt)
    attempt = res.scalars().first()
    if not attempt:
        attempt = ExamAttempt(
            exam_id=exam_id,
            candidate_id=candidate_id,
            infraction_count=0,
            infraction_log=json.dumps([]),
            status="IN_PROGRESS",
        )
        db.add(attempt)
        await db.flush()

    attempt.infraction_count += 1
    logs = json.loads(attempt.infraction_log)
    logs.append({"timestamp": datetime.utcnow().isoformat(), "reason": req.reason, "strike": attempt.infraction_count})
    attempt.infraction_log = json.dumps(logs)

    if attempt.infraction_count >= exam.max_infractions:
        attempt.status = "DISQUALIFIED"
        try:
            from sqlalchemy import text
            await db.execute(
                text("UPDATE exam_assignments SET status = 'disqualified', completed_at = CURRENT_TIMESTAMP WHERE exam_id = :exam_id AND user_id = :cid"),
                {"exam_id": exam_id, "cid": candidate_id}
            )
        except Exception:
            pass

    await db.flush()

    return AttemptResponse(
        id=attempt.id,
        exam_id=attempt.exam_id,
        candidate_id=attempt.candidate_id,
        infraction_count=attempt.infraction_count,
        status=attempt.status,
        score=attempt.score,
        started_at=attempt.started_at,
    )

@router.post("/{exam_id}/submit", response_model=AttemptResponse)
async def submit_exam_attempt(
    exam_id: str,
    req: SubmitExamRequest,
    db: AsyncSession = Depends(get_db),
    user: dict | None = Depends(get_current_user_optional),
):
    """Finalize candidate exam submission, compute score, and record into scorecard and assignments."""
    import json
    import uuid

    from sqlalchemy import text

    # 1. Determine candidate identity
    candidate_id = req.candidate_id
    if user and user.get("id"):
        candidate_id = str(user["id"])
    elif not candidate_id or candidate_id == "candidate":
        r = await db.execute(text("SELECT id FROM platform_users WHERE role = 'candidate' ORDER BY created_at ASC LIMIT 1"))
        cand_row = r.fetchone()
        if cand_row:
            candidate_id = str(cand_row[0])
        else:
            candidate_id = str(uuid.uuid4())

    # 2. Find or create ExamAttempt
    stmt = (
        select(ExamAttempt)
        .where(ExamAttempt.exam_id == exam_id)
        .where((ExamAttempt.candidate_id == candidate_id) | (ExamAttempt.candidate_id == req.candidate_id))
    )
    res = await db.execute(stmt)
    attempt = res.scalars().first()
    if not attempt:
        attempt = ExamAttempt(
            id=str(uuid.uuid4()),
            exam_id=exam_id,
            candidate_id=candidate_id,
            status="SUBMITTED",
            started_at=datetime.utcnow(),
            infraction_count=0,
        )
        db.add(attempt)
    elif attempt.status == "DISQUALIFIED":
        raise HTTPException(status_code=403, detail="Attempt was disqualified due to integrity infractions")

    exam = await db.get(FormalExam, exam_id)
    attempt.status = "SUBMITTED"
    attempt.submitted_at = datetime.utcnow()
    attempt.candidate_id = candidate_id
    computed_score = await _score_submission(exam, req.answers)
    attempt.score = computed_score
    await db.flush()

    # 3. Update or Insert exam_assignments (for admin dashboard view)
    try:
        await db.execute(
            text("""
                INSERT INTO exam_assignments (
                    id, exam_id, user_id, status, assigned_at, completed_at
                ) VALUES (
                    CAST(:id AS uuid), :exam_id, CAST(:cid AS uuid), 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                ON CONFLICT (exam_id, user_id) DO UPDATE SET
                    status = 'completed',
                    completed_at = CURRENT_TIMESTAMP
            """),
            {
                "id": str(uuid.uuid4()),
                "exam_id": str(exam_id),
                "cid": str(candidate_id),
            }
        )
    except Exception as e:
        logger.warning(f"Failed to upsert exam_assignments: {e}")

    # 4. Insert into interview_sessions and candidate_scorecards (for candidate Profile > Test History)
    try:
        check_u = await db.execute(text("SELECT id FROM platform_users WHERE id::text = :cid"), {"cid": str(candidate_id)})
        u_exists = check_u.fetchone()
        if u_exists:
            session_uuid = uuid.uuid4()
            await db.execute(text("""
                INSERT INTO interview_sessions (
                    id, user_id, status, started_at, ended_at, duration_seconds, question_count, created_at, updated_at
                ) VALUES (
                    CAST(:id AS uuid), CAST(:uid AS uuid), 'completed', :started, CURRENT_TIMESTAMP, 1800, :q_count, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                ON CONFLICT (id) DO NOTHING
            """), {
                "id": str(session_uuid),
                "uid": str(candidate_id),
                "started": attempt.started_at or datetime.utcnow(),
                "q_count": len(req.answers) if req.answers else 1,
            })

            dim_scores = {
                "correctness": round(min(10.0, float(attempt.score) / 10.0), 1),
                "coding_score": int(attempt.score),
                "summary": f"Completed coding assessment with an evaluated score of {attempt.score}/100.",
                "strengths": ["Automated test runner evaluated submissions successfully."] if attempt.score > 0 else [],
                "weaknesses": ["No test cases passed. Review solution logic, edge cases, and time limits."] if attempt.score == 0 else [],
            }
            rubric_band = "Ready for Placement" if attempt.score >= 70 else ("Developing Competence" if attempt.score >= 40 else "Needs Improvement")
            role_title = exam.title if exam and exam.title else "Coding Assessment"

            await db.execute(text("""
                INSERT INTO candidate_scorecards (
                    id, user_id, session_id, overall_score, dimension_scores,
                    readiness_score, rubric_band, role, created_at, updated_at
                ) VALUES (
                    CAST(:id AS uuid), CAST(:user_id AS uuid), CAST(:session_id AS uuid), :overall_score, CAST(:dimension_scores AS jsonb),
                    :readiness_score, :rubric_band, :role, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                ON CONFLICT (user_id, session_id) DO UPDATE SET
                    overall_score = EXCLUDED.overall_score,
                    dimension_scores = EXCLUDED.dimension_scores,
                    readiness_score = EXCLUDED.readiness_score,
                    rubric_band = EXCLUDED.rubric_band,
                    updated_at = CURRENT_TIMESTAMP
            """), {
                "id": str(uuid.uuid4()),
                "user_id": str(candidate_id),
                "session_id": str(session_uuid),
                "overall_score": float(attempt.score),
                "dimension_scores": json.dumps(dim_scores),
                "readiness_score": float(attempt.score),
                "rubric_band": rubric_band,
                "role": role_title,
            })
    except Exception as e:
        logger.warning(f"Failed to record scorecard: {e}")

    await db.commit()

    return AttemptResponse(
        id=attempt.id,
        exam_id=attempt.exam_id,
        candidate_id=attempt.candidate_id,
        infraction_count=attempt.infraction_count,
        status=attempt.status,
        score=attempt.score,
        started_at=attempt.started_at,
    )


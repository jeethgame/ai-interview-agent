"""
V4 Institutional Layer API.

Endpoints:
  Organizations
    POST /orgs/                                create org
    GET  /orgs/{id}                            get org
    GET  /orgs/{id}/stats                      aggregate analytics for org

  Cohorts
    POST /orgs/{org_id}/cohorts                create cohort
    GET  /orgs/{org_id}/cohorts                list cohorts
    POST /orgs/{org_id}/cohorts/{id}/members   add user to cohort

  Placement Drives (AI Interviews)
    POST /orgs/{org_id}/drives                 create drive
    GET  /orgs/{org_id}/drives                 list drives
    POST /orgs/{org_id}/drives/{id}/allocate   allocate candidates (by IDs, emails, cohorts)
    POST /orgs/{org_id}/drives/{id}/allocate/csv bulk allocate via CSV upload
    GET  /orgs/{org_id}/drives/{id}/results    drive results/scores per candidate

  Exam Assignment (Formal Coding Tests)
    GET  /orgs/{org_id}/exams                  list all exams
    POST /orgs/{org_id}/exams/{id}/assign      assign exam to users (by IDs, emails, or cohorts)
    GET  /orgs/{org_id}/exams/{id}/assignments list exam assignments with scores & status
    POST /orgs/{org_id}/exams/{id}/assign/csv  bulk assign via CSV upload

  Faculty Analytics
    GET  /orgs/{org_id}/analytics/summary      global KPIs (total assigned, attended, avg scores)
    GET  /orgs/{org_id}/analytics/overview     cohort-level performance
    GET  /orgs/{org_id}/analytics/candidates   per-candidate summary

  Candidate-Facing
    GET  /me/assignments                       candidate's assigned exams & interviews
"""

import csv
import io
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from backend.api.auth_api import get_current_user, require_role
from backend.database import AsyncSessionLocal

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/orgs", tags=["institutional"])


# ── Pydantic schemas ──────────────────────────────────────────────────────

class OrgCreate(BaseModel):
    name: str
    type: str = "college"
    domain: str | None = None
    city: str | None = None
    state: str | None = None
    country: str = "India"

class OrgResponse(BaseModel):
    id: str
    name: str
    type: str
    domain: str | None
    city: str | None
    country: str
    is_active: bool
    created_at: str

class CohortCreate(BaseModel):
    name: str
    academic_year: str | None = None
    department: str | None = None

class CohortResponse(BaseModel):
    id: str
    name: str
    academic_year: str | None
    department: str | None
    member_count: int = 0

class DriveCreate(BaseModel):
    title: str
    target_role: str
    company: str | None = None
    scheduled_at: datetime | None = None
    duration_minutes: int = 30
    interview_style: str = "formal"
    difficulty: str = "medium"
    topic_focus: list[str] = []
    question_count: int = 5

class DriveResponse(BaseModel):
    id: str
    title: str
    target_role: str
    company: str | None
    status: str
    allocated_count: int = 0
    completed_count: int = 0

class AllocateRequest(BaseModel):
    user_ids: list[str] = []
    emails: list[str] = []
    cohort_ids: list[str] = []
    deadline: datetime | None = None

class ExamAssignRequest(BaseModel):
    user_ids: list[str] = []
    emails: list[str] = []
    cohort_ids: list[str] = []
    deadline: datetime | None = None


# ── DB helper ─────────────────────────────────────────────────────────────

@asynccontextmanager
async def _db():
    """Async session context manager ensuring proper commit/close lifecycle."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


DEFAULT_DEMO_ORG_ID = "00000000-0000-0000-0000-000000000001"

def _normalize_org_id(org_id: str) -> str:
    """Normalize any string org_id to a valid UUID so PostgreSQL UUID constraints are respected."""
    if not org_id or org_id == "demo-org-id":
        return DEFAULT_DEMO_ORG_ID
    try:
        uuid.UUID(org_id)
        return org_id
    except ValueError:
        return str(uuid.uuid5(uuid.NAMESPACE_DNS, org_id))

async def _ensure_default_org(db, org_id: str = DEFAULT_DEMO_ORG_ID):
    """Seed demo organization on demand so initial queries never fail."""
    from sqlalchemy import text
    norm_id = _normalize_org_id(org_id)
    try:
        await db.execute(text("""
            INSERT INTO organizations (id, name, type, domain, city, state, country, is_active, created_at, updated_at)
            VALUES (:id, 'Hope Institute of Technology', 'college', 'hope.edu', 'Bangalore', 'Karnataka', 'India', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO NOTHING
        """), {"id": norm_id})
        await db.commit()
    except Exception as e:
        logger.debug(f"Default org check: {e}")


async def _resolve_user_ids(db, user_ids: list, emails: list, cohort_ids: list) -> tuple[set, list]:
    """
    Union user IDs from direct IDs, email lookups, and cohort expansion.
    Auto-provisions placeholder accounts for previously unseen emails.
    """
    from sqlalchemy import text
    resolved = set(user_ids)
    not_found = []

    if emails:
        clean_emails = [e.strip().lower() for e in emails if e and "@" in e]
        if clean_emails:
            placeholders = ", ".join(f":e{i}" for i in range(len(clean_emails)))
            params = {f"e{i}": e for i, e in enumerate(clean_emails)}
            r = await db.execute(
                text(f"SELECT id, email FROM platform_users WHERE LOWER(email) IN ({placeholders})"), params,
            )
            found = {row["email"].lower(): str(row["id"]) for row in r.mappings().fetchall()}
            resolved.update(found.values())

            # Auto-provision accounts for any emails not yet registered
            missing_emails = [e for e in clean_emails if e not in found]
            for missing_email in missing_emails:
                new_uid = str(uuid.uuid5(uuid.NAMESPACE_URL, missing_email))
                disp_name = missing_email.split("@")[0].replace(".", " ").title()
                try:
                    await db.execute(text("""
                        INSERT INTO platform_users (id, email, name, role, auth_provider, data_consent_given, created_at, updated_at)
                        VALUES (:id, :email, :name, 'candidate', 'invited', FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        ON CONFLICT (id) DO UPDATE SET email = :email, updated_at = CURRENT_TIMESTAMP
                    """), {"id": new_uid, "email": missing_email, "name": disp_name})
                    resolved.add(new_uid)
                except Exception as ex:
                    logger.warning(f"Auto-provisioning email {missing_email} failed: {ex}")
                    not_found.append(missing_email)
            if missing_emails:
                await db.commit()

    if cohort_ids:
        placeholders = ", ".join(f":c{i}" for i in range(len(cohort_ids)))
        params = {f"c{i}": c for i, c in enumerate(cohort_ids)}
        r = await db.execute(
            text(f"SELECT user_id FROM cohort_members WHERE cohort_id IN ({placeholders})"), params,
        )
        resolved.update(str(row["user_id"]) for row in r.mappings().fetchall())

    return resolved, not_found


# ── Organizations ─────────────────────────────────────────────────────────

@router.post("/", response_model=OrgResponse)
async def create_org(
    body: OrgCreate,
    user: dict = require_role("admin"),
):
    try:
        from sqlalchemy import text
        async with _db() as db:
            org_id = str(uuid.uuid4())
            await db.execute(text("""
                INSERT INTO organizations (id, name, type, domain, city, state, country, is_active, created_at, updated_at)
                VALUES (:id, :name, :type, :domain, :city, :state, :country, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """), {"id": org_id, "name": body.name, "type": body.type,
                   "domain": body.domain, "city": body.city, "state": body.state, "country": body.country})
            await db.commit()
            return OrgResponse(id=org_id, name=body.name, type=body.type,
                               domain=body.domain, city=body.city, country=body.country,
                               is_active=True, created_at=datetime.utcnow().isoformat())
    except Exception as e:
        logger.error(f"create_org failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Failed to create organization")


@router.get("/{org_id}", response_model=OrgResponse)
async def get_org(org_id: str, user: dict = Depends(get_current_user)):
    org_id = _normalize_org_id(org_id)
    try:
        from sqlalchemy import text
        async with _db() as db:
            await _ensure_default_org(db, org_id)
            r = await db.execute(text("SELECT * FROM organizations WHERE id = :id"), {"id": org_id})
            row = r.mappings().fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Organization not found")
            return OrgResponse(
                id=str(row["id"]), name=row["name"], type=row["type"],
                domain=row.get("domain"), city=row.get("city"), country=row["country"],
                is_active=bool(row["is_active"]), created_at=str(row["created_at"]),
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_org failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch organization")


@router.get("/{org_id}/stats")
async def get_org_stats(org_id: str, user: dict = require_role("admin", "faculty")):
    """Aggregate analytics: total candidates, drives, completion rates."""
    org_id = _normalize_org_id(org_id)
    try:
        from sqlalchemy import text
        async with _db() as db:
            await _ensure_default_org(db, org_id)
            r = await db.execute(text("""
                SELECT
                    COUNT(DISTINCT cm.user_id) AS total_candidates,
                    COUNT(DISTINCT c.id) AS total_cohorts,
                    COUNT(DISTINCT pd.id) AS total_drives,
                    COUNT(DISTINCT CASE WHEN da.status = 'completed' THEN da.id END) AS completed_interviews
                FROM organizations o
                LEFT JOIN cohorts c ON c.org_id = o.id
                LEFT JOIN cohort_members cm ON cm.cohort_id = c.id
                LEFT JOIN placement_drives pd ON pd.org_id = o.id
                LEFT JOIN drive_allocations da ON da.drive_id = pd.id
                WHERE o.id = :org_id
            """), {"org_id": org_id})
            row = r.mappings().fetchone()
            return dict(row) if row else {
                "total_candidates": 0, "total_cohorts": 0,
                "total_drives": 0, "completed_interviews": 0
            }
    except Exception as e:
        logger.error(f"get_org_stats failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch stats")


# ── Cohorts ───────────────────────────────────────────────────────────────

@router.post("/{org_id}/cohorts", response_model=CohortResponse)
async def create_cohort(org_id: str, body: CohortCreate, user: dict = require_role("admin", "faculty")):
    org_id = _normalize_org_id(org_id)
    try:
        from sqlalchemy import text
        async with _db() as db:
            await _ensure_default_org(db, org_id)
            cid = str(uuid.uuid4())
            await db.execute(text("""
                INSERT INTO cohorts (id, org_id, name, academic_year, department, created_at)
                VALUES (:id, :org_id, :name, :year, :dept, CURRENT_TIMESTAMP)
            """), {"id": cid, "org_id": org_id, "name": body.name,
                   "year": body.academic_year, "dept": body.department})
            await db.commit()
            return CohortResponse(id=cid, name=body.name,
                                  academic_year=body.academic_year, department=body.department)
    except Exception as e:
        logger.error(f"create_cohort failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to create cohort")


@router.get("/{org_id}/cohorts")
async def list_cohorts(org_id: str, user: dict = require_role("admin", "faculty")):
    org_id = _normalize_org_id(org_id)
    try:
        from sqlalchemy import text
        async with _db() as db:
            await _ensure_default_org(db, org_id)
            r = await db.execute(text("""
                SELECT c.id, c.name, c.academic_year, c.department,
                       COUNT(cm.user_id) AS member_count
                FROM cohorts c
                LEFT JOIN cohort_members cm ON cm.cohort_id = c.id
                WHERE c.org_id = :org_id AND c.is_active = TRUE
                GROUP BY c.id ORDER BY c.created_at DESC
            """), {"org_id": org_id})
            return [dict(row) for row in r.mappings().fetchall()]
    except Exception as e:
        logger.error(f"list_cohorts failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to list cohorts")


@router.post("/{org_id}/cohorts/{cohort_id}/members")
async def add_cohort_members(
    org_id: str, cohort_id: str,
    body: AllocateRequest,
    user: dict = require_role("admin", "faculty"),
):
    try:
        from sqlalchemy import text
        async with _db() as db:
            resolved, _ = await _resolve_user_ids(db, body.user_ids, body.emails, body.cohort_ids)
            added = 0
            for uid in resolved:
                try:
                    await db.execute(text("""
                        INSERT INTO cohort_members (id, cohort_id, user_id, added_at)
                        VALUES (:id, :cohort_id, :user_id, CURRENT_TIMESTAMP)
                        ON CONFLICT (cohort_id, user_id) DO NOTHING
                    """), {"id": str(uuid.uuid4()), "cohort_id": cohort_id, "user_id": uid})
                    added += 1
                except Exception:
                    pass
            await db.commit()
            return {"added": added, "cohort_id": cohort_id}
    except Exception as e:
        logger.error(f"add_cohort_members failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to add members")


# ── Placement Drives (AI Interviews) ──────────────────────────────────────

@router.post("/{org_id}/drives", response_model=DriveResponse)
async def create_drive(org_id: str, body: DriveCreate, user: dict = require_role("admin", "faculty")):
    org_id = _normalize_org_id(org_id)
    try:
        from sqlalchemy import text
        async with _db() as db:
            await _ensure_default_org(db, org_id)
            did = str(uuid.uuid4())
            await db.execute(text("""
                INSERT INTO placement_drives
                  (id, org_id, title, target_role, company, scheduled_at,
                   duration_minutes, interview_style, difficulty, status,
                   topic_focus, question_count,
                   created_by, created_at, updated_at)
                VALUES (:id, :org_id, :title, :role, :company, :sched,
                        :dur, :style, :diff, 'active',
                        :topic_focus, :question_count,
                        :creator, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """), {"id": did, "org_id": org_id, "title": body.title,
                   "role": body.target_role, "company": body.company,
                   "sched": body.scheduled_at, "dur": body.duration_minutes,
                   "style": body.interview_style, "diff": body.difficulty,
                   "topic_focus": ",".join(body.topic_focus),
                   "question_count": body.question_count,
                   "creator": user.get("id")})
            await db.commit()
            return DriveResponse(id=did, title=body.title, target_role=body.target_role,
                                 company=body.company, status="active")
    except Exception as e:
        logger.error(f"create_drive failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to create drive")


@router.get("/{org_id}/drives")
async def list_drives(org_id: str, user: dict = require_role("admin", "faculty")):
    org_id = _normalize_org_id(org_id)
    try:
        from sqlalchemy import text
        async with _db() as db:
            await _ensure_default_org(db, org_id)
            r = await db.execute(text("""
                SELECT pd.id, pd.title, pd.target_role, pd.company, pd.status,
                       pd.interview_style, pd.difficulty, pd.duration_minutes,
                       COUNT(da.id) AS allocated_count,
                       COUNT(CASE WHEN da.status = 'completed' THEN 1 END) AS completed_count
                FROM placement_drives pd
                LEFT JOIN drive_allocations da ON da.drive_id = pd.id
                WHERE pd.org_id = :org_id
                GROUP BY pd.id ORDER BY pd.created_at DESC
            """), {"org_id": org_id})
            return [dict(row) for row in r.mappings().fetchall()]
    except Exception as e:
        logger.error(f"list_drives failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to list drives")


@router.post("/{org_id}/drives/{drive_id}/allocate")
async def allocate_candidates(
    org_id: str, drive_id: str,
    body: AllocateRequest,
    user: dict = require_role("admin", "faculty"),
):
    """Assign an AI interview drive to candidates via IDs, email addresses, or cohorts."""
    org_id = _normalize_org_id(org_id)
    try:
        from sqlalchemy import text
        async with _db() as db:
            resolved, not_found = await _resolve_user_ids(db, body.user_ids, body.emails, body.cohort_ids)
            allocated = 0
            for uid in resolved:
                try:
                    existing = await db.execute(text("""
                        SELECT id FROM drive_allocations WHERE drive_id = :did AND user_id = :uid
                    """), {"did": drive_id, "uid": uid})
                    if not existing.fetchone():
                        await db.execute(text("""
                            INSERT INTO drive_allocations (id, drive_id, user_id, status, allocated_at)
                            VALUES (:id, :drive_id, :user_id, 'pending', CURRENT_TIMESTAMP)
                        """), {"id": str(uuid.uuid4()), "drive_id": drive_id, "user_id": uid})
                        allocated += 1
                except Exception as ex:
                    logger.warning(f"Error allocating candidate {uid}: {ex}")
            await db.commit()
            return {"allocated": allocated, "drive_id": drive_id, "skipped": len(resolved) - allocated, "not_found_emails": not_found}
    except Exception as e:
        logger.error(f"allocate_candidates failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to allocate candidates")


@router.post("/{org_id}/drives/{drive_id}/allocate/csv")
async def allocate_candidates_csv(
    org_id: str, drive_id: str,
    file: UploadFile = File(...),
    user: dict = require_role("admin", "faculty"),
):
    """Bulk allocate interview candidates via CSV upload."""
    try:
        content = (await file.read()).decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(content))
        emails = []
        if reader.fieldnames and "email" in [f.lower().strip() for f in reader.fieldnames]:
            email_col = next(f for f in reader.fieldnames if f.lower().strip() == "email")
            for row in reader:
                val = row.get(email_col, "").strip()
                if val and "@" in val:
                    emails.append(val)
        else:
            reader2 = csv.reader(io.StringIO(content))
            for row in reader2:
                if row and "@" in row[0].strip():
                    emails.append(row[0].strip())

        if not emails:
            raise HTTPException(status_code=400, detail="No valid emails found in CSV")

        body = AllocateRequest(emails=emails)
        return await allocate_candidates(org_id, drive_id, body, user)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"allocate_candidates_csv failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to process CSV")


@router.get("/{org_id}/drives/{drive_id}/results")
async def get_drive_results(org_id: str, drive_id: str, user: dict = require_role("admin", "faculty")):
    """Per-candidate results for a placement drive with scores & scorecards."""
    try:
        from sqlalchemy import text
        async with _db() as db:
            r = await db.execute(text("""
                SELECT
                    pu.id AS user_id, pu.name, pu.email,
                    da.status AS allocation_status,
                    da.allocated_at, da.completed_at,
                    cs.overall_score, cs.readiness_score, cs.rubric_band, cs.dimension_scores
                FROM drive_allocations da
                JOIN platform_users pu ON pu.id = da.user_id
                LEFT JOIN candidate_scorecards cs ON cs.user_id = pu.id
                WHERE da.drive_id = :drive_id
                ORDER BY da.completed_at DESC NULLS LAST, da.allocated_at DESC
            """), {"drive_id": drive_id})
            rows = r.mappings().fetchall()
            return [
                {
                    "user_id": str(row["user_id"]),
                    "name": row["name"],
                    "email": row["email"],
                    "allocation_status": row["allocation_status"],
                    "overall_score": row["overall_score"],
                    "readiness_score": row["readiness_score"],
                    "rubric_band": row["rubric_band"],
                    "dimension_scores": row["dimension_scores"],
                    "allocated_at": str(row["allocated_at"]) if row["allocated_at"] else None,
                    "completed_at": str(row["completed_at"]) if row["completed_at"] else None,
                }
                for row in rows
            ]
    except Exception as e:
        logger.error(f"get_drive_results failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch drive results")


# ── Exam Assignment (Formal Coding Tests) ────────────────────────────────

class OrgExamCreateRequest(BaseModel):
    title: str
    description: str = "Formal Scheduled Coding Examination"
    duration_minutes: int = 60
    difficulty: str = "medium"
    seb_required: bool = True
    max_infractions: int = 3
    question_ids: list[str | int] = []


@router.post("/{org_id}/exams/create")
async def create_exam_for_org(
    org_id: str,
    req: OrgExamCreateRequest,
    user: dict = require_role("admin", "faculty"),
):
    """Admin creates a formal exam scoped to an org.

    Note: formal_exams are global resources (no org_id column).
    The org_id URL parameter serves as RBAC context only — it ensures
    the caller is authenticated as admin/faculty of an org.
    All admins share the same exam pool; org-scoping is via exam_assignments.
    """
    from backend.api.exams import CreateExamRequest, create_exam
    body = CreateExamRequest(
        title=req.title,
        description=req.description,
        duration_minutes=req.duration_minutes,
        difficulty=req.difficulty,
        seb_required=req.seb_required,
        max_infractions=req.max_infractions,
        question_ids=[str(q) for q in req.question_ids],
    )
    async with _db() as db:
        return await create_exam(body, db, user)


@router.get("/{org_id}/exams")
async def list_exams(org_id: str, user: dict = require_role("admin", "faculty")):
    try:
        from sqlalchemy import text
        async with _db() as db:
            r = await db.execute(text("""
                SELECT fe.id, fe.title, fe.description, fe.duration_minutes,
                       fe.difficulty, fe.seb_required, fe.max_infractions, fe.is_active, fe.created_at,
                       COUNT(ea.id) AS assigned_count,
                       COUNT(CASE WHEN ea.status = 'completed' THEN 1 END) AS completed_count,
                       ROUND(AVG(CASE WHEN ea.status = 'completed' THEN eat.score END), 1) AS avg_score
                FROM formal_exams fe
                LEFT JOIN exam_assignments ea ON ea.exam_id::text = fe.id::text
                LEFT JOIN exam_attempts eat ON eat.exam_id::text = fe.id::text AND eat.candidate_id::text = ea.user_id::text
                GROUP BY fe.id, fe.title, fe.description, fe.duration_minutes, fe.difficulty, fe.seb_required, fe.max_infractions, fe.is_active, fe.created_at
                ORDER BY fe.created_at DESC
            """))
            return [dict(row) for row in r.mappings().fetchall()]
    except Exception as e:
        logger.error(f"list_exams failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list exams")


@router.post("/{org_id}/exams/{exam_id}/assign")
async def assign_exam(
    org_id: str, exam_id: str,
    body: ExamAssignRequest,
    user: dict = require_role("admin", "faculty"),
):
    try:
        from sqlalchemy import text
        async with _db() as db:
            resolved, not_found = await _resolve_user_ids(db, body.user_ids, body.emails, body.cohort_ids)
            assigned = 0
            for uid in resolved:
                try:
                    existing = await db.execute(text("""
                        SELECT id FROM exam_assignments WHERE exam_id::text = :eid AND user_id::text = :uid
                    """), {"eid": str(exam_id), "uid": str(uid)})
                    if not existing.fetchone():
                        await db.execute(text("""
                            INSERT INTO exam_assignments (id, exam_id, user_id, status, deadline, assigned_at)
                            VALUES (:id, :exam_id, :user_id, 'pending', :deadline, CURRENT_TIMESTAMP)
                        """), {"id": str(uuid.uuid4()), "exam_id": str(exam_id), "user_id": str(uid), "deadline": body.deadline})
                        assigned += 1
                except Exception as ex:
                    logger.warning(f"Error assigning candidate {uid}: {ex}")
            await db.commit()
            return {"assigned": assigned, "skipped": len(resolved) - assigned, "not_found_emails": not_found}
    except Exception as e:
        logger.error(f"assign_exam failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Failed to assign exam")


@router.get("/{org_id}/exams/{exam_id}/assignments")
async def get_exam_assignments(
    org_id: str, exam_id: str,
    user: dict = require_role("admin", "faculty"),
):
    """List exam assignments with test scores, infraction strikes, and submission timestamps."""
    try:
        from sqlalchemy import text
        async with _db() as db:
            r = await db.execute(text("""
                SELECT pu.id AS user_id, pu.name, pu.email,
                       ea.status, ea.deadline, ea.assigned_at, ea.completed_at,
                       eat.score, eat.infraction_count, eat.status AS attempt_status, eat.submitted_at
                FROM exam_assignments ea
                JOIN platform_users pu ON pu.id::text = ea.user_id::text
                LEFT JOIN exam_attempts eat ON eat.exam_id::text = ea.exam_id::text AND eat.candidate_id::text = pu.id::text
                WHERE ea.exam_id::text = :exam_id
                ORDER BY ea.assigned_at DESC
            """), {"exam_id": str(exam_id)})
            return [dict(row) for row in r.mappings().fetchall()]
    except Exception as e:
        logger.error(f"get_exam_assignments failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch exam assignments")


@router.post("/{org_id}/exams/{exam_id}/assign/csv")
async def assign_exam_csv(
    org_id: str, exam_id: str,
    file: UploadFile = File(...),
    user: dict = require_role("admin", "faculty"),
):
    """Bulk assign exam via CSV upload."""
    try:
        content = (await file.read()).decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(content))
        emails = []
        if reader.fieldnames and "email" in [f.lower().strip() for f in reader.fieldnames]:
            email_col = next(f for f in reader.fieldnames if f.lower().strip() == "email")
            for row in reader:
                val = row.get(email_col, "").strip()
                if val and "@" in val:
                    emails.append(val)
        else:
            reader2 = csv.reader(io.StringIO(content))
            for row in reader2:
                if row and "@" in row[0].strip():
                    emails.append(row[0].strip())

        if not emails:
            raise HTTPException(status_code=400, detail="No valid emails found in CSV")

        body = ExamAssignRequest(emails=emails)
        return await assign_exam(org_id, exam_id, body, user)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"assign_exam_csv failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Failed to process CSV")


# ── Faculty Analytics ─────────────────────────────────────────────────────

@router.get("/{org_id}/analytics/summary")
async def analytics_summary(org_id: str, user: dict = require_role("admin", "faculty")):
    """Global KPIs: total tests assigned, attended/completed, completion rate, avg scores."""
    org_id = _normalize_org_id(org_id)
    try:
        from sqlalchemy import text
        async with _db() as db:
            await _ensure_default_org(db, org_id)
            exam_stats = await db.execute(text("""
                SELECT
                    COUNT(ea.id) AS total_assigned_exams,
                    COUNT(CASE WHEN ea.status = 'completed' THEN 1 END) AS total_completed_exams,
                    ROUND(AVG(CASE WHEN ea.status = 'completed' THEN eat.score END), 1) AS avg_exam_score
                FROM exam_assignments ea
                LEFT JOIN exam_attempts eat ON eat.exam_id::text = ea.exam_id::text AND eat.candidate_id::text = ea.user_id::text
            """))
            es = dict(exam_stats.mappings().fetchone() or {})

            drive_stats = await db.execute(text("""
                SELECT
                    COUNT(da.id) AS total_allocated_interviews,
                    COUNT(CASE WHEN da.status = 'completed' THEN 1 END) AS total_completed_interviews,
                    ROUND(AVG(CASE WHEN da.status = 'completed' THEN cs.readiness_score END), 1) AS avg_interview_readiness,
                    ROUND(AVG(CASE WHEN da.status = 'completed' THEN cs.overall_score END), 1) AS avg_interview_score
                FROM drive_allocations da
                LEFT JOIN candidate_scorecards cs ON cs.user_id::text = da.user_id::text
            """))
            ds = dict(drive_stats.mappings().fetchone() or {})

            total_assigned = (es.get("total_assigned_exams") or 0) + (ds.get("total_allocated_interviews") or 0)
            total_completed = (es.get("total_completed_exams") or 0) + (ds.get("total_completed_interviews") or 0)
            completion_rate = round((total_completed / total_assigned * 100), 1) if total_assigned > 0 else 0.0

            return {
                "total_assigned": total_assigned,
                "total_completed": total_completed,
                "completion_rate": completion_rate,
                "exams": es,
                "interviews": ds,
            }
    except Exception as e:
        logger.error(f"analytics_summary failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch analytics summary")


@router.get("/{org_id}/analytics/overview")
async def analytics_overview(org_id: str, user: dict = require_role("admin", "faculty")):
    """Cohort-level aggregate: avg scores, completion rates."""
    org_id = _normalize_org_id(org_id)
    try:
        from sqlalchemy import text
        async with _db() as db:
            await _ensure_default_org(db, org_id)
            r = await db.execute(text("""
                SELECT
                    c.name AS cohort_name,
                    COUNT(DISTINCT cm.user_id) AS total_students,
                    COUNT(DISTINCT da.id) AS interviews_allocated,
                    COUNT(DISTINCT CASE WHEN da.status = 'completed' THEN da.id END) AS interviews_completed,
                    ROUND(AVG(cs.overall_score), 2) AS avg_overall_score,
                    ROUND(AVG(cs.readiness_score), 1) AS avg_readiness
                FROM cohorts c
                JOIN cohort_members cm ON cm.cohort_id::text = c.id::text
                LEFT JOIN drive_allocations da ON da.user_id::text = cm.user_id::text
                LEFT JOIN candidate_scorecards cs ON cs.user_id::text = cm.user_id::text
                WHERE c.org_id::text = :org_id AND c.is_active = TRUE
                GROUP BY c.id, c.name
                ORDER BY c.name
            """), {"org_id": org_id})
            return [dict(row) for row in r.mappings().fetchall()]
    except Exception as e:
        logger.error(f"analytics_overview failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch analytics")


@router.get("/{org_id}/analytics/candidates")
async def analytics_candidates(
    org_id: str,
    cohort_id: str | None = None,
    user: dict = require_role("admin", "faculty"),
):
    """Per-candidate performance summary across both coding exams and interview drives."""
    org_id = _normalize_org_id(org_id)
    try:
        from sqlalchemy import text
        async with _db() as db:
            await _ensure_default_org(db, org_id)
            params: dict = {"org_id": org_id}
            cohort_filter = ""
            if cohort_id:
                cohort_filter = "AND cm.cohort_id::text = :cohort_id"
                params["cohort_id"] = cohort_id

            r = await db.execute(text(f"""
                SELECT
                    pu.id AS user_id,
                    pu.name,
                    pu.email,
                    COUNT(DISTINCT da.id) AS total_interviews_assigned,
                    COUNT(DISTINCT CASE WHEN da.status = 'completed' THEN da.id END) AS total_interviews_done,
                    ROUND(AVG(cs.overall_score), 2) AS avg_interview_score,
                    ROUND(AVG(cs.readiness_score), 1) AS avg_readiness,
                    MAX(cs.rubric_band) AS best_band,
                    COUNT(DISTINCT ea.id) AS total_exams_assigned,
                    COUNT(DISTINCT CASE WHEN ea.status = 'completed' THEN ea.id END) AS total_exams_done,
                    ROUND(AVG(CASE WHEN ea.status = 'completed' THEN eat.score END), 1) AS avg_exam_score,
                    MAX(da.completed_at) AS last_activity_at
                FROM platform_users pu
                LEFT JOIN cohort_members cm ON cm.user_id::text = pu.id::text
                LEFT JOIN cohorts c ON c.id::text = cm.cohort_id::text AND c.org_id::text = :org_id
                LEFT JOIN drive_allocations da ON da.user_id::text = pu.id::text
                LEFT JOIN candidate_scorecards cs ON cs.user_id::text = pu.id::text
                LEFT JOIN exam_assignments ea ON ea.user_id::text = pu.id::text
                LEFT JOIN exam_attempts eat ON eat.exam_id::text = ea.exam_id::text AND eat.candidate_id::text = pu.id::text
                WHERE pu.role = 'candidate' {cohort_filter}
                GROUP BY pu.id, pu.name, pu.email
                ORDER BY avg_readiness DESC NULLS LAST, avg_exam_score DESC NULLS LAST
            """), params)
            return [
                {
                    "user_id": str(row["user_id"]),
                    "name": row["name"],
                    "email": row["email"],
                    "total_interviews_assigned": row["total_interviews_assigned"],
                    "total_interviews_done": row["total_interviews_done"],
                    "avg_interview_score": row["avg_interview_score"],
                    "avg_readiness": row["avg_readiness"],
                    "best_band": row["best_band"],
                    "total_exams_assigned": row["total_exams_assigned"],
                    "total_exams_done": row["total_exams_done"],
                    "avg_exam_score": row["avg_exam_score"],
                    "last_activity_at": str(row["last_activity_at"]) if row["last_activity_at"] else None,
                }
                for row in r.mappings().fetchall()
            ]
    except Exception as e:
        logger.error(f"analytics_candidates failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch candidate analytics")


# ── Candidate-Facing: My Assignments ─────────────────────────────────────

me_router = APIRouter(prefix="/me", tags=["candidate-assignments"])


@me_router.get("/assignments")
async def get_my_assignments(user: dict = Depends(get_current_user)):
    """Return logged-in candidate's interview + exam assignments."""
    try:
        from sqlalchemy import text
        async with _db() as db:
            uid = user["id"]
            uemail = user.get("email", "").lower()

            interviews_q = await db.execute(text("""
                SELECT da.id, da.drive_id, da.status, da.session_id,
                       pd.title, pd.target_role, pd.company,
                       pd.scheduled_at, pd.duration_minutes,
                       pd.interview_style, pd.difficulty,
                       cs.overall_score, cs.readiness_score, cs.rubric_band
                FROM drive_allocations da
                JOIN placement_drives pd ON pd.id::text = da.drive_id::text
                LEFT JOIN candidate_scorecards cs ON cs.user_id::text = da.user_id::text
                WHERE da.user_id::text = :uid OR da.user_id::text IN (SELECT id::text FROM platform_users WHERE LOWER(email) = :uemail)
                ORDER BY pd.scheduled_at DESC NULLS LAST, da.allocated_at DESC
            """), {"uid": str(uid), "uemail": str(uemail)})
            interviews = [dict(r) for r in interviews_q.mappings().fetchall()]

            exams_q = await db.execute(text("""
                SELECT ea.id, ea.status, ea.exam_id, ea.deadline,
                       fe.title, fe.description, fe.duration_minutes, fe.max_infractions,
                       eat.score, eat.status AS attempt_status
                FROM exam_assignments ea
                LEFT JOIN formal_exams fe ON fe.id::text = ea.exam_id::text
                LEFT JOIN exam_attempts eat ON eat.exam_id::text = ea.exam_id::text AND (eat.candidate_id::text = ea.user_id::text OR eat.candidate_id::text = :uid)
                WHERE ea.user_id::text = :uid OR ea.user_id::text IN (SELECT id::text FROM platform_users WHERE LOWER(email) = :uemail)
                ORDER BY ea.deadline DESC NULLS LAST, ea.assigned_at DESC
            """), {"uid": str(uid), "uemail": str(uemail)})
            exams = [dict(r) for r in exams_q.mappings().fetchall()]

            return {"interviews": interviews, "exams": exams}
    except Exception as e:
        logger.error(f"get_my_assignments failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch assignments")


def create_institutional_api(app):
    app.include_router(router)
    app.include_router(me_router)
    logger.info("Institutional API routes registered (/orgs/*, /me/*)")

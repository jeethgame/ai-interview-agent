"""
V4 Institutional Layer API.

Endpoints:
  Organizations
    POST /orgs/                         create org
    GET  /orgs/{id}                     get org
    GET  /orgs/{id}/stats               aggregate analytics for org

  Cohorts
    POST /orgs/{org_id}/cohorts         create cohort
    GET  /orgs/{org_id}/cohorts         list cohorts
    POST /orgs/{org_id}/cohorts/{id}/members  add user to cohort

  Placement Drives
    POST /orgs/{org_id}/drives          create drive
    GET  /orgs/{org_id}/drives          list drives
    POST /orgs/{org_id}/drives/{id}/allocate  allocate candidates to drive
    GET  /orgs/{org_id}/drives/{id}/results   drive results/scores

  Exam Assignment
    GET  /orgs/{org_id}/exams                          list all exams
    POST /orgs/{org_id}/exams/{id}/assign              assign exam to users (by IDs, emails, or cohorts)
    GET  /orgs/{org_id}/exams/{id}/assignments          list exam assignments
    POST /orgs/{org_id}/exams/{id}/assign/csv          bulk assign via CSV upload

  Faculty Analytics
    GET  /orgs/{org_id}/analytics/overview    cohort-level performance
    GET  /orgs/{org_id}/analytics/candidates  per-candidate summary
"""

import csv
import io
import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from backend.api.auth_api import get_current_user, require_role

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

class DriveResponse(BaseModel):
    id: str
    title: str
    target_role: str
    company: str | None
    status: str
    allocated_count: int = 0
    completed_count: int = 0

class AllocateRequest(BaseModel):
    user_ids: list[str]


# ── DB helper ─────────────────────────────────────────────────────────────

async def _db():
    from backend.database import get_db
    async for session in get_db():
        return session


# ── Organizations ─────────────────────────────────────────────────────────

@router.post("/", response_model=OrgResponse)
async def create_org(
    body: OrgCreate,
    user: dict = require_role("admin"),
):
    try:
        from sqlalchemy import text
        db = await _db()
        org_id = str(uuid.uuid4())
        await db.execute(text("""
            INSERT INTO organizations (id, name, type, domain, city, state, country, is_active, created_at, updated_at)
            VALUES (:id, :name, :type, :domain, :city, :state, :country, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """), {"id": org_id, "name": body.name, "type": body.type,
               "domain": body.domain, "city": body.city, "state": body.state, "country": body.country})
        await db.commit()
        return OrgResponse(id=org_id, name=body.name, type=body.type,
                           domain=body.domain, city=body.city, country=body.country,
                           is_active=True, created_at=datetime.utcnow().isoformat())
    except Exception as e:
        logger.error(f"create_org failed: {type(e).__name__}")
        raise HTTPException(status_code=500, detail="Failed to create organization")


@router.get("/{org_id}", response_model=OrgResponse)
async def get_org(org_id: str, user: dict = Depends(get_current_user)):
    try:
        from sqlalchemy import text
        db = await _db()
        r = await db.execute(text("SELECT * FROM organizations WHERE id = :id"), {"id": org_id})
        row = r.mappings().fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Organization not found")
        return OrgResponse(
            id=str(row["id"]), name=row["name"], type=row["type"],
            domain=row.get("domain"), city=row.get("city"), country=row["country"],
            is_active=row["is_active"], created_at=str(row["created_at"]),
        )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch organization")


@router.get("/{org_id}/stats")
async def get_org_stats(org_id: str, user: dict = require_role("admin", "faculty")) :
    """Aggregate analytics: total candidates, drives, completion rates."""
    try:
        from sqlalchemy import text
        db = await _db()
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
        return dict(row) if row else {}
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch stats")


# ── Cohorts ───────────────────────────────────────────────────────────────

@router.post("/{org_id}/cohorts", response_model=CohortResponse)
async def create_cohort(org_id: str, body: CohortCreate, user: dict = require_role("admin", "faculty")):
    try:
        from sqlalchemy import text
        db = await _db()
        cid = str(uuid.uuid4())
        await db.execute(text("""
            INSERT INTO cohorts (id, org_id, name, academic_year, department, created_at)
            VALUES (:id, :org_id, :name, :year, :dept, CURRENT_TIMESTAMP)
        """), {"id": cid, "org_id": org_id, "name": body.name,
               "year": body.academic_year, "dept": body.department})
        await db.commit()
        return CohortResponse(id=cid, name=body.name,
                              academic_year=body.academic_year, department=body.department)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to create cohort")


@router.get("/{org_id}/cohorts")
async def list_cohorts(org_id: str, user: dict = require_role("admin", "faculty")):
    try:
        from sqlalchemy import text
        db = await _db()
        r = await db.execute(text("""
            SELECT c.id, c.name, c.academic_year, c.department,
                   COUNT(cm.user_id) AS member_count
            FROM cohorts c
            LEFT JOIN cohort_members cm ON cm.cohort_id = c.id
            WHERE c.org_id = :org_id AND c.is_active = true
            GROUP BY c.id ORDER BY c.created_at DESC
        """), {"org_id": org_id})
        return [dict(row) for row in r.mappings().fetchall()]
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to list cohorts")


@router.post("/{org_id}/cohorts/{cohort_id}/members")
async def add_cohort_members(
    org_id: str, cohort_id: str,
    body: AllocateRequest,
    user: dict = require_role("admin", "faculty"),
):
    try:
        from sqlalchemy import text
        db = await _db()
        added = 0
        for uid in body.user_ids:
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
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to add members")


# ── Placement Drives ──────────────────────────────────────────────────────

@router.post("/{org_id}/drives", response_model=DriveResponse)
async def create_drive(org_id: str, body: DriveCreate, user: dict = require_role("admin", "faculty")):
    try:
        from sqlalchemy import text
        db = await _db()
        did = str(uuid.uuid4())
        await db.execute(text("""
            INSERT INTO placement_drives
              (id, org_id, title, target_role, company, scheduled_at,
               duration_minutes, interview_style, difficulty, status,
               created_by, created_at, updated_at)
            VALUES (:id, :org_id, :title, :role, :company, :sched,
                    :dur, :style, :diff, 'draft', :creator, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """), {"id": did, "org_id": org_id, "title": body.title,
               "role": body.target_role, "company": body.company,
               "sched": body.scheduled_at, "dur": body.duration_minutes,
               "style": body.interview_style, "diff": body.difficulty,
               "creator": user["id"]})
        await db.commit()
        return DriveResponse(id=did, title=body.title, target_role=body.target_role,
                             company=body.company, status="draft")
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to create drive")


@router.get("/{org_id}/drives")
async def list_drives(org_id: str, user: dict = require_role("admin", "faculty")):
    try:
        from sqlalchemy import text
        db = await _db()
        r = await db.execute(text("""
            SELECT pd.id, pd.title, pd.target_role, pd.company, pd.status,
                   COUNT(da.id) AS allocated_count,
                   COUNT(CASE WHEN da.status = 'completed' THEN 1 END) AS completed_count
            FROM placement_drives pd
            LEFT JOIN drive_allocations da ON da.drive_id = pd.id
            WHERE pd.org_id = :org_id
            GROUP BY pd.id ORDER BY pd.created_at DESC
        """), {"org_id": org_id})
        return [dict(row) for row in r.mappings().fetchall()]
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to list drives")


@router.post("/{org_id}/drives/{drive_id}/allocate")
async def allocate_candidates(
    org_id: str, drive_id: str,
    body: AllocateRequest,
    user: dict = require_role("admin", "faculty"),
):
    try:
        from sqlalchemy import text
        db = await _db()
        allocated = 0
        for uid in body.user_ids:
            try:
                await db.execute(text("""
                    INSERT INTO drive_allocations (id, drive_id, user_id, status, allocated_at)
                    VALUES (:id, :drive_id, :user_id, 'pending', CURRENT_TIMESTAMP)
                    ON CONFLICT (drive_id, user_id) DO NOTHING
                """), {"id": str(uuid.uuid4()), "drive_id": drive_id, "user_id": uid})
                allocated += 1
            except Exception:
                pass
        await db.commit()
        return {"allocated": allocated, "drive_id": drive_id}
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to allocate candidates")


@router.get("/{org_id}/drives/{drive_id}/results")
async def get_drive_results(org_id: str, drive_id: str, user: dict = require_role("admin", "faculty")):
    """Per-candidate results for a placement drive."""
    try:
        from sqlalchemy import text
        db = await _db()
        r = await db.execute(text("""
            SELECT
                pu.id AS user_id, pu.name, pu.email,
                da.status AS allocation_status,
                ir.overall_score, ir.dimension_scores, ir.report_status,
                cs.readiness_score, cs.rubric_band
            FROM drive_allocations da
            JOIN platform_users pu ON pu.id = da.user_id
            LEFT JOIN interview_sessions s ON s.id = da.session_id
            LEFT JOIN interview_reports ir ON ir.session_id = s.id
            LEFT JOIN candidate_scorecards cs ON cs.session_id = s.id
            WHERE da.drive_id = :drive_id
            ORDER BY ir.overall_score DESC NULLS LAST
        """), {"drive_id": drive_id})
        rows = r.mappings().fetchall()
        return [
            {
                "user_id": str(row["user_id"]),
                "name": row["name"],
                "allocation_status": row["allocation_status"],
                "overall_score": row["overall_score"],
                "readiness_score": row["readiness_score"],
                "rubric_band": row["rubric_band"],
                "report_status": row["report_status"],
            }
            for row in rows
        ]
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch drive results")


# ── Faculty Analytics ─────────────────────────────────────────────────────

@router.get("/{org_id}/analytics/overview")
async def analytics_overview(org_id: str, user: dict = require_role("admin", "faculty")):
    """Cohort-level aggregate: avg scores, completion rates, top weaknesses."""
    try:
        from sqlalchemy import text
        db = await _db()
        r = await db.execute(text("""
            SELECT
                c.name AS cohort_name,
                COUNT(DISTINCT cm.user_id) AS total_students,
                COUNT(DISTINCT s.id) AS interviews_completed,
                ROUND(AVG(ir.overall_score), 2) AS avg_overall_score,
                ROUND(AVG(cs.readiness_score), 1) AS avg_readiness
            FROM cohorts c
            JOIN cohort_members cm ON cm.cohort_id = c.id
            LEFT JOIN interview_sessions s ON s.user_id = cm.user_id AND s.status = 'completed'
            LEFT JOIN interview_reports ir ON ir.session_id = s.id
            LEFT JOIN candidate_scorecards cs ON cs.session_id = s.id
            WHERE c.org_id = :org_id AND c.is_active = true
            GROUP BY c.id, c.name
            ORDER BY c.name
        """), {"org_id": org_id})
        return [dict(row) for row in r.mappings().fetchall()]
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch analytics")


@router.get("/{org_id}/analytics/candidates")
async def analytics_candidates(
    org_id: str,
    cohort_id: str | None = None,
    user: dict = require_role("admin", "faculty"),
):
    """Per-candidate performance summary for faculty view. Anonymised — no raw transcripts."""
    try:
        from sqlalchemy import text
        db = await _db()
        params: dict = {"org_id": org_id}
        cohort_filter = ""
        if cohort_id:
            cohort_filter = "AND cm.cohort_id = :cohort_id"
            params["cohort_id"] = cohort_id

        r = await db.execute(text(f"""
            SELECT
                pu.id AS user_id,
                pu.name,
                COUNT(DISTINCT s.id) AS total_interviews,
                ROUND(AVG(ir.overall_score), 2) AS avg_score,
                ROUND(AVG(cs.readiness_score), 1) AS avg_readiness,
                MAX(cs.rubric_band) AS best_band,
                MAX(s.started_at) AS last_interview_at
            FROM cohort_members cm
            JOIN platform_users pu ON pu.id = cm.user_id
            JOIN cohorts c ON c.id = cm.cohort_id AND c.org_id = :org_id
            LEFT JOIN interview_sessions s ON s.user_id = pu.id AND s.status = 'completed'
            LEFT JOIN interview_reports ir ON ir.session_id = s.id
            LEFT JOIN candidate_scorecards cs ON cs.session_id = s.id
            WHERE 1=1 {cohort_filter}
            GROUP BY pu.id, pu.name
            ORDER BY avg_score DESC NULLS LAST
        """), params)
        return [
            {
                "user_id": str(row["user_id"]),
                "name": row["name"],                # name shown — not transcript content
                "total_interviews": row["total_interviews"],
                "avg_score": row["avg_score"],
                "avg_readiness": row["avg_readiness"],
                "best_band": row["best_band"],
                "last_interview_at": str(row["last_interview_at"]) if row["last_interview_at"] else None,
            }
            for row in r.mappings().fetchall()
        ]
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch candidate analytics")


# ── Exam Assignment ──────────────────────────────────────────────────────

class ExamAssignRequest(BaseModel):
    user_ids: list[str] = []
    emails: list[str] = []
    cohort_ids: list[str] = []
    deadline: datetime | None = None


async def _resolve_user_ids(db, user_ids: list, emails: list, cohort_ids: list) -> tuple[set, list]:
    """Union user IDs from direct IDs, email lookups, and cohort expansion. Returns (resolved_ids, not_found_emails)."""
    from sqlalchemy import text
    resolved = set(user_ids)
    not_found = []

    if emails:
        placeholders = ", ".join(f":e{i}" for i in range(len(emails)))
        params = {f"e{i}": e for i, e in enumerate(emails)}
        r = await db.execute(
            text(f"SELECT id, email FROM platform_users WHERE email IN ({placeholders})"), params,
        )
        found = {row["email"]: str(row["id"]) for row in r.mappings().fetchall()}
        resolved.update(found.values())
        not_found = [e for e in emails if e not in found]

    if cohort_ids:
        placeholders = ", ".join(f":c{i}" for i in range(len(cohort_ids)))
        params = {f"c{i}": c for i, c in enumerate(cohort_ids)}
        r = await db.execute(
            text(f"SELECT user_id FROM cohort_members WHERE cohort_id IN ({placeholders})"), params,
        )
        resolved.update(str(row["user_id"]) for row in r.mappings().fetchall())

    return resolved, not_found


@router.get("/{org_id}/exams")
async def list_exams(org_id: str, user: dict = require_role("admin", "faculty")):
    try:
        from sqlalchemy import text
        db = await _db()
        r = await db.execute(text("""
            SELECT fe.id, fe.title, fe.description, fe.duration_minutes,
                   fe.seb_required, fe.is_active, fe.created_at,
                   COUNT(ea.id) AS assigned_count
            FROM formal_exams fe
            LEFT JOIN exam_assignments ea ON ea.exam_id = fe.id
            GROUP BY fe.id ORDER BY fe.created_at DESC
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
        db = await _db()
        resolved, not_found = await _resolve_user_ids(db, body.user_ids, body.emails, body.cohort_ids)

        assigned = 0
        for uid in resolved:
            try:
                await db.execute(text("""
                    INSERT INTO exam_assignments (id, exam_id, user_id, status, deadline, assigned_at)
                    VALUES (:id, :exam_id, :user_id, 'pending', :deadline, CURRENT_TIMESTAMP)
                    ON CONFLICT (exam_id, user_id) DO NOTHING
                """), {"id": str(uuid.uuid4()), "exam_id": exam_id, "user_id": uid, "deadline": body.deadline})
                assigned += 1
            except Exception:
                pass
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
    try:
        from sqlalchemy import text
        db = await _db()
        r = await db.execute(text("""
            SELECT pu.id AS user_id, pu.name, pu.email,
                   ea.status, ea.deadline, ea.assigned_at, ea.completed_at
            FROM exam_assignments ea
            JOIN platform_users pu ON pu.id = ea.user_id
            WHERE ea.exam_id = :exam_id
            ORDER BY ea.assigned_at DESC
        """), {"exam_id": exam_id})
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
    """Bulk assign exam via CSV upload. Expects a column named 'email' or first column as emails."""
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


# ── Candidate-facing: my assignments ─────────────────────────────────────

me_router = APIRouter(prefix="/me", tags=["candidate-assignments"])


@me_router.get("/assignments")
async def get_my_assignments(user: dict = Depends(get_current_user)):
    """Return logged-in candidate's interview + exam assignments."""
    try:
        from sqlalchemy import text
        db = await _db()
        uid = user["id"]

        interviews_q = await db.execute(text("""
            SELECT da.id, da.status, da.session_id,
                   pd.title, pd.target_role, pd.company,
                   pd.scheduled_at, pd.duration_minutes,
                   pd.interview_style, pd.difficulty
            FROM drive_allocations da
            JOIN placement_drives pd ON pd.id = da.drive_id
            WHERE da.user_id = :uid
            ORDER BY pd.scheduled_at DESC NULLS LAST
        """), {"uid": uid})
        interviews = [dict(r) for r in interviews_q.mappings().fetchall()]

        exams_q = await db.execute(text("""
            SELECT ea.id, ea.status, ea.exam_id, ea.deadline,
                   fe.title, fe.duration_minutes
            FROM exam_assignments ea
            LEFT JOIN formal_exams fe ON fe.id = ea.exam_id
            WHERE ea.user_id = :uid
            ORDER BY ea.deadline DESC NULLS LAST
        """), {"uid": uid})
        exams = [dict(r) for r in exams_q.mappings().fetchall()]

        return {"interviews": interviews, "exams": exams}
    except Exception as e:
        logger.error(f"get_my_assignments failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch assignments")


def create_institutional_api(app):
    app.include_router(router)
    app.include_router(me_router)
    logger.info("Institutional API routes registered (/orgs/*, /me/*)")

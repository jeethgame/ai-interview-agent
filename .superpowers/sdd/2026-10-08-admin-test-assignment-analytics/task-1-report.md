# Task 1 Report — Add Auth + Difficulty to Exam Creation

**Status:** DONE

## Commits

- `6f1113f` feat(exams): add difficulty field to create endpoint and FormalExam model

## Changes made

- `backend/models/formal_exam.py` — added `difficulty = Column(String(50), default="medium")` to `FormalExam`
- `backend/api/exams.py` — added `difficulty: str = "medium"` to `CreateExamRequest` and `ExamResponse`; passes field through `create_exam()` and `get_exam()` handlers; `require_role("admin", "faculty")` was already present
- `backend/database/__init__.py` — added `ALTER TABLE formal_exams ADD COLUMN difficulty VARCHAR(50) DEFAULT 'medium'` with bare `except: pass` guard inside `init_db()`

## Test summary

- Admin token → `POST /exams/create` with `difficulty=hard` → `200 {"difficulty":"hard",...}` ✓
- Candidate token → `POST /exams/create` → `403 Access forbidden` ✓
- `ruff check backend/` → All checks passed ✓
- `docker compose up --build -d` → both containers healthy ✓

---

## Fix Round 1

**Status:** DONE

### Commits

- `18a1b17` fix(exams): add org-scoped exam create endpoint, fix getattr

### Changes made

- `backend/api/institutional_api.py` — added `OrgExamCreateRequest` Pydantic model and `POST /{org_id}/exams/create` endpoint that proxies to `create_exam()` from `exams.py` using the existing `_db()` context manager
- `backend/api/exams.py` — replaced `getattr(exam, "difficulty", "medium")` with `exam.difficulty` in `get_exam()`
- `backend/api/auth_api.py` — applied `ruff --fix` for two pre-existing I001 import-order issues (blank line normalization)

### Test summary

- Admin token → `POST /orgs/demo-org-001/exams/create` with `difficulty=hard` → `200 {"difficulty":"hard",...}` ✓
- `ruff check backend/` → All checks passed ✓
- Both containers healthy ✓

# Integration Merge Plan
*team-a/integration + team-b/integration → main*

---

## What Each Branch Has

### Our side — `team-a/integration` (local)
| Area | Status |
|---|---|
| Voice interview (Deepgram STT + TTS) | ✅ Working |
| Interview cockpit UI (WebGL wave, chat stream) | ✅ Working |
| Interview agent (orchestrator, interviewer, coach) | ✅ Working |
| LLM (Groq), session management, auth | ✅ Working |
| Frontend: Vite + React (in `frontend/src/`) | ✅ Working |
| Backend: service registry, mock DB | ✅ Working |

### Their side — `team-b/integration` (Santhosh)
| Area | Files |
|---|---|
| Monaco code editor (A1) | `frontend/components/team_a/MonacoEditor.tsx` |
| Judge0 code execution (A2) | `backend/api/execution.py`, `TestConsole.tsx` |
| Live cockpit text panel (A3) | `frontend/components/team_a/LiveCockpit.tsx` |
| Probing agent API (A4) | `backend/api/probing.py`, `ProbingStatus.tsx` |
| Code review (A5) | `backend/api/code_review.py`, `CodeReviewCard.tsx` |
| Auth (B1) | `backend/api/auth.py` |
| Resume parsing + claims (B2) | `backend/api/resumes.py`, `ResumeViewer.tsx` |
| Question bank (B3) | `backend/api/questions.py`, `QuestionBank.tsx` |
| Formal exam + SEB portal (B4) | `backend/api/exams.py`, `ExamPortal.tsx` |
| Rubric scorer + 30-day coach (B5) | `backend/api/evaluations.py`, `ScorecardView.tsx` |
| Draft auto-save | `backend/api/drafts.py` |
| SQLAlchemy models + alembic | `backend/models/`, `backend/alembic/` |
| Frontend: Vite + React (in `frontend/components/`) | Works but different folder structure |

---

## The Conflicts

### Critical conflicts (must resolve before merge)

| File | Our version | Their version | Problem |
|---|---|---|---|
| `backend/main.py` | Our service registry + voice routes | Their SQLAlchemy routers | Completely different entry points |
| `backend/config/__init__.py` | Our config class | They have `backend/config.py` (different file) | Two config systems |
| `backend/api/speech/__init__.py` | Has Deepgram STT + TTS exports | Theirs is the old version | Ours must win |
| `backend/api/speech_api.py` | Deepgram handler | Old Polly handler | Ours must win |
| `frontend/src/` vs `frontend/components/` | Our Vite SPA components | Their Vite components in different folder | Folder structure mismatch |

### Non-conflicting — safe to take from team-b directly
- `backend/models/` — all new, we have none of these
- `backend/alembic/` — all new
- `backend/database.py` — their SQLAlchemy engine (we use mock, they use async SQLite/Postgres)
- `backend/api/execution.py` — Judge0, new endpoint
- `backend/api/probing.py` — probing agent, new endpoint
- `backend/api/code_review.py` — code review, new endpoint
- `backend/api/resumes.py` — resume parsing, new endpoint
- `backend/api/questions.py` — question bank, new endpoint
- `backend/api/exams.py` — formal exam, new endpoint
- `backend/api/evaluations.py` — rubric scorer, new endpoint
- `backend/api/drafts.py` — draft auto-save, new endpoint
- `frontend/components/team_a/` — Monaco, TestConsole, ProbingStatus, CodeReviewCard
- `frontend/components/team_b/` — AuthModal, ResumeViewer, QuestionBank, ExamPortal, ScorecardView

---

## Merge Strategy

**Approach: Start from `team-a/integration`, cherry-pick team-b additions.**
Do NOT merge from main (Judge0 branch conflicts with more things). Do NOT git merge team-b/integration wholesale (too many conflicts to auto-resolve).

---

## Phase 1 — Backend: Add Team-B API routes (1 day)

### Step 1.1 — Copy their new files directly (no conflicts)
```bash
git checkout origin/team-b/integration -- \
  backend/models/ \
  backend/alembic/ \
  backend/database.py \
  backend/config.py \
  backend/api/execution.py \
  backend/api/probing.py \
  backend/api/code_review.py \
  backend/api/resumes.py \
  backend/api/questions.py \
  backend/api/exams.py \
  backend/api/evaluations.py \
  backend/api/drafts.py \
  backend/api/sessions.py \
  backend/api/auth.py
```

### Step 1.2 — Wire their routers into our main.py
Add to `backend/main.py` after our existing routers:
```python
from backend.api.execution import router as execution_router
from backend.api.probing import router as probing_router
from backend.api.code_review import router as code_review_router
from backend.api.resumes import router as resumes_router
from backend.api.questions import router as questions_router
from backend.api.exams import router as exams_router
from backend.api.evaluations import router as evaluations_router
from backend.api.drafts import router as drafts_router

# Register in app (their endpoints use SQLAlchemy DB dependency)
app.include_router(execution_router)
app.include_router(probing_router)
...
```

### Step 1.3 — Init their DB on startup
Their endpoints use `get_db()` from `backend/database.py`. Add to our startup:
```python
from backend.database import init_db
# in lifespan/startup:
await init_db()
```

### Step 1.4 — Verify no import conflicts
Their `backend/config.py` (Settings class) is imported by their new API files.
Our `backend/config/__init__.py` is imported by our existing files.
Both can coexist — different import paths.

---

## Phase 2 — Frontend: Integrate Team-B Components (1 day)

### Step 2.1 — Copy their component folders into our src
```bash
git checkout origin/team-b/integration -- \
  frontend/components/
```
Then move into our structure:
```
frontend/src/components/team_a/   ← MonacoEditor, TestConsole, ProbingStatus, CodeReviewCard
frontend/src/components/team_b/   ← AuthModal, ResumeViewer, QuestionBank, ExamPortal, ScorecardView
```

### Step 2.2 — Add Monaco editor to interview session
`MonacoEditor.tsx` + `TestConsole.tsx` should mount when interview needs a coding question.
Wire into `InterviewSession.tsx` as a collapsible panel — triggered by interviewer.

### Step 2.3 — Add tabs for new features in Index.tsx
Their `page.tsx` shows how they wire up tabs (track1, track2, scorecard, resume).
Port those tabs into our `Index.tsx`:
- Track 1: voice interview (existing)
- Track 2: formal exam portal (ExamPortal.tsx)
- Scorecard: ScorecardView.tsx
- Resume: ResumeViewer.tsx

---

## Phase 3 — Integration Testing (0.5 day)

1. Start backend — check all 15+ routes register cleanly
2. Start frontend — check all tabs render
3. Test voice interview still works (Deepgram STT + TTS)
4. Test code execution (Judge0 via execution.py)
5. Test resume upload (resumes.py)

---

## Phase 4 — Push to main (0.5 day)

```bash
git checkout -b integration/full-merge
# Apply all changes above
git push origin integration/full-merge
# Create PR → main
```

---

## Risk Areas

| Risk | Mitigation |
|---|---|
| Their DB models import from `backend.database` but our existing backend doesn't use SQLAlchemy | Their new endpoints use `get_db()`, our existing ones don't. They coexist fine. |
| `backend/config.py` (their Settings) vs our `backend/config/__init__.py` | Different import paths — both work simultaneously |
| `frontend/components/team_a/LiveCockpit.tsx` duplicates our `InterviewSession.tsx` | Don't use their LiveCockpit — ours is more complete. Keep theirs only as reference. |
| Judge0 needs `JUDGE0_API_KEY` env var | Add to `.env`, can be empty for local dev |

---

## .env additions needed after merge

```bash
# Judge0 (code execution)
JUDGE0_URL=https://judge0-ce.p.rapidapi.com
JUDGE0_API_KEY=your_rapidapi_key

# Gemini for LLM (team-b uses this)
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-1.5-flash

# Database (their endpoints use SQLite locally by default)
DATABASE_URL=sqlite+aiosqlite:///./project08.db
SECRET_KEY=project08-super-secure-key
```

---

## Order of Work

1. Create branch `integration/full-merge` from `team-a/integration`
2. Phase 1 (backend) — copy + wire team-b API files, test imports
3. Phase 2 (frontend) — copy + wire team-b components
4. Phase 3 — test everything together
5. Phase 4 — PR to main

**Estimated time: 2-3 days of focused work.**

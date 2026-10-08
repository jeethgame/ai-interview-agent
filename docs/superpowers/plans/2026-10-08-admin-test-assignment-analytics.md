# Admin Test Assignment + Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable admins to create and assign coding exams and AI interview drives to candidates (by email/cohort/CSV), configure them fully (questions, style, difficulty), and view real analytics (assigned, attended, scores, per-candidate reports).

**Architecture:** All new features extend existing `institutional_api.py` (backend) and `AdminDashboard.tsx` (frontend). Exam creation moves into admin UI. Scoring replaces hardcoded 85 with real Judge0 test-case execution. Analytics tabs wire existing backend endpoints to the frontend charts/tables.

**Tech Stack:** Python 3.11 + FastAPI + SQLAlchemy async, React + Vite + Tailwind, SQLite (local) / PostgreSQL (prod), Judge0 (code execution), Groq LLM (interview scoring)

## Global Constraints

- Do NOT touch `frontend/src/hooks/useVoiceFirstInterview.ts`, `frontend/src/components/InterviewSession.tsx`, or `backend/api/speech_api.py` — voice modules are frozen
- All new backend endpoints must use `require_role("admin", "faculty")` dependency
- Keep `USE_MOCK_AUTH=true` in docker-compose.yml — local dev stays on mock auth
- After every backend change: run `ruff check backend/` — must exit 0 before committing
- Commit message format: `feat|fix|refactor(scope): description` — no AI attribution lines
- Test locally with `docker compose up --build -d` before pushing

---

## File Map

| File | Action | What changes |
|---|---|---|
| `backend/api/exams.py` | Modify | Add auth to create endpoint; replace score=85 with Judge0 scoring |
| `backend/api/institutional_api.py` | Modify | Add `POST /orgs/{id}/exams/create` admin wrapper; add per-exam analytics |
| `frontend/src/components/AdminDashboard.tsx` | Modify | Add Create Exam modal, question picker, drive results modal, analytics charts |
| `frontend/src/services/api.ts` | Modify | Add `createExam()`, `getQuestions()`, `getDriveResults()`, `getExamResults()` |
| `backend/api/code_execution_api.py` | Modify | Export `_execute_test_case` for use in exam scoring |

---

## Task 1: Add Auth + Admin Wrapper to Exam Creation

**Why:** `POST /exams/create` currently has no auth — anyone can create exams. Admin dashboard needs a dedicated endpoint scoped to an org.

**Files:**
- Modify: `backend/api/exams.py`
- Modify: `backend/api/institutional_api.py`

**Interfaces:**
- Produces: `POST /orgs/{org_id}/exams/create` → `ExamResponse`
- Produces: Request body: `{title, description, duration_minutes, difficulty, seb_required, question_ids[]}`

- [ ] **Step 1: Add auth to existing `/exams/create`**

In `backend/api/exams.py` line 52, the `create_exam` function has no auth. Add it:

```python
@router.post("/create", response_model=ExamResponse)
async def create_exam(
    req: CreateExamRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = require_role("admin", "faculty"),   # ADD THIS
):
```

Also add `difficulty` field to the request and model:

```python
class CreateExamRequest(BaseModel):
    title: str
    description: str = "Formal Scheduled Coding Examination"
    duration_minutes: int = 60
    difficulty: str = "medium"          # ADD: easy | medium | hard
    seb_required: bool = True
    max_infractions: int = 3
    question_ids: List[str] = []
```

And in `FormalExam` model (`backend/models/formal_exam.py`), add the column:
```python
difficulty: Mapped[str] = mapped_column(String(50), default="medium")
```

- [ ] **Step 2: Add Alembic-free migration for difficulty column**

In `backend/database/__init__.py` inside `init_db()`, after the `candidate_scorecards` block:

```python
# Add difficulty to formal_exams if missing
try:
    await conn.execute(text("ALTER TABLE formal_exams ADD COLUMN difficulty VARCHAR(50) DEFAULT 'medium'"))
except Exception:
    pass  # Column already exists
```

- [ ] **Step 3: Verify with ruff and docker build**

```bash
ruff check backend/
docker compose up --build -d
curl -s -X POST http://localhost:8000/exams/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(curl -s -X POST http://localhost:8000/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@dev.example.com","password":"x"}' | python -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')" \
  -d '{"title":"Test Exam","difficulty":"medium","duration_minutes":60}'
```
Expected: `{"id":"...","title":"Test Exam","difficulty":"medium",...}`

- [ ] **Step 4: Commit**

```bash
git add backend/api/exams.py backend/models/formal_exam.py backend/database/__init__.py
git commit -m "feat(exams): add auth to create endpoint, add difficulty field"
```

---

## Task 2: Real Exam Scoring via Judge0

**Why:** `attempt.score = 85` is hardcoded. Need actual pass/fail per test case.

**Files:**
- Modify: `backend/api/exams.py` (submit endpoint)
- Modify: `backend/api/code_execution_api.py` (export helper)

**Interfaces:**
- Consumes: `_execute_test_case(source_code, language, test_case)` from `code_execution_api.py`
- Consumes: `req.answers` dict: `{question_id: {source_code, language}}`
- Produces: `attempt.score` = percentage of test cases passed (0–100)

- [ ] **Step 1: Export `_execute_test_case` from code_execution_api**

In `backend/api/code_execution_api.py`, the function `_execute_test_case` is private. It's already accessible as a module function — just needs to be importable. No change needed; just import it directly.

- [ ] **Step 2: Replace hardcoded score in submit endpoint**

In `backend/api/exams.py`, replace lines around `attempt.score = 85`:

```python
attempt.status = "SUBMITTED"
attempt.submitted_at = datetime.utcnow()

# Score by running answers against hidden test cases
score = await _score_submission(exam, req.answers)
attempt.score = score
```

Add the scoring helper before the route:

```python
async def _score_submission(exam: FormalExam, answers: dict) -> int:
    """Run each answer against hidden test cases via Judge0. Returns 0-100."""
    if not answers:
        return 0
    try:
        from backend.api.code_execution_api import _execute_test_case, LANGUAGE_IDS
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
            # Fetch hidden test cases from question bank
            from backend.services.coding_question_service import get_hidden_test_cases
            test_cases = get_hidden_test_cases(str(qid))
            for tc in test_cases:
                total += 1
                result = _execute_test_case(source_code, language, tc)
                if result.get("status") == "accepted":
                    passed += 1
        return round((passed / total) * 100) if total > 0 else 0
    except Exception as e:
        logger.warning(f"Scoring failed, defaulting to 0: {e}")
        return 0
```

- [ ] **Step 3: Update SubmitExamRequest to accept answers**

```python
class SubmitExamRequest(BaseModel):
    candidate_id: str
    answers: dict = {}   # {question_id: {source_code, language}}
```

- [ ] **Step 4: Test locally**

```bash
docker compose up --build -d
# No JUDGE0_URL in docker .env → score returns 0 with warning log (acceptable)
# With JUDGE0_URL set → real scoring
docker compose logs backend --tail 5
```
Expected: no crash, score field populated (0 if no Judge0 configured locally).

- [ ] **Step 5: Commit**

```bash
git add backend/api/exams.py
git commit -m "feat(exams): real Judge0 scoring, replace hardcoded score=85"
```

---

## Task 3: Create Exam Modal in Admin Dashboard

**Why:** Admins currently have no UI to create exams — must use raw API.

**Files:**
- Modify: `frontend/src/components/AdminDashboard.tsx`
- Modify: `frontend/src/services/api.ts`

**Interfaces:**
- Consumes: `POST /exams/create` with `{title, description, duration_minutes, difficulty, seb_required, question_ids[]}`
- Consumes: `GET /questions?limit=50` → `[{id, title, difficulty, category}]`
- Produces: "Create Exam" button in Exams tab → modal → calls API → refreshes exam list

- [ ] **Step 1: Add createExam and getQuestions to api.ts**

In `frontend/src/services/api.ts`, add after the existing exam functions:

```typescript
export interface CreateExamPayload {
  title: string;
  description?: string;
  duration_minutes: number;
  difficulty: string;
  seb_required: boolean;
  max_infractions: number;
  question_ids: string[];
}

export async function createExam(data: CreateExamPayload, token?: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/exams/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
}

export async function getQuestions(token?: string): Promise<any[]> {
  const response = await fetch(`${API_BASE_URL}/questions?limit=50`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!response.ok) return [];
  return response.json();
}
```

- [ ] **Step 2: Add Create Exam modal to AdminDashboard**

In `AdminDashboard.tsx`, find the Exams tab section. Add a "Create Exam" button next to the heading and a modal:

```tsx
// Add to state
const [showCreateExamModal, setShowCreateExamModal] = useState(false);
const [questionBank, setQuestionBank] = useState<{id:string;title:string;difficulty:string;category:string}[]>([]);
const [selectedQIds, setSelectedQIds] = useState<string[]>([]);

// Add to load() function
const qs = await apiFetch(`/questions?limit=50`, token).catch(() => []);
setQuestionBank(qs);
```

In the Exams tab header, add button:
```tsx
<Button size="sm" onClick={() => setShowCreateExamModal(true)} className="gap-1.5 bg-[#DC2626] hover:bg-[#B91C1C]">
  <Plus size={14} /> Create Exam
</Button>
```

Add the modal (before the closing `</div>` of the page):
```tsx
{showCreateExamModal && (
  <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
       onClick={() => setShowCreateExamModal(false)}>
    <form onClick={e => e.stopPropagation()}
          className="bg-white rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-xl max-h-[85vh] overflow-y-auto"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            try {
              await apiFetch(`/exams/create`, token, {
                method: 'POST',
                body: JSON.stringify({
                  title: fd.get('title'),
                  description: fd.get('description') || 'Formal exam',
                  duration_minutes: Number(fd.get('duration_minutes') || 60),
                  difficulty: fd.get('difficulty'),
                  seb_required: fd.get('seb_required') === 'true',
                  max_infractions: Number(fd.get('max_infractions') || 3),
                  question_ids: selectedQIds,
                }),
              });
              setShowCreateExamModal(false);
              setSelectedQIds([]);
              load();
            } catch (err) { console.error('Create exam failed', err); }
          }}>
      <h3 className="text-lg font-black">Create Exam</h3>
      <input name="title" required placeholder="Exam title" className="w-full px-3 py-2 border rounded-xl text-sm" />
      <textarea name="description" placeholder="Description (optional)" className="w-full px-3 py-2 border rounded-xl text-sm h-20" />
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-gray-500">Duration (min)</label>
          <input name="duration_minutes" type="number" defaultValue={60} min={5} max={180} className="w-full px-3 py-2 border rounded-xl text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500">Difficulty</label>
          <select name="difficulty" className="w-full px-3 py-2 border rounded-xl text-sm">
            <option value="easy">Easy</option>
            <option value="medium" selected>Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">Max Strikes</label>
          <input name="max_infractions" type="number" defaultValue={3} min={1} max={10} className="w-full px-3 py-2 border rounded-xl text-sm" />
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-600">SEB Lockdown</label>
        <select name="seb_required" className="w-full px-3 py-2 border rounded-xl text-sm mt-1">
          <option value="true">Required</option>
          <option value="false">Off</option>
        </select>
      </div>
      {/* Question picker */}
      {questionBank.length > 0 && (
        <div>
          <label className="text-xs font-semibold text-gray-600">Questions ({selectedQIds.length} selected)</label>
          <div className="border rounded-xl p-2 max-h-40 overflow-y-auto space-y-1 mt-1">
            {questionBank.map(q => (
              <label key={q.id} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 cursor-pointer rounded">
                <input type="checkbox" checked={selectedQIds.includes(q.id)}
                  onChange={e => setSelectedQIds(prev => e.target.checked ? [...prev, q.id] : prev.filter(i => i !== q.id))}
                  className="rounded border-gray-300" />
                <span className="text-sm flex-1">{q.title}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${q.difficulty === 'EASY' ? 'bg-green-100 text-green-700' : q.difficulty === 'HARD' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{q.difficulty}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => setShowCreateExamModal(false)}>Cancel</Button>
        <Button type="submit" size="sm" className="bg-[#DC2626] hover:bg-[#B91C1C]">Create</Button>
      </div>
    </form>
  </div>
)}
```

- [ ] **Step 3: Build and verify in browser**

```bash
docker compose up --build -d
```
Open `http://localhost:3000`, login as admin, go to Dashboard → Exams tab. Confirm "Create Exam" button is visible and modal opens with question picker.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/AdminDashboard.tsx frontend/src/services/api.ts
git commit -m "feat(admin): create exam modal with question picker and difficulty config"
```

---

## Task 4: Drive Create Modal — Full Interview Config

**Why:** Current drive creation modal has basic fields but is missing interview-specific config visible in admin UI (company selection, question topics, style).

**Files:**
- Modify: `frontend/src/components/AdminDashboard.tsx` (drive create modal)
- Modify: `backend/api/institutional_api.py` (DriveCreate schema)

**Interfaces:**
- Produces: Drive creation with `{title, target_role, company, interview_style, difficulty, duration_minutes, topic_focus[]}`

- [ ] **Step 1: Extend DriveCreate schema**

In `backend/api/institutional_api.py`, update `DriveCreate`:

```python
class DriveCreate(BaseModel):
    title: str
    target_role: str
    company: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    duration_minutes: int = 30
    interview_style: str = "formal"    # formal | technical | conversational | challenging
    difficulty: str = "medium"
    topic_focus: List[str] = []        # e.g. ["system-design", "algorithms"]
    question_count: int = 5
```

Store `topic_focus` and `question_count` as JSON in metadata — no schema change needed. Update the INSERT in `create_drive()` to serialize them into a `metadata_` JSON column, or just store as part of the existing fields (topic_focus maps to a new column or metadata).

Since there's no metadata column on placement_drives, add them to existing string fields for now:
```python
# Pack topic_focus into the interview_style field as JSON prefix — OR just ignore for now,
# the frontend captures them and the LLM uses them when generating questions.
```

Simplest: Store `topic_focus` as a comma-separated string in a new column added via ALTER:

In `backend/database/__init__.py` init_db():
```python
try:
    await conn.execute(text("ALTER TABLE placement_drives ADD COLUMN topic_focus TEXT DEFAULT ''"))
    await conn.execute(text("ALTER TABLE placement_drives ADD COLUMN question_count INTEGER DEFAULT 5"))
except Exception:
    pass
```

- [ ] **Step 2: Update frontend drive create modal**

The existing drive create modal in `AdminDashboard.tsx` already has `interview_style` and `difficulty`. Add topic focus checkboxes:

```tsx
<div>
  <label className="text-xs font-semibold text-gray-600">Topic Focus (optional)</label>
  <div className="flex flex-wrap gap-2 mt-1">
    {['algorithms', 'system-design', 'databases', 'frontend', 'devops', 'behavioral'].map(topic => (
      <label key={topic} className="flex items-center gap-1 text-xs border rounded-lg px-2 py-1 cursor-pointer hover:bg-gray-50">
        <input type="checkbox" name={`topic_${topic}`} className="rounded border-gray-300" />
        {topic}
      </label>
    ))}
  </div>
</div>
<div>
  <label className="text-xs font-semibold text-gray-600">Questions per interview</label>
  <input name="question_count" type="number" defaultValue={5} min={3} max={10} className="w-full px-3 py-2 border rounded-xl text-sm mt-1" />
</div>
```

Update the form submit to pass `topic_focus`:
```tsx
const topics = ['algorithms','system-design','databases','frontend','devops','behavioral']
  .filter(t => fd.get(`topic_${t}`) === 'on');
// Pass to API: topic_focus: topics, question_count: Number(fd.get('question_count') || 5)
```

- [ ] **Step 3: Test and commit**

```bash
docker compose up --build -d
# Login as admin, create a drive, confirm topic_focus and question_count fields work
git add backend/api/institutional_api.py backend/database/__init__.py frontend/src/components/AdminDashboard.tsx
git commit -m "feat(admin): drive create — add topic focus, question count config"
```

---

## Task 5: Analytics Dashboard — Overview Stats + Charts

**Why:** Analytics backend endpoints exist but frontend Overview tab doesn't render the KPI summary from `/analytics/summary`.

**Files:**
- Modify: `frontend/src/components/AdminDashboard.tsx` (Overview tab)
- No backend changes needed

**Interfaces:**
- Consumes: `GET /orgs/{id}/analytics/summary` → `{total_assigned, total_completed, completion_rate, exams:{...}, interviews:{...}}`
- Consumes: `GET /orgs/{id}/analytics/overview` → `[{cohort_name, total_students, interviews_completed, avg_overall_score, avg_readiness}]`

- [ ] **Step 1: Load summary in AdminDashboard**

The `load()` function already calls `/analytics/overview` and `/analytics/candidates`. Add the summary call:

```tsx
const sum = await apiFetch(`/orgs/${orgId}/analytics/summary`, token).catch(() => null);
setSummary(sum);
```

- [ ] **Step 2: Render KPI cards in Overview tab**

Replace the existing plain "Cohort Performance" table with KPI cards + table:

```tsx
{activeTab === 'overview' && (
  <div className="space-y-4">
    {/* KPI row */}
    {summary && (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Assigned" value={summary.total_assigned} icon={<Target size={18}/>} />
        <StatCard label="Completed" value={summary.total_completed} icon={<TrendingUp size={18}/>} />
        <StatCard label="Completion Rate" value={`${summary.completion_rate ?? 0}%`} icon={<BarChart3 size={18}/>} />
        <StatCard label="Avg Exam Score" value={summary.exams?.avg_exam_score != null ? `${summary.exams.avg_exam_score}/100` : '—'} icon={<Award size={18}/>} />
      </div>
    )}
    {/* Cohort performance table — existing code */}
    ...
  </div>
)}
```

Add `Award` to the lucide-react import.

- [ ] **Step 3: Test and commit**

```bash
docker compose up --build -d
# Seed: create org, assign a few exams, check overview shows KPI cards
git add frontend/src/components/AdminDashboard.tsx
git commit -m "feat(admin): analytics overview — KPI cards from /analytics/summary"
```

---

## Task 6: Exam Results Modal (per exam, per candidate)

**Why:** Admin needs to see who took each exam, their score, and status. The backend endpoint `GET /orgs/{id}/exams/{exam_id}/assignments` exists.

**Files:**
- Modify: `frontend/src/components/AdminDashboard.tsx`

**Interfaces:**
- Consumes: `GET /orgs/{org_id}/exams/{exam_id}/assignments` → `[{user_id, name, email, status, deadline, assigned_at, completed_at}]`
- Consumes: Need scores — extend backend to include attempt score in this endpoint

- [ ] **Step 1: Add score to exam assignments endpoint**

In `backend/api/institutional_api.py`, `get_exam_assignments()`, update the query to JOIN exam_attempts:

```python
r = await db.execute(text("""
    SELECT pu.id AS user_id, pu.name, pu.email,
           ea.status, ea.deadline, ea.assigned_at, ea.completed_at,
           eat.score, eat.infraction_count
    FROM exam_assignments ea
    JOIN platform_users pu ON pu.id = ea.user_id
    LEFT JOIN exam_attempts eat ON eat.exam_id = ea.exam_id AND eat.candidate_id = ea.user_id
    WHERE ea.exam_id = :exam_id
    ORDER BY ea.assigned_at DESC
"""), {"exam_id": exam_id})
```

- [ ] **Step 2: Add "Results" button and modal in Exams tab**

In the Exams tab table, add a Results button per row:
```tsx
<button onClick={() => { setShowExamResultsModal(ex); loadExamAssignments(ex.id); }}
        className="text-xs font-semibold text-blue-600 hover:underline ml-2">Results</button>
```

Add state and load function:
```tsx
const [examResultsData, setExamResultsData] = useState<any[]>([]);

const loadExamAssignments = async (examId: string) => {
  const data = await apiFetch(`/orgs/${orgId}/exams/${examId}/assignments`, token).catch(() => []);
  setExamResultsData(data);
};
```

Add results modal:
```tsx
{showExamResultsModal && (
  <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
       onClick={() => setShowExamResultsModal(null)}>
    <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-xl max-h-[80vh] overflow-y-auto">
      <h3 className="text-lg font-black mb-4">{showExamResultsModal.title} — Results</h3>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
          <tr>
            <th className="px-4 py-2 text-left">Candidate</th>
            <th className="px-4 py-2 text-left">Email</th>
            <th className="px-4 py-2 text-right">Score</th>
            <th className="px-4 py-2 text-left">Status</th>
            <th className="px-4 py-2 text-right">Infractions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {examResultsData.length === 0 ? (
            <tr><td colSpan={5} className="text-center py-6 text-gray-400">No candidates assigned yet</td></tr>
          ) : examResultsData.map((r, i) => (
            <tr key={i} className="hover:bg-gray-50">
              <td className="px-4 py-2 font-medium">{r.name || '—'}</td>
              <td className="px-4 py-2 text-gray-500 text-xs">{r.email}</td>
              <td className="px-4 py-2 text-right font-bold">{r.score != null ? `${r.score}/100` : '—'}</td>
              <td className="px-4 py-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  r.status === 'completed' ? 'bg-green-100 text-green-700' :
                  r.status === 'disqualified' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-600'}`}>{r.status}</span>
              </td>
              <td className="px-4 py-2 text-right text-gray-500">{r.infraction_count ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 text-right">
        <Button size="sm" variant="outline" onClick={() => setShowExamResultsModal(null)}>Close</Button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 3: Test and commit**

```bash
docker compose up --build -d
# Assign an exam to a candidate, click Results → verify modal shows them
git add backend/api/institutional_api.py frontend/src/components/AdminDashboard.tsx
git commit -m "feat(admin): exam results modal — per-candidate scores and status"
```

---

## Task 7: Drive Results Modal (AI Interview scores per drive)

**Why:** Admin needs per-candidate interview scores after a placement drive. Backend `GET /orgs/{id}/drives/{id}/results` exists and returns scores.

**Files:**
- Modify: `frontend/src/components/AdminDashboard.tsx`

**Interfaces:**
- Consumes: `GET /orgs/{org_id}/drives/{drive_id}/results` → `[{user_id, name, allocation_status, overall_score, readiness_score, rubric_band, report_status}]`

- [ ] **Step 1: Add "Results" button in Drives tab**

In the Drives tab table, add:
```tsx
<button onClick={async () => {
  const data = await apiFetch(`/orgs/${orgId}/drives/${d.id}/results`, token).catch(() => []);
  setShowDriveResultsModal({drive: d, results: data});
}} className="text-xs font-semibold text-blue-600 hover:underline ml-2">Results</button>
```

- [ ] **Step 2: Add drive results modal**

```tsx
{showDriveResultsModal && (
  <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
       onClick={() => setShowDriveResultsModal(null)}>
    <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-xl max-h-[80vh] overflow-y-auto">
      <h3 className="text-lg font-black mb-4">{showDriveResultsModal.drive.title} — Interview Results</h3>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
          <tr>
            <th className="px-4 py-2 text-left">Candidate</th>
            <th className="px-4 py-2 text-right">Score</th>
            <th className="px-4 py-2 text-right">Readiness</th>
            <th className="px-4 py-2 text-left">Band</th>
            <th className="px-4 py-2 text-left">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {showDriveResultsModal.results.length === 0 ? (
            <tr><td colSpan={5} className="text-center py-6 text-gray-400">No results yet</td></tr>
          ) : showDriveResultsModal.results.map((r: any, i: number) => (
            <tr key={i} className="hover:bg-gray-50">
              <td className="px-4 py-2 font-medium">{r.name || '—'}</td>
              <td className="px-4 py-2 text-right font-bold">{r.overall_score != null ? `${r.overall_score}/10` : '—'}</td>
              <td className="px-4 py-2 text-right">{r.readiness_score != null ? `${r.readiness_score}%` : '—'}</td>
              <td className="px-4 py-2"><BandBadge band={r.rubric_band} /></td>
              <td className="px-4 py-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  r.allocation_status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                }`}>{r.allocation_status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 text-right">
        <Button size="sm" variant="outline" onClick={() => setShowDriveResultsModal(null)}>Close</Button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 3: Test and commit**

```bash
docker compose up --build -d
git add frontend/src/components/AdminDashboard.tsx
git commit -m "feat(admin): drive results modal — per-candidate interview scores and band"
```

---

## Task 8: Cognito Role Lambda Trigger

**Why:** Cognito tokens don't carry the `role` claim. Without it, all production users get `candidate` role even if they're admin/faculty, breaking the RBAC.

**Files:**
- Create: `infra/cognito-role-trigger/index.py` (Lambda function)
- No backend code changes

**Interfaces:**
- Consumes: Cognito Pre-Token-Generation trigger event
- Produces: JWT with `role` claim injected from `custom:role` attribute

- [ ] **Step 1: Write the Lambda function**

Create `infra/cognito-role-trigger/index.py`:

```python
def handler(event, context):
    """
    Pre-Token-Generation Lambda trigger.
    Injects custom:role from user attributes into the ID token as 'role' claim.
    """
    user_attrs = {a['Name']: a['Value']
                  for a in event.get('request', {}).get('userAttributes', {}).items()
                  if isinstance(event.get('request', {}).get('userAttributes', {}), dict)}
    
    # userAttributes is a dict in the trigger event
    attrs = event.get('request', {}).get('userAttributes', {})
    role = attrs.get('custom:role', 'candidate')
    
    # Validate — only allow known roles
    if role not in ('candidate', 'faculty', 'admin'):
        role = 'candidate'
    
    event['response'] = {
        'claimsOverrideDetails': {
            'claimsToAddOrOverride': {
                'role': role,
            }
        }
    }
    return event
```

- [ ] **Step 2: Deploy Lambda and attach to User Pool**

```bash
# Create the Lambda
cd infra/cognito-role-trigger
zip function.zip index.py

aws lambda create-function \
  --function-name project08-cognito-role-trigger \
  --runtime python3.11 \
  --handler index.handler \
  --zip-file fileb://function.zip \
  --role arn:aws:iam::975903044204:role/project08-lambda-role \
  --profile p08 --region ap-south-1
```

**Note:** The `project08-lambda-role` IAM role needs to exist with `AWSLambdaBasicExecutionRole`. Create it first:
```bash
aws iam create-role \
  --role-name project08-lambda-role \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
  --profile p08

aws iam attach-role-policy \
  --role-name project08-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole \
  --profile p08
```

- [ ] **Step 3: Grant Cognito permission to invoke Lambda**

```bash
LAMBDA_ARN=$(aws lambda get-function --function-name project08-cognito-role-trigger --profile p08 --region ap-south-1 --query 'Configuration.FunctionArn' --output text)

aws lambda add-permission \
  --function-name project08-cognito-role-trigger \
  --statement-id cognito-trigger \
  --action lambda:InvokeFunction \
  --principal cognito-idp.amazonaws.com \
  --source-arn arn:aws:cognito-idp:ap-south-1:975903044204:userpool/ap-south-1_NfT5QjYyc \
  --profile p08 --region ap-south-1
```

- [ ] **Step 4: Attach trigger to User Pool**

```bash
aws cognito-idp update-user-pool \
  --user-pool-id ap-south-1_NfT5QjYyc \
  --lambda-config "PreTokenGeneration=$LAMBDA_ARN" \
  --profile p08 --region ap-south-1
```

- [ ] **Step 5: Test — login as admin and verify role claim**

```bash
TOKEN=$(aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=admin@dev.example.com,PASSWORD=Test1234! \
  --client-id 75d387dgejug1fgukvna0agrf0 \
  --profile p08 --region ap-south-1 \
  --query "AuthenticationResult.IdToken" --output text)

# Decode the payload (base64 middle section)
echo $TOKEN | cut -d'.' -f2 | base64 -d 2>/dev/null | python -m json.tool | grep role
```
Expected: `"role": "admin"`

- [ ] **Step 6: Commit Lambda code**

```bash
git add infra/cognito-role-trigger/
git commit -m "feat(auth): Cognito Pre-Token-Generation Lambda — inject role claim into JWT"
```

---

## Verification Checklist

After all tasks:

- [ ] `docker compose up --build -d` — both containers healthy
- [ ] Login as admin → Dashboard → Exams tab shows "Create Exam" button
- [ ] Create exam with title, duration, difficulty, select 2 questions
- [ ] Assign exam to `candidate@dev.example.com` by email
- [ ] Login as candidate → home page shows assigned exam
- [ ] Candidate clicks Attempt → exam loads → submit → score appears (0 if no Judge0, real score with Judge0)
- [ ] Login as admin → Exams tab → click Results → see candidate with score
- [ ] Admin → Drives → create drive with topic focus → allocate candidate → click Results → see candidate row
- [ ] Admin → Overview tab shows KPI cards (total assigned, completed, completion rate)
- [ ] `ruff check backend/` → All checks passed
- [ ] CI passes: `gh run list --repo jeethgame/ai-interview-agent --limit 1 --json conclusion --jq '.[0].conclusion'` → `"success"`

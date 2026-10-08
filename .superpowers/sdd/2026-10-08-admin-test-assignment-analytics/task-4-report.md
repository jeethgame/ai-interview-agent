# Task 4 Report — Drive Create Modal: Topic Focus & Question Count

**Status:** DONE

## Commits

- `77a34cb` feat(admin): drive create — add topic focus, question count config

## Changes Made

### backend/api/institutional_api.py
- Added `topic_focus: list[str] = []` and `question_count: int = 5` to `DriveCreate` schema.
- Updated `create_drive()` INSERT to include both new columns; `topic_focus` stored as comma-joined string.

### backend/database/__init__.py
- Added two guarded `ALTER TABLE placement_drives` statements (try/except) in `init_db()` for `topic_focus TEXT DEFAULT ''` and `question_count INTEGER DEFAULT 5`.

### frontend/src/components/AdminDashboard.tsx
- Added `topicFocus: string[]` and `questionCount: number` state to `CreateDriveModal`.
- Added `TOPICS` constant and `toggleTopic` helper.
- Added topic focus checkbox row (6 topics: algorithms, system-design, databases, frontend, devops, behavioral) with visual active state.
- Added question count number input (range 3–10, default 5).
- Both values passed to `POST /orgs/{orgId}/drives` body.

## Test Summary

- `ruff check backend/` — All checks passed.
- `cd frontend && npx tsc --noEmit` — No output (clean).

## Concerns

None. Voice modules untouched. Exam modal state untouched.

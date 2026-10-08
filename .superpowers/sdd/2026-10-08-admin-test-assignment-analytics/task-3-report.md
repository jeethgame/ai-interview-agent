# Task 3 Report — Create Exam Modal in Admin Dashboard

## Status: DONE

## Commits
- `9e44726` feat(admin): create exam modal with difficulty, question picker, and api helpers

## What was changed

### `frontend/src/services/api.ts`
- Added `CreateExamPayload` interface
- Added `createExam()` function — `POST /exams/create` with auth token
- Added `getQuestions()` function — `GET /questions?limit=50` with auth token

### `frontend/src/components/AdminDashboard.tsx`
- Extended `CreateExamModal` component:
  - Added `difficulty` state (default `'medium'`) and select field (Easy/Medium/Hard)
  - Added `questionBank` state with `useEffect` to fetch `/questions?limit=50` on modal open
  - Added `selectedQIds` state (resets on modal unmount automatically since it's local component state)
  - Added scrollable question picker with per-question difficulty badge
  - Shows "No questions in bank yet" gracefully when bank is empty
  - Sends `difficulty` and `question_ids` in the create payload
  - Duration/Difficulty/Max Strikes now in a 3-column grid
  - Modal scrollable (`max-h-[90vh] overflow-y-auto`) to handle question list overflow
- Note: `Award` was already imported — no change needed

## Test summary
TypeScript check (`npx tsc --noEmit`) passes with zero errors.

## Concerns
None. The "Create Exam" button and modal were already wired up in the existing codebase — this task only added the missing `difficulty` field and question picker to the existing `CreateExamModal` component. The `api.ts` helpers are added for completeness but the modal uses the local `apiFetch` helper directly (consistent with the rest of the dashboard).

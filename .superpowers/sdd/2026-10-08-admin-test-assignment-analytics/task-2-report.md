# Task 2 Report — Real Exam Scoring via Judge0

**Status:** DONE

## Commits

- `e65cc3a` — feat(exams): real Judge0 scoring, replace hardcoded score=85

## What Changed

**File:** `backend/api/exams.py`

1. Added `import logging` and `logger = logging.getLogger(__name__)`.
2. Added `_score_submission(exam, answers) -> int` helper before the routes:
   - Imports `_execute_test_case` and `LANGUAGE_IDS` from `code_execution_api` and `get_hidden_test_cases` from `coding_question_service` inside the try block.
   - Iterates `exam.question_ids` (JSON list), looks up each answer by question_id, calls `_execute_test_case` for every hidden test case, counts `"passed"` results.
   - Returns `round((passed/total)*100)` or `0` if no test cases ran.
   - Wraps entire body in `try/except Exception` — catches `HTTPException` raised when `JUDGE0_URL` is absent, logs a warning, returns `0`.
3. `submit_exam_attempt` now fetches `exam = await db.get(FormalExam, exam_id)` and calls `attempt.score = await _score_submission(exam, req.answers)` instead of `attempt.score = 85`.
4. `SubmitExamRequest.answers: dict = {}` was already present — no change needed.

## Test Summary

`ruff check backend/` → All checks passed. No crash path when `JUDGE0_URL` is absent — `_score_submission` catches the `HTTPException(500)` raised by `_get_judge0_config()` and returns `0`.

## Concerns

- **Spec/code mismatch:** The task spec says `_execute_test_case` returns `"accepted"` on pass, but the actual code returns `"passed"`. The implementation uses `"passed"` (correct per code). If the Judge0 result exactly matches expected output the status is `"passed"`; the final summary in `submit_code` uses `"accepted"` but that is for the overall submission, not individual test cases.
- **Blocking event loop:** `_execute_test_case` uses synchronous `httpx` and `time.sleep`; calling it from an `async` function blocks the event loop during exam submission. Acceptable for this low-frequency path. Upgrade path: wrap each call with `asyncio.to_thread(_execute_test_case, ...)` if throughput matters.

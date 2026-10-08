# Final Fix Report — 2026-10-08

## Status: DONE

## Fixes Applied

### Fix 1 (Critical) — `backend/database/__init__.py`
Removed the `UPDATE platform_users SET role = CASE WHEN LOWER(email) LIKE '%admin%'...` block from `init_db()`. This bulk UPDATE ran on every server startup and allowed privilege escalation (any email containing "admin" would be promoted to admin role). Role assignment at login is already handled by `_ensure_platform_user()` in `auth_api.py`.

### Fix 2 (Important) — `backend/api/institutional_api.py`
Added a docstring to `create_exam_for_org` explaining that `formal_exams` has no `org_id` column — exams are global resources shared across all admins, and the `org_id` URL parameter serves solely as RBAC context. Org-scoping is achieved at the assignment level via `exam_assignments`.

## Verification
- `ruff check backend/` — all checks passed

## Summary
Removed email-based role escalation from `init_db()`; documented global exam scope in `create_exam_for_org`.

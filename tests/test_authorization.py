"""
Comprehensive unit and integration test suite for Authorization and RBAC.
Tests:
- Token decoding & role extraction (Cognito groups, custom attributes, mock)
- Dual-use RoleChecker / require_role dependency
- 401 Unauthorized enforcement when tokens are missing or invalid
- 403 Forbidden RBAC enforcement when roles are insufficient
- Admin and Faculty role allowances on administrative routes
"""

import time
import pytest
import jwt
from unittest.mock import AsyncMock, patch
from fastapi import FastAPI, Depends, HTTPException
from fastapi.testclient import TestClient

from backend.api.auth_api import (
    ROLE_CANDIDATE,
    ROLE_FACULTY,
    ROLE_ADMIN,
    VALID_ROLES,
    _extract_role_from_payload,
    _MOCK_SECRET,
    decode_token,
    get_current_user,
    get_current_user_optional,
    require_role,
    require_admin,
    require_faculty_or_admin,
    require_candidate,
    RoleChecker,
)


# ── 1. Role Extraction Unit Tests ─────────────────────────────────────────────

def test_extract_role_direct_claim():
    assert _extract_role_from_payload({"role": "admin"}) == ROLE_ADMIN
    assert _extract_role_from_payload({"role": "faculty"}) == ROLE_FACULTY
    assert _extract_role_from_payload({"role": "candidate"}) == ROLE_CANDIDATE
    assert _extract_role_from_payload({"role": "ADMIN"}) == ROLE_ADMIN
    assert _extract_role_from_payload({"custom:role": "faculty"}) == ROLE_FACULTY


def test_extract_role_cognito_groups():
    assert _extract_role_from_payload({"cognito:groups": ["admin", "users"]}) == ROLE_ADMIN
    assert _extract_role_from_payload({"cognito:groups": ["faculty"]}) == ROLE_FACULTY
    assert _extract_role_from_payload({"cognito:groups": "candidate"}) == ROLE_CANDIDATE


def test_extract_role_email_heuristic():
    assert _extract_role_from_payload({"email": "admin@institution.edu"}) == ROLE_ADMIN
    assert _extract_role_from_payload({"email": "faculty.john@college.edu"}) == ROLE_FACULTY
    assert _extract_role_from_payload({"email": "student@college.edu"}) == ROLE_CANDIDATE


def test_extract_role_default_fallback():
    assert _extract_role_from_payload({}) == ROLE_CANDIDATE
    assert _extract_role_from_payload({"role": "unknown_role"}) == ROLE_CANDIDATE


# ── 2. Token Helpers for Testing ─────────────────────────────────────────────

def _generate_test_token(user_id: str, email: str, role: str) -> str:
    return jwt.encode(
        {
            "sub": user_id,
            "email": email,
            "name": email.split("@")[0],
            "role": role,
            "exp": int(time.time()) + 3600,
        },
        _MOCK_SECRET,
        algorithm="HS256",
    )


# ── 3. Test App with RBAC Routes ──────────────────────────────────────────────

@pytest.fixture
def rbac_test_app():
    app = FastAPI()

    # Public endpoint
    @app.get("/public")
    async def public_endpoint():
        return {"status": "ok"}

    # Authenticated (any valid role)
    @app.get("/protected")
    async def protected_endpoint(user: dict = Depends(get_current_user)):
        return {"user": user["id"], "role": user["role"]}

    # Candidate only (or admin)
    @app.get("/candidate-only")
    async def candidate_only(user: dict = Depends(require_candidate)):
        return {"status": "candidate_success", "user": user["id"]}

    # Faculty or Admin (using Depends(require_role(...)))
    @app.get("/faculty-or-admin")
    async def faculty_or_admin(user: dict = Depends(require_role("faculty", "admin"))):
        return {"status": "faculty_success", "user": user["id"]}

    # Admin only (using direct parameter default `require_admin`)
    @app.post("/admin-only")
    async def admin_only(user: dict = require_admin):
        return {"status": "admin_success", "user": user["id"]}

    return app


# ── 4. RBAC Route Tests ───────────────────────────────────────────────────────

def test_public_endpoint_accessible(rbac_test_app):
    client = TestClient(rbac_test_app)
    response = client.get("/public")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_protected_endpoint_missing_token_returns_401(rbac_test_app):
    client = TestClient(rbac_test_app)
    response = client.get("/protected")
    assert response.status_code == 401
    assert "Authentication required" in response.json()["detail"]
    assert "WWW-Authenticate" in response.headers


def test_protected_endpoint_invalid_token_returns_401(rbac_test_app):
    client = TestClient(rbac_test_app)
    response = client.get("/protected", headers={"Authorization": "Bearer invalid.jwt.token"})
    assert response.status_code == 401
    assert "Invalid or expired token" in response.json()["detail"]


def test_protected_endpoint_valid_token_success(rbac_test_app):
    client = TestClient(rbac_test_app)
    token = _generate_test_token("cand-1", "alice@example.com", ROLE_CANDIDATE)
    response = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["user"] == "cand-1"
    assert response.json()["role"] == ROLE_CANDIDATE


def test_candidate_forbidden_on_faculty_routes(rbac_test_app):
    client = TestClient(rbac_test_app)
    candidate_token = _generate_test_token("cand-1", "candidate@test.com", ROLE_CANDIDATE)
    response = client.get(
        "/faculty-or-admin",
        headers={"Authorization": f"Bearer {candidate_token}"},
    )
    assert response.status_code == 403
    assert "Access forbidden" in response.json()["detail"]
    assert "candidate" in response.json()["detail"]


def test_faculty_allowed_on_faculty_route_but_forbidden_on_admin(rbac_test_app):
    client = TestClient(rbac_test_app)
    faculty_token = _generate_test_token("fac-1", "prof@college.edu", ROLE_FACULTY)

    # Faculty can access faculty-or-admin route
    resp1 = client.get(
        "/faculty-or-admin",
        headers={"Authorization": f"Bearer {faculty_token}"},
    )
    assert resp1.status_code == 200
    assert resp1.json()["status"] == "faculty_success"

    # Faculty CANNOT access admin-only route
    resp2 = client.post(
        "/admin-only",
        headers={"Authorization": f"Bearer {faculty_token}"},
    )
    assert resp2.status_code == 403
    assert "Access forbidden" in resp2.json()["detail"]
    assert "faculty" in resp2.json()["detail"]


def test_admin_allowed_on_all_routes(rbac_test_app):
    client = TestClient(rbac_test_app)
    admin_token = _generate_test_token("adm-1", "admin@domain.com", ROLE_ADMIN)

    # Admin on protected
    r1 = client.get("/protected", headers={"Authorization": f"Bearer {admin_token}"})
    assert r1.status_code == 200

    # Admin on faculty-or-admin
    r2 = client.get("/faculty-or-admin", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 200

    # Admin on admin-only
    r3 = client.post("/admin-only", headers={"Authorization": f"Bearer {admin_token}"})
    assert r3.status_code == 200
    assert r3.json()["status"] == "admin_success"

    # Admin on candidate-only
    r4 = client.get("/candidate-only", headers={"Authorization": f"Bearer {admin_token}"})
    assert r4.status_code == 200


def test_dual_use_require_role_direct_and_wrapped(rbac_test_app):
    """Verify RoleChecker functions both directly and wrapped in Depends."""
    app = FastAPI()

    # Form 1: user = require_role("admin")
    @app.get("/direct")
    async def direct_dep(user: dict = require_role("admin")):
        return {"user": user["id"]}

    # Form 2: user = Depends(require_role("admin"))
    @app.get("/wrapped")
    async def wrapped_dep(user: dict = Depends(require_role("admin"))):
        return {"user": user["id"]}

    client = TestClient(app)
    admin_token = _generate_test_token("adm-1", "admin@domain.com", ROLE_ADMIN)
    cand_token = _generate_test_token("cand-1", "cand@domain.com", ROLE_CANDIDATE)

    # Both allow admin
    assert client.get("/direct", headers={"Authorization": f"Bearer {admin_token}"}).status_code == 200
    assert client.get("/wrapped", headers={"Authorization": f"Bearer {admin_token}"}).status_code == 200

    # Both reject candidate with 403
    assert client.get("/direct", headers={"Authorization": f"Bearer {cand_token}"}).status_code == 403
    assert client.get("/wrapped", headers={"Authorization": f"Bearer {cand_token}"}).status_code == 403


# ── 5. Integration Tests on Actual Application Routers ────────────────────────

def test_institutional_router_rbac_enforcement():
    """Verify that institutional endpoints enforce strict authentication and 403 on candidate tokens."""
    from backend.api.institutional_api import router as inst_router
    app = FastAPI()
    app.include_router(inst_router)
    client = TestClient(app)

    cand_token = _generate_test_token("cand-1", "alice@student.edu", ROLE_CANDIDATE)
    fac_token = _generate_test_token("fac-1", "dr.smith@university.edu", ROLE_FACULTY)

    # 1. Unauthenticated -> 401
    r_no_auth = client.get("/orgs/org-123")
    assert r_no_auth.status_code == 401
    assert "Authentication required" in r_no_auth.json()["detail"]

    # 2. Candidate accessing stats -> 403 Forbidden
    r_stats_cand = client.get("/orgs/org-123/stats", headers={"Authorization": f"Bearer {cand_token}"})
    assert r_stats_cand.status_code == 403
    assert "Access forbidden" in r_stats_cand.json()["detail"]

    # 3. Candidate creating org -> 403 Forbidden
    r_create_cand = client.post("/orgs/", json={"name": "New University"}, headers={"Authorization": f"Bearer {cand_token}"})
    assert r_create_cand.status_code == 403

    # 4. Faculty creating org -> 403 Forbidden (Admin only)
    r_create_fac = client.post("/orgs/", json={"name": "New University"}, headers={"Authorization": f"Bearer {fac_token}"})
    assert r_create_fac.status_code == 403


def test_speech_router_usage_stats_rbac():
    """Verify speech API rate limiting usage stats requires faculty/admin role."""
    from backend.api.speech_api import create_speech_api
    app = FastAPI()
    create_speech_api(app)
    client = TestClient(app)

    cand_token = _generate_test_token("cand-1", "alice@student.edu", ROLE_CANDIDATE)
    adm_token = _generate_test_token("adm-1", "admin@domain.com", ROLE_ADMIN)

    # 1. Unauthenticated -> 401
    r_unauth = client.get("/api/speech/usage-stats")
    assert r_unauth.status_code == 401

    # 2. Candidate -> 403
    r_cand = client.get("/api/speech/usage-stats", headers={"Authorization": f"Bearer {cand_token}"})
    assert r_cand.status_code == 403

    # 3. Admin -> 200 OK
    r_adm = client.get("/api/speech/usage-stats", headers={"Authorization": f"Bearer {adm_token}"})
    assert r_adm.status_code == 200


def test_exams_router_create_rbac():
    """Verify exams router requires faculty/admin to create formal exams."""
    from backend.api.exams import router as exams_router
    app = FastAPI()
    app.include_router(exams_router)
    client = TestClient(app)

    cand_token = _generate_test_token("cand-1", "alice@student.edu", ROLE_CANDIDATE)

    # 1. Unauthenticated -> 401
    r_unauth = client.post("/exams/create", json={"title": "Midterm Exam"})
    assert r_unauth.status_code == 401

    # 2. Candidate -> 403
    r_cand = client.post("/exams/create", json={"title": "Midterm Exam"}, headers={"Authorization": f"Bearer {cand_token}"})
    assert r_cand.status_code == 403


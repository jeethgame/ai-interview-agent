"""
Live JWT Verification Script for Local Development.
Tests local mock JWT authentication, token decoding, and RBAC enforcement
against the live FastAPI application.
"""

import os
import sys
import json
import jwt

# Force local mock auth mode
os.environ["USE_MOCK_AUTH"] = "true"
os.environ["COGNITO_USER_POOL_ID"] = ""
os.environ["COGNITO_CLIENT_ID"] = ""

from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

GREEN = "\033[92m"
RED = "\033[91m"
BLUE = "\033[94m"
YELLOW = "\033[93m"
RESET = "\033[0m"
BOLD = "\033[1m"


def print_step(title: str):
    print(f"\n{BOLD}{BLUE}======================================================================{RESET}")
    print(f"{BOLD}{BLUE}>> {title}{RESET}")
    print(f"{BOLD}{BLUE}======================================================================{RESET}")


def assert_status(resp, expected_code: int, msg: str):
    if resp.status_code == expected_code:
        print(f"  {GREEN}[PASS]{RESET} {msg} (HTTP {resp.status_code})")
    else:
        print(f"  {RED}[FAIL]{RESET} {msg} - Expected {expected_code}, got {resp.status_code}")
        print(f"         Response body: {resp.text}")
        sys.exit(1)


def decode_and_print_token(token: str, label: str):
    # Decode unverified to inspect payload
    unverified = jwt.decode(token, options={"verify_signature": False})
    header = jwt.get_unverified_header(token)
    print(f"\n  {YELLOW}{label} JWT Inspection:{RESET}")
    print(f"    - Header:  {header}")
    print(f"    - Sub:     {unverified.get('sub')}")
    print(f"    - Email:   {unverified.get('email')}")
    print(f"    - Name:    {unverified.get('name')}")
    print(f"    - Role:    {BOLD}{unverified.get('role')}{RESET}")
    print(f"    - Expires: {unverified.get('exp')} (in {unverified.get('exp') - unverified.get('iat', unverified.get('exp') - 3600)}s)")


def run_verification():
    print(f"{BOLD}Starting Local JWT Authentication & RBAC Verification...{RESET}")

    # ──────────────────────────────────────────────────────────────────────────
    # Step 1: Candidate Registration & Token Generation
    # ──────────────────────────────────────────────────────────────────────────
    print_step("Step 1: Candidate Registration & Login via /auth/register")
    reg_cand = client.post("/auth/register", json={
        "email": "candidate.john@example.com",
        "password": "Password123!",
        "name": "John Candidate",
        "role": "candidate"
    })
    assert_status(reg_cand, 200, "Candidate registered successfully")
    cand_data = reg_cand.json()
    cand_token = cand_data["access_token"]
    cand_refresh = cand_data["refresh_token"]
    assert cand_data["user"]["role"] == "candidate", "Role must be candidate"
    decode_and_print_token(cand_token, "Candidate Access Token")

    # ──────────────────────────────────────────────────────────────────────────
    # Step 2: Validate Candidate JWT via /auth/me
    # ──────────────────────────────────────────────────────────────────────────
    print_step("Step 2: Access Protected /auth/me with Candidate Bearer Token")
    me_cand = client.get("/auth/me", headers={"Authorization": f"Bearer {cand_token}"})
    assert_status(me_cand, 200, "Successfully fetched profile for candidate")
    me_cand_json = me_cand.json()
    print(f"  Authenticated User: id={me_cand_json.get('id')}, email={me_cand_json.get('email')}, role={me_cand_json.get('role')}")
    assert me_cand_json["role"] == "candidate", "Profile role must match candidate"

    # ──────────────────────────────────────────────────────────────────────────
    # Step 3: Faculty Registration & Login
    # ──────────────────────────────────────────────────────────────────────────
    print_step("Step 3: Faculty Registration via /auth/register")
    reg_fac = client.post("/auth/register", json={
        "email": "professor.alan@university.edu",
        "password": "Password123!",
        "name": "Prof. Alan Turing",
        "role": "faculty"
    })
    assert_status(reg_fac, 200, "Faculty registered successfully")
    fac_data = reg_fac.json()
    fac_token = fac_data["access_token"]
    assert fac_data["user"]["role"] == "faculty", "Role must be faculty"
    decode_and_print_token(fac_token, "Faculty Access Token")

    me_fac = client.get("/auth/me", headers={"Authorization": f"Bearer {fac_token}"})
    assert_status(me_fac, 200, "Successfully fetched profile for faculty")
    assert me_fac.json()["role"] == "faculty", "Profile role must match faculty"

    # ──────────────────────────────────────────────────────────────────────────
    # Step 4: Admin Registration & Login
    # ──────────────────────────────────────────────────────────────────────────
    print_step("Step 4: Admin Registration via /auth/register")
    reg_adm = client.post("/auth/register", json={
        "email": "admin.system@domain.com",
        "password": "Password123!",
        "name": "System Administrator",
        "role": "admin"
    })
    assert_status(reg_adm, 200, "Admin registered successfully")
    adm_data = reg_adm.json()
    adm_token = adm_data["access_token"]
    assert adm_data["user"]["role"] == "admin", "Role must be admin"
    decode_and_print_token(adm_token, "Admin Access Token")

    me_adm = client.get("/auth/me", headers={"Authorization": f"Bearer {adm_token}"})
    assert_status(me_adm, 200, "Successfully fetched profile for admin")
    assert me_adm.json()["role"] == "admin", "Profile role must match admin"

    # ──────────────────────────────────────────────────────────────────────────
    # Step 5: Refresh Token Flow
    # ──────────────────────────────────────────────────────────────────────────
    print_step("Step 5: Token Refresh via /auth/refresh")
    ref_resp = client.post("/auth/refresh", json={"refresh_token": cand_refresh})
    assert_status(ref_resp, 200, "Token refresh succeeded")
    new_token = ref_resp.json()["access_token"]
    decode_and_print_token(new_token, "Refreshed Candidate Access Token")

    # ──────────────────────────────────────────────────────────────────────────
    # Step 6: Verify 401 Unauthorized on Missing & Invalid Tokens
    # ──────────────────────────────────────────────────────────────────────────
    print_step("Step 6: Verification of 401 Unauthorized Guards")
    r_no_token = client.get("/auth/me")
    assert_status(r_no_token, 401, "Missing Authorization header returns 401")
    assert "WWW-Authenticate" in r_no_token.headers, "Must include WWW-Authenticate header"

    r_bad_token = client.get("/auth/me", headers={"Authorization": "Bearer malformed.bogus.token"})
    assert_status(r_bad_token, 401, "Malformed token returns 401")

    # ──────────────────────────────────────────────────────────────────────────
    # Step 7: Verify RBAC 403 Forbidden Enforcement
    # ──────────────────────────────────────────────────────────────────────────
    print_step("Step 7: Verification of RBAC 403 Forbidden Guards")

    # Candidate attempting to access Speech Usage Stats (Faculty/Admin only)
    r_stats_cand = client.get("/api/speech/usage-stats", headers={"Authorization": f"Bearer {cand_token}"})
    assert_status(r_stats_cand, 403, "Candidate denied from /api/speech/usage-stats with 403")
    print(f"    Detail: {r_stats_cand.json().get('detail')}")

    # Faculty accessing Speech Usage Stats (Allowed)
    r_stats_fac = client.get("/api/speech/usage-stats", headers={"Authorization": f"Bearer {fac_token}"})
    assert_status(r_stats_fac, 200, "Faculty allowed on /api/speech/usage-stats with 200")

    # Admin accessing Speech Usage Stats (Allowed)
    r_stats_adm = client.get("/api/speech/usage-stats", headers={"Authorization": f"Bearer {adm_token}"})
    assert_status(r_stats_adm, 200, "Admin allowed on /api/speech/usage-stats with 200")

    # Candidate attempting to access Institutional Stats (Faculty/Admin only)
    r_org_stats_cand = client.get("/orgs/org-sample/stats", headers={"Authorization": f"Bearer {cand_token}"})
    assert_status(r_org_stats_cand, 403, "Candidate denied from /orgs/{org_id}/stats with 403")

    # Candidate attempting to create Exam (Faculty/Admin only)
    r_exam_cand = client.post("/exams/create", json={"title": "Unauthorized Exam"}, headers={"Authorization": f"Bearer {cand_token}"})
    assert_status(r_exam_cand, 403, "Candidate denied from /exams/create with 403")

    # Faculty attempting to create Organization (Admin only)
    r_org_fac = client.post("/orgs/", json={"name": "New University Org"}, headers={"Authorization": f"Bearer {fac_token}"})
    assert_status(r_org_fac, 403, "Faculty denied from creating Organization with 403 (Admin-only)")

    # ──────────────────────────────────────────────────────────────────────────
    # Step 8: Logout
    # ──────────────────────────────────────────────────────────────────────────
    print_step("Step 8: Logout via /auth/logout")
    r_logout = client.post("/auth/logout", headers={"Authorization": f"Bearer {cand_token}"})
    assert_status(r_logout, 200, "Candidate logged out successfully")

    print(f"\n{BOLD}{GREEN}======================================================================{RESET}")
    print(f"{BOLD}{GREEN}ALL LOCAL JWT & RBAC VERIFICATIONS PASSED SUCCESSFULLY! (100%){RESET}")
    print(f"{BOLD}{GREEN}======================================================================{RESET}\n")


if __name__ == "__main__":
    run_verification()

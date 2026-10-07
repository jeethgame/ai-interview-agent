"""
Authentication API — AWS Cognito backend.

Same endpoint contract as before (frontend unchanged):
  POST /auth/register
  POST /auth/login
  POST /auth/refresh
  GET  /auth/me
  POST /auth/logout
  DELETE /auth/me/data   ← new: GDPR/DPDPA right to deletion

When COGNITO_USER_POOL_ID is set, uses Cognito.
Falls back to mock JWT for local development (USE_MOCK_AUTH=true).
"""
import asyncio
import json
import os
import uuid
from datetime import datetime
from typing import Any

try:
    import boto3
    from botocore.exceptions import ClientError
except ImportError:
    boto3 = None
    class ClientError(Exception):
        pass

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
try:
    from jwt.algorithms import RSAAlgorithm
except ImportError:
    RSAAlgorithm = None
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import get_logger
from backend.database import get_db

logger = get_logger(__name__)

# ── Config ────────────────────────────────────────────────────────────────

COGNITO_REGION = os.getenv("COGNITO_REGION", os.getenv("AWS_REGION", "us-east-1"))
COGNITO_USER_POOL_ID = os.getenv("COGNITO_USER_POOL_ID", "")
COGNITO_CLIENT_ID = os.getenv("COGNITO_CLIENT_ID", "")
USE_MOCK_AUTH = os.getenv("USE_MOCK_AUTH", "true").lower() in ("true", "1", "yes")
_MOCK_SECRET = "dev-mock-secret-not-for-production"

_cognito = None
_jwks_cache: dict = {}

def _get_cognito():
    global _cognito
    if boto3 is None:
        raise HTTPException(status_code=503, detail="AWS boto3 SDK not installed")
    if _cognito is None:
        _cognito = boto3.client("cognito-idp", region_name=COGNITO_REGION)
    return _cognito

def _cognito_available() -> bool:
    return bool(boto3 is not None and COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID)

# ── JWKS-based JWT validation (Cognito) ──────────────────────────────────

async def _get_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache:
        return _jwks_cache
    url = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}/.well-known/jwks.json"
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(url)
        r.raise_for_status()
        _jwks_cache = {k["kid"]: RSAAlgorithm.from_jwk(json.dumps(k)) for k in r.json()["keys"]}
    return _jwks_cache

async def _verify_cognito_token(token: str) -> dict:
    header = jwt.get_unverified_header(token)
    kid = header.get("kid")
    keys = await _get_jwks()
    pub_key = keys.get(kid)
    if not pub_key:
        raise ValueError("Unknown token key id")
    return jwt.decode(
        token, pub_key,
        algorithms=["RS256"],
        options={"verify_aud": False},
    )

ROLE_CANDIDATE = "candidate"
ROLE_FACULTY = "faculty"
ROLE_ADMIN = "admin"
VALID_ROLES = {ROLE_CANDIDATE, ROLE_FACULTY, ROLE_ADMIN}

def _extract_role_from_payload(payload: dict[str, Any]) -> str:
    """Extract and normalize user role from JWT claims or Cognito groups."""
    role = payload.get("role") or payload.get("custom:role")
    if role:
        cleaned = str(role).strip().lower()
        if cleaned in VALID_ROLES:
            return cleaned

    groups = payload.get("cognito:groups")
    if groups:
        if isinstance(groups, str):
            groups = [groups]
        normalized_groups = [str(g).strip().lower() for g in groups]
        if ROLE_ADMIN in normalized_groups:
            return ROLE_ADMIN
        if ROLE_FACULTY in normalized_groups:
            return ROLE_FACULTY
        if ROLE_CANDIDATE in normalized_groups:
            return ROLE_CANDIDATE

    email = payload.get("email", "").lower()
    if "admin" in email:
        return ROLE_ADMIN
    if "faculty" in email:
        return ROLE_FACULTY

    return ROLE_CANDIDATE

def _verify_mock_token(token: str) -> dict:
    return jwt.decode(token, _MOCK_SECRET, algorithms=["HS256"])

async def _decode_token(token: str) -> dict:
    if _cognito_available():
        return await _verify_cognito_token(token)
    if USE_MOCK_AUTH:
        return _verify_mock_token(token)
    raise HTTPException(status_code=500, detail="Auth not configured")

# Public alias for modules importing token decode logic
decode_token = _decode_token

# ── FastAPI security ──────────────────────────────────────────────────────

_bearer = HTTPBearer(auto_error=False)

async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict[str, Any] | None:
    if not credentials or not credentials.credentials:
        return None
    try:
        payload = await _decode_token(credentials.credentials)
        role = _extract_role_from_payload(payload)
        return {
            "id": payload.get("sub"),
            "email": payload.get("email", ""),
            "name": payload.get("name", ""),
            "role": role,
            "payload": payload,
        }
    except Exception as e:
        logger.debug(f"Optional auth failed: {type(e).__name__}")
        return None

async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict[str, Any]:
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = await _decode_token(credentials.credentials)
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Invalid token: missing subject claim",
                headers={"WWW-Authenticate": "Bearer"},
            )
        role = _extract_role_from_payload(payload)
        return {
            "id": user_id,
            "email": payload.get("email", ""),
            "name": payload.get("name", ""),
            "role": role,
            "payload": payload,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.debug(f"Token decoding failed: {exc}")
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

import fastapi.params

class RoleChecker(fastapi.params.Depends):
    """
    Role-Based Access Control (RBAC) dependency.
    Dual-use:
      - Can be passed directly: `user: dict = require_role("admin", "faculty")`
      - Can be wrapped in Depends: `user: dict = Depends(require_role("admin", "faculty"))`
    """
    def __init__(self, *roles: str):
        self.roles = {r.strip().lower() for r in roles}
        super().__init__(dependency=self._check)

    async def _check(self, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
        user_role = (user.get("role") or ROLE_CANDIDATE).lower()
        if user_role not in self.roles:
            allowed = ", ".join(sorted(self.roles))
            logger.warning(
                f"RBAC authorization failure: user={user.get('email', 'unknown')} "
                f"with role='{user_role}' denied access. Required one of: [{allowed}]"
            )
            raise HTTPException(
                status_code=403,
                detail=f"Access forbidden: role '{user_role}' does not have required permissions ({allowed})",
            )
        return user

    async def __call__(self, user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
        return await self._check(user=user)

def require_role(*roles: str) -> RoleChecker:
    """Dependency ensuring the authenticated user has at least one of the specified roles."""
    return RoleChecker(*roles)

# Pre-configured role dependencies
require_admin = require_role(ROLE_ADMIN)
require_faculty_or_admin = require_role(ROLE_ADMIN, ROLE_FACULTY)
require_candidate = require_role(ROLE_CANDIDATE, ROLE_ADMIN)

# ── Pydantic models ───────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str | None = None
    role: str | None = "candidate"

class UserRegisterRequest(BaseModel):
    email: str
    password: str
    name: str
    role: str | None = "candidate"

class LoginRequest(BaseModel):
    email: str
    password: str

class RefreshRequest(BaseModel):
    refresh_token: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str | None = "candidate"
    created_at: datetime | None = None

class AuthTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: UserResponse

class MessageResponse(BaseModel):
    message: str

# ── Mock helpers for local dev ────────────────────────────────────────────

def _mock_role(email: str, explicit_role: str | None = None) -> str:
    """Derive role from email or explicit selection for local dev."""
    if explicit_role and explicit_role.lower() in ("candidate", "faculty", "admin"):
        return explicit_role.lower()
    e = email.lower()
    if "admin" in e:   return "admin"
    if "faculty" in e: return "faculty"
    return "candidate"

def _stable_mock_id(email: str) -> str:
    """Deterministic user ID from email so the same user gets the same ID across logins."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, email.lower().strip()))


async def _ensure_platform_user(user_id: str, email: str, name: str, role: str):
    """Upsert a platform_users row so institutional queries work in mock mode."""
    try:
        from sqlalchemy import text

        from backend.database import get_db
        async for db in get_db():
            await db.execute(text(
                "INSERT INTO platform_users (id, email, name, role, auth_provider, data_consent_given, created_at, updated_at) "
                "VALUES (:id, :email, :name, :role, 'mock', FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) "
                "ON CONFLICT (id) DO UPDATE SET name = :name, role = :role, email = :email, updated_at = CURRENT_TIMESTAMP"
            ), {"id": user_id, "email": email, "name": name, "role": role})
            await db.commit()
            break
    except Exception as e:
        logger.error(f"platform_users upsert failed: {type(e).__name__}: {e}")


def _mock_tokens(user_id: str, email: str, name: str | None = None, role: str | None = None) -> AuthTokenResponse:
    import time
    assigned_role = _mock_role(email, role)
    display_name = name or (email.split("@")[0] if "@" in email else email)
    access = jwt.encode(
        {"sub": user_id, "email": email, "name": display_name, "role": assigned_role, "exp": int(time.time()) + 3600},
        _MOCK_SECRET, algorithm="HS256"
    )
    refresh = jwt.encode(
        {"sub": user_id, "email": email, "name": display_name, "role": assigned_role, "type": "refresh", "exp": int(time.time()) + 86400 * 30},
        _MOCK_SECRET, algorithm="HS256"
    )
    return AuthTokenResponse(
        access_token=access,
        refresh_token=refresh,
        user=UserResponse(id=user_id, email=email, name=display_name, role=assigned_role),
    )

# ── Route factory ─────────────────────────────────────────────────────────

def create_auth_api(app):
    router = APIRouter(prefix="/auth", tags=["auth"])

    @router.post("/register", response_model=AuthTokenResponse)
    async def register(body: RegisterRequest):
        if USE_MOCK_AUTH:
            uid = _stable_mock_id(body.email)
            display_name = body.name or body.email.split("@")[0]
            role = _mock_role(body.email, body.role)
            await _ensure_platform_user(uid, body.email, display_name, role)
            return _mock_tokens(uid, body.email, display_name, body.role)
        if not _cognito_available():
            raise HTTPException(status_code=503, detail="Auth service not configured")
        try:
            cog = _get_cognito()
            resp = await asyncio.to_thread(
                cog.sign_up,
                ClientId=COGNITO_CLIENT_ID,
                Username=body.email,
                Password=body.password,
                UserAttributes=[
                    {"Name": "email", "Value": body.email},
                    {"Name": "name", "Value": body.name},
                ],
            )
            user_id = resp["UserSub"]
            # Auto-confirm for dev (remove in prod — use email verification)
            if os.getenv("COGNITO_AUTO_CONFIRM", "false").lower() == "true":
                await asyncio.to_thread(
                    cog.admin_confirm_sign_up,
                    UserPoolId=COGNITO_USER_POOL_ID,
                    Username=body.email,
                )
            # Login to get tokens
            auth_resp = await asyncio.to_thread(
                cog.initiate_auth,
                AuthFlow="USER_PASSWORD_AUTH",
                AuthParameters={"USERNAME": body.email, "PASSWORD": body.password},
                ClientId=COGNITO_CLIENT_ID,
            )
            tokens = auth_resp["AuthenticationResult"]
            return AuthTokenResponse(
                access_token=tokens["AccessToken"],
                refresh_token=tokens["RefreshToken"],
                user=UserResponse(id=user_id, email=body.email, name=body.name),
            )
        except ClientError as e:
            code = e.response["Error"]["Code"]
            if code == "UsernameExistsException":
                raise HTTPException(status_code=409, detail="Email already registered")
            raise HTTPException(status_code=400, detail=e.response["Error"]["Message"])

    @router.post("/login", response_model=AuthTokenResponse)
    async def login(body: LoginRequest):
        if USE_MOCK_AUTH:
            uid = _stable_mock_id(body.email)
            display_name = body.email.split("@")[0]
            role = _mock_role(body.email)
            await _ensure_platform_user(uid, body.email, display_name, role)
            return _mock_tokens(uid, body.email, display_name, role)
        if not _cognito_available():
            raise HTTPException(status_code=503, detail="Auth service not configured")
        try:
            cog = _get_cognito()
            resp = await asyncio.to_thread(
                cog.initiate_auth,
                AuthFlow="USER_PASSWORD_AUTH",
                AuthParameters={"USERNAME": body.email, "PASSWORD": body.password},
                ClientId=COGNITO_CLIENT_ID,
            )
            tokens = resp["AuthenticationResult"]
            payload = jwt.decode(tokens["IdToken"], options={"verify_signature": False})
            user_role = _extract_role_from_payload(payload)
            return AuthTokenResponse(
                access_token=tokens["AccessToken"],
                refresh_token=tokens["RefreshToken"],
                user=UserResponse(
                    id=payload.get("sub", ""),
                    email=payload.get("email", body.email),
                    name=payload.get("name", ""),
                    role=user_role,
                ),
            )
        except ClientError as e:
            code = e.response["Error"]["Code"]
            if code in ("NotAuthorizedException", "UserNotFoundException"):
                raise HTTPException(status_code=401, detail="Invalid email or password")
            raise HTTPException(status_code=400, detail=e.response["Error"]["Message"])

    @router.post("/refresh", response_model=AuthTokenResponse)
    async def refresh(body: RefreshRequest):
        if USE_MOCK_AUTH:
            payload = jwt.decode(body.refresh_token, _MOCK_SECRET, algorithms=["HS256"])
            return _mock_tokens(payload["sub"], payload.get("email", ""), payload.get("name", ""), payload.get("role"))
        if not _cognito_available():
            raise HTTPException(status_code=503, detail="Auth service not configured")
        try:
            cog = _get_cognito()
            resp = await asyncio.to_thread(
                cog.initiate_auth,
                AuthFlow="REFRESH_TOKEN_AUTH",
                AuthParameters={"REFRESH_TOKEN": body.refresh_token},
                ClientId=COGNITO_CLIENT_ID,
            )
            tokens = resp["AuthenticationResult"]
            payload = jwt.decode(tokens["AccessToken"], options={"verify_signature": False})
            return AuthTokenResponse(
                access_token=tokens["AccessToken"],
                refresh_token=body.refresh_token,  # Cognito doesn't re-issue refresh on REFRESH flow
                user=UserResponse(id=payload.get("sub", ""), email=payload.get("email", ""), name=""),
            )
        except ClientError:
            raise HTTPException(status_code=401, detail="Token refresh failed")

    @router.get("/me", response_model=UserResponse)
    async def me(user: dict[str, Any] = Depends(get_current_user)):
        display_name = user.get("name") or (user["email"].split("@")[0] if "@" in user["email"] else user["email"])
        return UserResponse(
            id=user["id"],
            email=user["email"],
            name=display_name,
            role=user.get("role", "candidate"),
        )

    @router.post("/logout", response_model=MessageResponse)
    async def logout(user: dict[str, Any] = Depends(get_current_user)):
        # Cognito: revoke access token (best-effort)
        if _cognito_available():
            try:
                token = user.get("payload", {}).get("jti")  # use token from header if needed
                # Global sign-out revokes all tokens for the user
                await asyncio.to_thread(
                    _get_cognito().admin_user_global_sign_out,
                    UserPoolId=COGNITO_USER_POOL_ID,
                    Username=user["email"],
                )
            except Exception:
                pass  # best-effort
        return MessageResponse(message="Logged out successfully")

    @router.delete("/me/data", response_model=MessageResponse)
    async def delete_my_data(user: dict[str, Any] = Depends(get_current_user)):
        """
        DPDPA / GDPR right to deletion.
        Deletes all user data cascading through all tables.
        """
        user_id = user["id"]
        try:
            from sqlalchemy import text as sql_text

            from backend.database import get_db
            async for db in get_db():
                # Cascade deletes via FK constraints — delete top-level rows only
                await db.execute(sql_text("DELETE FROM interview_sessions WHERE user_id = :uid"), {"uid": user_id})
                await db.execute(sql_text("DELETE FROM interview_blueprints WHERE user_id = :uid"), {"uid": user_id})
                await db.execute(sql_text("DELETE FROM candidate_profiles WHERE user_id = :uid"), {"uid": user_id})
                await db.execute(sql_text(
                    "UPDATE platform_users SET email=:anon, name='[deleted]', auth_provider_id=NULL "
                    "WHERE id = :uid",
                ), {"anon": f"deleted_{user_id}@deleted", "uid": user_id})
                await db.commit()
                break
        except Exception as e:
            logger.error(f"Data deletion error for user {user_id}: {type(e).__name__}")
            raise HTTPException(status_code=500, detail="Data deletion failed")

        # Delete from Cognito (best-effort)
        if _cognito_available():
            try:
                await asyncio.to_thread(
                    _get_cognito().admin_delete_user,
                    UserPoolId=COGNITO_USER_POOL_ID,
                    Username=user["email"],
                )
            except Exception:
                pass

        logger.info(f"User data deleted: user_id={user_id}")
        return MessageResponse(message="All your data has been deleted.")

    app.include_router(router)
    logger.info("Auth API routes registered (Cognito backend)")

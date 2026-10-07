"""
Simple code execution endpoint — frontend-facing.

Accepts {source_code, language, stdin} and returns {status, stdout, stderr}.
Calls Judge0 when JUDGE0_URL is configured; returns a clear error otherwise.
"""

import os
import base64
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/execution", tags=["execution"])

LANGUAGE_IDS = {
    "python": 71, "python3": 71, "javascript": 63, "js": 63,
    "java": 62, "cpp": 54, "c++": 54, "c": 50,
}


class RunRequest(BaseModel):
    source_code: str
    language: str = "python"
    stdin: str = ""
    question_id: Optional[str] = None
    test_cases: Optional[list] = None
    session_id: Optional[str] = None


class SubmitRequest(BaseModel):
    question_id: str
    language: str
    source_code: str


def _judge0_config():
    url = os.getenv("JUDGE0_URL", "").rstrip("/")
    token = os.getenv("JUDGE0_AUTH_TOKEN", "")
    header = os.getenv("JUDGE0_AUTH_HEADER", "X-Auth-Token")
    if not url:
        return None, None
    return url, {header: token} if token else {}


def _b64(s: str) -> str:
    return base64.b64encode(s.encode()).decode()


def _decode(s: str | None) -> str:
    if not s:
        return ""
    try:
        return base64.b64decode(s).decode("utf-8", errors="replace")
    except (ValueError, TypeError):
        return s


@router.post("/run")
async def run_code(request: RunRequest):
    judge0_url, headers = _judge0_config()
    if not judge0_url:
        return {
            "status": "error",
            "stdout": "",
            "stderr": "Judge0 not configured. Set JUDGE0_URL env var.",
            "execution_time": 0,
            "memory_used": 0,
        }

    lang = request.language.lower()
    lang_id = LANGUAGE_IDS.get(lang)
    if not lang_id:
        return {"status": "error", "stdout": "", "stderr": f"Unsupported language: {request.language}"}

    submission = {
        "source_code": _b64(request.source_code),
        "language_id": lang_id,
        "stdin": _b64(request.stdin) if request.stdin else "",
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                f"{judge0_url}/submissions",
                headers=headers,
                params={"base64_encoded": "true", "wait": "true", "fields": "*"},
                json=submission,
            )
            if r.status_code not in (200, 201):
                return {"status": "error", "stdout": "", "stderr": f"Judge0 error: {r.status_code}"}

            data = r.json()

        status_id = data.get("status", {}).get("id", 0)
        status_map = {3: "ACCEPTED", 5: "TIME_LIMIT_EXCEEDED", 6: "COMPILATION_ERROR", 11: "RUNTIME_ERROR"}
        status = status_map.get(status_id, "RUNTIME_ERROR" if status_id > 3 else "ACCEPTED")

        return {
            "status": status,
            "stdout": _decode(data.get("stdout", "")),
            "stderr": _decode(data.get("stderr", "") or data.get("compile_output", "")),
            "execution_time": float(data.get("time", 0) or 0),
            "memory_used": int(data.get("memory", 0) or 0),
        }
    except httpx.RequestError as e:
        logger.error(f"Judge0 connection failed: {e}")
        return {"status": "error", "stdout": "", "stderr": "Could not reach Judge0 execution service."}


@router.post("/submit")
async def submit_code(request: SubmitRequest):
    return {
        "status": "error",
        "passed": False,
        "total_test_cases": 0,
        "passed_test_cases": 0,
        "results": [],
        "error": "Use /api/code/submit for test-case-based submission.",
    }

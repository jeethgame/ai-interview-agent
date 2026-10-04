"""
Voxie Agent HTTP Bridge — 4-endpoint contract.

Voxie (WebRTC + Deepgram) calls these endpoints; we bridge to AgentSessionManager.
Session must already exist in ThreadSafeSessionRegistry (created via
POST /interview/session + POST /interview/start) before Voxie connects.
"""

import asyncio
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services import get_session_registry
from backend.config import get_logger

router = APIRouter()
logger = get_logger(__name__)


# ── Request models ─────────────────────────────────────────────────────────

class ListenRequest(BaseModel):
    call_id: str
    direction: Optional[str] = "inbound"
    resource_id: Optional[str] = None
    language: Optional[str] = "en-US"


class GreetingRequest(BaseModel):
    call_id: str
    language: Optional[str] = "en-US"


class ChatRequest(BaseModel):
    call_id: str
    text: str
    interrupted_text: Optional[str] = ""
    language: Optional[str] = "en-US"


class OneshotRequest(BaseModel):
    text: str
    language: Optional[str] = "en-US"


# ── Helpers ────────────────────────────────────────────────────────────────

def _lang_tag(lang: Optional[str]) -> str:
    code = (lang or "en-US").split("-")[0].lower()
    return f"[lang:{code}] "


async def _get_session(call_id: str):
    """Fetch AgentSessionManager from registry; 404 if missing."""
    registry = get_session_registry()
    session = await registry.get_session_manager(call_id)
    if not session:
        raise HTTPException(
            status_code=404,
            detail=f"No active session for call_id={call_id}. "
                   "Call POST /interview/session + /interview/start first.",
        )
    return session


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.post("/listen")
async def handle_listen(req: ListenRequest):
    """
    Voxie calls this on new inbound call.
    resource_id carries the session_id set via X-Resource-ID in the WHIP header.
    Just acknowledge — session warm-up is done by the frontend REST flow.
    """
    logger.info(
        "Voxie /listen: call_id=%s resource_id=%s", req.call_id, req.resource_id
    )
    return {"status": "ok"}


@router.post("/greeting")
async def handle_greeting(req: GreetingRequest):
    """
    Voxie calls this once after WHIP connect, before candidate speaks.
    Returns the interview opening introduction (template, no LLM).
    """
    session = await _get_session(req.call_id)
    intro = session.get_interviewer_introduction()
    tag = _lang_tag(req.language)
    logger.info("Voxie /greeting: call_id=%s", req.call_id)
    return {"text": tag + intro, "end_call": False}


@router.post("/chat")
async def handle_chat(req: ChatRequest):
    """
    Voxie calls this for every completed candidate utterance.
    interrupted_text carries the partial transcript when candidate barged in.
    """
    session = await _get_session(req.call_id)
    tag = _lang_tag(req.language)

    # Barge-in guard: if main text is empty, fall back to interrupted partial
    candidate_text = req.text.strip() or (req.interrupted_text or "").strip()
    if not candidate_text:
        return {
            "text": tag + "I didn't quite catch that — could you say that again?",
            "end_call": False,
        }

    logger.info("Voxie /chat: call_id=%s text=%.60s", req.call_id, candidate_text)

    # Run through full ORDA loop (CoachAgent fires inside process_message)
    response = session.process_message(candidate_text)
    interviewer_text = response.get("content", "")

    # FSM end check — time limit or question count reached
    if session.should_end_interview():
        session.end_interview()
        # Kick off async final summary — non-blocking
        asyncio.create_task(session._generate_final_summary_background())
        return {
            "text": tag + "Thank you — that concludes our interview. "
                    "Your scorecard will be ready shortly.",
            "end_call": True,
        }

    return {"text": tag + interviewer_text, "end_call": False}


@router.post("/oneshot")
async def handle_oneshot(req: OneshotRequest):
    """
    Standalone prompt — used by Voxie for one-off disambiguation queries
    outside the interview session flow.
    """
    tag = _lang_tag(req.language)
    return {"text": tag + "Understood."}

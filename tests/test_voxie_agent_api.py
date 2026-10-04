"""
Unit tests for the Voxie agent HTTP bridge.
All tests mock ThreadSafeSessionRegistry so no real session or LLM is needed.
"""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def mock_services(monkeypatch):
    """Patch service initialisation so TestClient doesn't need a running backend."""
    import backend.services as svc
    monkeypatch.setattr(svc, "_session_registry", MagicMock(), raising=False)
    monkeypatch.setattr(svc, "_llm_service", MagicMock(), raising=False)
    monkeypatch.setattr(svc, "_event_bus", MagicMock(), raising=False)


def _make_session(intro="Hello!", response="How would you design a cache?", end=False):
    session = MagicMock()
    session.get_interviewer_introduction.return_value = intro
    session.process_message.return_value = {"content": response}
    session.should_end_interview.return_value = end
    session.end_interview.return_value = {}
    session._generate_final_summary_background = AsyncMock()
    return session


def _patch_registry(session):
    registry = MagicMock()
    registry.get_session_manager = AsyncMock(return_value=session)
    return patch("backend.api.voxie_agent_api.get_session_registry", return_value=registry)


# ── Tests ──────────────────────────────────────────────────────────────────

def test_listen_returns_ok():
    from backend.api.voxie_agent_api import router
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(router, prefix="/api/voxie")
    client = TestClient(app)

    resp = client.post("/api/voxie/listen", json={"call_id": "call-1"})
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_greeting_returns_intro_and_end_call_false():
    from backend.api.voxie_agent_api import router
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(router, prefix="/api/voxie")
    client = TestClient(app)

    session = _make_session(intro="Hi! Tell me about yourself.")
    with _patch_registry(session):
        resp = client.post("/api/voxie/greeting", json={"call_id": "call-1"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["end_call"] is False
    assert "Hi!" in data["text"]
    assert data["text"].startswith("[lang:en]")


def test_chat_returns_next_question():
    from backend.api.voxie_agent_api import router
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(router, prefix="/api/voxie")
    client = TestClient(app)

    session = _make_session(response="How would you design a cache?")
    with _patch_registry(session):
        resp = client.post("/api/voxie/chat", json={
            "call_id": "call-1",
            "text": "I am a backend engineer with 3 years of experience.",
        })

    assert resp.status_code == 200
    data = resp.json()
    assert data["end_call"] is False
    assert "cache" in data["text"]
    session.process_message.assert_called_once_with(
        "I am a backend engineer with 3 years of experience."
    )


def test_chat_ends_interview_when_limit_reached():
    from backend.api.voxie_agent_api import router
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(router, prefix="/api/voxie")
    client = TestClient(app)

    session = _make_session(end=True)
    with _patch_registry(session), patch("asyncio.create_task"):
        resp = client.post("/api/voxie/chat", json={
            "call_id": "call-1",
            "text": "That is my final answer.",
        })

    assert resp.status_code == 200
    data = resp.json()
    assert data["end_call"] is True
    assert "concludes" in data["text"]
    session.end_interview.assert_called_once()


def test_chat_barge_in_falls_back_to_interrupted_text():
    from backend.api.voxie_agent_api import router
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(router, prefix="/api/voxie")
    client = TestClient(app)

    session = _make_session(response="Good point.")
    with _patch_registry(session):
        resp = client.post("/api/voxie/chat", json={
            "call_id": "call-1",
            "text": "",
            "interrupted_text": "I was saying microservices reduce coupling",
        })

    assert resp.status_code == 200
    assert resp.json()["end_call"] is False
    session.process_message.assert_called_once_with(
        "I was saying microservices reduce coupling"
    )


def test_chat_silence_returns_repeat_prompt():
    from backend.api.voxie_agent_api import router
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(router, prefix="/api/voxie")
    client = TestClient(app)

    session = _make_session()
    with _patch_registry(session):
        resp = client.post("/api/voxie/chat", json={
            "call_id": "call-1",
            "text": "",
            "interrupted_text": "",
        })

    assert resp.status_code == 200
    data = resp.json()
    assert data["end_call"] is False
    assert "again" in data["text"].lower()
    session.process_message.assert_not_called()


def test_greeting_404_when_no_session():
    from backend.api.voxie_agent_api import router
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(router, prefix="/api/voxie")
    client = TestClient(app)

    registry = MagicMock()
    registry.get_session_manager = AsyncMock(return_value=None)
    with patch("backend.api.voxie_agent_api.get_session_registry", return_value=registry):
        resp = client.post("/api/voxie/greeting", json={"call_id": "no-such-call"})

    assert resp.status_code == 404

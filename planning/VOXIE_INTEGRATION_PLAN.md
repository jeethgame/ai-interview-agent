# Voxie Voice Pipeline Integration Plan
## integrated-interview-agent → Voxie WebRTC + Deepgram (English-only mode)

> **Status:** Planning
> **Voxie path:** `C:\Users\praje\Voxie`
> **App path:** `C:\WORKS\VsCode\Hope-Elite-Works\Sept-Project\integrated-interview-agent`
> **Mode:** Pure Deepgram English — no Kokoro, no voice-router, no extra Python services

---

## What Changes vs What Stays

| File / Subsystem | Action | Why |
|---|---|---|
| `backend/agents/orchestrator.py` | **Keep 100%** | AgentSessionManager, ORDA loop untouched |
| `backend/agents/interviewer.py` | **Keep 100%** | InterviewerAgent, FSM untouched |
| `backend/agents/agentic_coach.py` | **Keep 100%** | CoachAgent untouched |
| `backend/eval_engine/` | **Keep 100%** | Scoring pipeline untouched |
| `backend/database/` + `backend/models/` | **Keep 100%** | Sessions, turns, reports persist |
| `backend/api/auth_api.py` | **Keep 100%** | Auth unchanged |
| `backend/api/agent_api.py` | **Keep 100%** | REST interview endpoints unchanged |
| `backend/api/speech_api.py` (845 lines) | **Deprecate** | Replaced by Voxie Go server |
| `backend/api/interview_ws.py` | **Deprecate** | Voxie handles WebRTC transport |
| `backend/api/speech/` (directory) | **Deprecate** | stt_service, tts_service, websocket_processor all replaced |
| `frontend/src/hooks/useVoiceFirstInterview.ts` (265 lines) | **Replace** | WebSocket PCM → WHIP WebRTC |
| `frontend/src/utils/streamingAudioPlayer.ts` | **Deprecate** | Browser WebRTC handles playout natively |
| `backend/api/voxie_agent_api.py` | **NEW** | ~100-line HTTP bridge: 4 Voxie endpoints → AgentSessionManager |
| `C:\Users\praje\Voxie\configs\voxie.toml` | **NEW** | Deepgram-only config |
| `C:\Users\praje\Voxie\.env` | **NEW** | DEEPGRAM_API_KEY only |

---

## Architecture: Before vs After

### Before (current)
```
Browser mic
  → WebSocket PCM binary frames → backend/api/speech_api.py (845 lines)
  → Deepgram STT (Python SDK)
  → AgentSessionManager.process_message()
  → Deepgram TTS → audio bytes back over WS
  → StreamingAudioPlayer.ts (client jitter buffer)
```

### After (Voxie)
```
Browser mic
  → WebRTC WHIP POST http://localhost:8080/whip
  → Voxie Go daemon (port 8080)
  → Deepgram STT (Go SDK, streaming)
  → POST /api/voxie/greeting or /api/voxie/chat  ← our FastAPI bridge
  → AgentSessionManager (unchanged)
  → text response back to Voxie
  → Deepgram TTS Aura-2 (Go SDK)
  → WebRTC audio back to browser (native playback, no jitter code)
```

---

## Phase 1 — Backend Bridge (`voxie_agent_api.py`)

### 1.1 Create `backend/api/voxie_agent_api.py`

**File to create:** `backend/api/voxie_agent_api.py`

Four endpoints bridging Voxie HTTP contract → AgentSessionManager:

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import asyncio

from backend.services import get_session_registry
from backend.config import get_logger

router = APIRouter()
logger = get_logger(__name__)

# ── Pydantic models ────────────────────────────────────────────────────────

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

def _lang_tag(lang: str) -> str:
    """Prefix text with Voxie language tag."""
    code = (lang or "en-US").split("-")[0].lower()
    return f"[lang:{code}] "

def _get_session(call_id: str):
    registry = get_session_registry()
    session = registry.get_session(call_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"No session for call_id={call_id}")
    return session

# ── Endpoints ──────────────────────────────────────────────────────────────

@router.post("/listen")
async def handle_listen(req: ListenRequest):
    """
    Voxie calls this when a new call arrives.
    resource_id maps to our session_id / user_id.
    """
    logger.info(f"Voxie /listen: call_id={req.call_id} resource_id={req.resource_id}")
    # Optionally pre-warm session here if resource_id is known
    return {"status": "ok"}


@router.post("/greeting")
async def handle_greeting(req: GreetingRequest):
    """
    Voxie calls this once after connection, before candidate speaks.
    Returns the interview opening introduction.
    """
    session = _get_session(req.call_id)
    intro = session.get_interviewer_introduction()
    tag = _lang_tag(req.language)
    logger.info(f"Voxie /greeting: call_id={req.call_id}")
    return {
        "text": tag + intro,
        "end_call": False,
    }


@router.post("/chat")
async def handle_chat(req: ChatRequest):
    """
    Voxie calls this for every candidate utterance.
    interrupted_text carries partial speech if candidate barged in.
    """
    session = _get_session(req.call_id)
    tag = _lang_tag(req.language)

    # Use full text; fall back to interrupted_text if main text is empty (barge-in)
    candidate_text = req.text.strip() or req.interrupted_text.strip()
    if not candidate_text:
        # Silence / noise burst — prompt to continue
        return {"text": tag + "I didn't catch that. Could you please repeat?", "end_call": False}

    logger.info(f"Voxie /chat: call_id={req.call_id} text={candidate_text[:60]}")

    # Pass through ORDA loop
    response = session.process_message(candidate_text)
    interviewer_text = response.get("content", "")

    # Check FSM end condition
    if session.should_end_interview():
        session.end_interview()
        # Fire async final summary (non-blocking)
        asyncio.create_task(session._generate_final_summary_background())
        return {
            "text": tag + "Thank you — that concludes our interview. Your scorecard will be ready shortly.",
            "end_call": True,
        }

    return {
        "text": tag + interviewer_text,
        "end_call": False,
    }


@router.post("/oneshot")
async def handle_oneshot(req: OneshotRequest):
    """
    Standalone LLM prompt — used by Voxie for disambiguation or
    one-off queries outside the interview session flow.
    """
    tag = _lang_tag(req.language)
    # Passthrough for now; wire to LLMService if needed
    return {"text": tag + "Understood."}
```

**Key design decisions:**
- `/listen` just acknowledges — session warm-up happens via existing `POST /interview/session` + `POST /interview/start` before Voxie connects
- `/greeting` calls `get_interviewer_introduction()` — same template-based, no LLM
- `/chat` runs the full ORDA loop via `process_message()` — CoachAgent fires inside it
- barge-in: `interrupted_text` fallback means partial speech still routes through
- end condition: `should_end_interview()` checked after every turn, async summary spawned

---

### 1.2 Mount in `backend/main.py`

**File to modify:** `backend/main.py`

Add after the existing router imports (around line 65):
```python
from backend.api.voxie_agent_api import router as voxie_router
```

Add after the existing `app.include_router(interview_ws_router)` call (around line 241):
```python
app.include_router(voxie_router, prefix="/api/voxie", tags=["voxie"])
logger.info("Voxie agent HTTP bridge registered (/api/voxie/*)")
```

**No other changes to main.py.** `speech_api` and `interview_ws` stay mounted — they are not deleted, just unused when Voxie is the transport. Remove them in a follow-up cleanup PR.

---

### 1.3 Tests

**File to create:** `tests/test_voxie_agent_api.py`

```python
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
from backend.main import app

client = TestClient(app)

def test_listen_returns_ok():
    resp = client.post("/api/voxie/listen", json={"call_id": "test-call-1"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"

def test_greeting_returns_text_and_end_call_false():
    mock_session = MagicMock()
    mock_session.get_interviewer_introduction.return_value = "Hello! Tell me about yourself."
    with patch("backend.api.voxie_agent_api.get_session_registry") as mock_reg:
        mock_reg.return_value.get_session.return_value = mock_session
        resp = client.post("/api/voxie/greeting", json={"call_id": "test-call-1"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["end_call"] is False
    assert "Hello" in data["text"]

def test_chat_returns_next_question():
    mock_session = MagicMock()
    mock_session.process_message.return_value = {"content": "How would you design a cache?"}
    mock_session.should_end_interview.return_value = False
    with patch("backend.api.voxie_agent_api.get_session_registry") as mock_reg:
        mock_reg.return_value.get_session.return_value = mock_session
        resp = client.post("/api/voxie/chat", json={"call_id": "test-call-1", "text": "I am a backend engineer."})
    assert resp.status_code == 200
    data = resp.json()
    assert data["end_call"] is False
    assert "cache" in data["text"]

def test_chat_ends_interview_when_limit_reached():
    mock_session = MagicMock()
    mock_session.process_message.return_value = {"content": "..."}
    mock_session.should_end_interview.return_value = True
    with patch("backend.api.voxie_agent_api.get_session_registry") as mock_reg, \
         patch("asyncio.create_task"):
        mock_reg.return_value.get_session.return_value = mock_session
        resp = client.post("/api/voxie/chat", json={"call_id": "test-call-1", "text": "Final answer."})
    assert resp.status_code == 200
    assert resp.json()["end_call"] is True

def test_chat_barge_in_uses_interrupted_text():
    mock_session = MagicMock()
    mock_session.process_message.return_value = {"content": "Good point."}
    mock_session.should_end_interview.return_value = False
    with patch("backend.api.voxie_agent_api.get_session_registry") as mock_reg:
        mock_reg.return_value.get_session.return_value = mock_session
        resp = client.post("/api/voxie/chat", json={
            "call_id": "test-call-1",
            "text": "",
            "interrupted_text": "I was saying microservices"
        })
    assert resp.status_code == 200
    mock_session.process_message.assert_called_once_with("I was saying microservices")
```

---

## Phase 2 — Configure Voxie (`C:\Users\praje\Voxie`)

### 2.1 Create `.env`

**File:** `C:\Users\praje\Voxie\.env`
```env
DEEPGRAM_API_KEY="11574b8f69856912aeb044b79c16a78ff63ee793"
```

### 2.2 Create `configs/voxie.toml`

**File:** `C:\Users\praje\Voxie\configs\voxie.toml`
```toml
[server]
port = 8080

[agent]
url = "http://localhost:8000/api/voxie"
timeout_ms = 5000
greeting_delay_ms = 3000

# STT: Deepgram English only
[stt]
provider = "failover"
failover = ["deepgram"]
language = "en-US"

[stt.barge_in]
enabled = true
echo_guard = "always"

# TTS: Deepgram Aura-2 (no Kokoro, no voice-router)
[tts]
provider = "deepgram"

[deepgram]
model = "nova-3"
tts_model = "aura-2-thalia-en"
language = "en-US"
```

### 2.3 Build the Go binary

```bash
cd C:\Users\praje\Voxie
go build -o voxie.exe .
```

Prerequisite: Go 1.21+ installed. Check with `go version`.

---

## Phase 3 — Frontend: Replace WebSocket with WHIP

### 3.1 Modify `frontend/src/hooks/useVoiceFirstInterview.ts`

**File to modify:** `frontend/src/hooks/useVoiceFirstInterview.ts` (265 lines)

Replace the WebSocket PCM binary streaming logic with this WHIP WebRTC connection:

```typescript
// REPLACE the startVoiceSession / WebSocket section with:

const peerRef = useRef<RTCPeerConnection | null>(null);

const startVoiceSession = async (sessionId: string) => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  const pc = new RTCPeerConnection();
  peerRef.current = pc;

  // Send mic audio to Voxie
  stream.getTracks().forEach(track => pc.addTrack(track, stream));

  // Receive TTS audio from Voxie — browser handles playout + echo cancel natively
  pc.ontrack = (event) => {
    const remoteAudio = new Audio();
    remoteAudio.srcObject = event.streams[0];
    remoteAudio.play().catch(console.error);
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // WHIP handshake to Voxie
  const res = await fetch("http://localhost:8080/whip", {
    method: "POST",
    headers: {
      "Content-Type": "application/sdp",
      "X-Resource-ID": sessionId,   // maps call_id in Voxie → our session_id
    },
    body: offer.sdp,
  });

  if (!res.ok) throw new Error(`WHIP failed: ${res.status}`);
  const answerSdp = await res.text();
  await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
};

const stopVoiceSession = () => {
  peerRef.current?.close();
  peerRef.current = null;
};
```

**What to remove from the existing hook:**
- All `WebSocket` construction and `ws.onmessage` audio byte handling
- All `StreamingAudioPlayer` imports and usage
- All PCM binary frame assembly code
- The manual jitter buffer / audio queue

**What to keep:**
- `isRecording`, `isConnected`, `sessionId` state
- REST calls to `POST /interview/session` and `POST /interview/start` — these still run first to register the session in `AgentSessionManager` before Voxie connects
- Error handling and disconnect UI

### 3.2 Mark `StreamingAudioPlayer.ts` deprecated

**File:** `frontend/src/utils/streamingAudioPlayer.ts`

Add at top (do not delete yet — remove in follow-up):
```typescript
// @deprecated — replaced by native WebRTC browser audio playback via Voxie
```

---

## Phase 4 — Run Order (2 Terminals)

```
Terminal 1 — FastAPI backend
  cd C:\WORKS\VsCode\Hope-Elite-Works\Sept-Project\integrated-interview-agent\backend
  source venv/Scripts/activate
  PYTHONPATH=.. USE_MOCK_AUTH=true uvicorn main:app --port 8000 --reload

Terminal 2 — Voxie daemon
  cd C:\Users\praje\Voxie
  .\voxie.exe
```

Voxie listens on `:8080` (WebRTC WHIP + media). FastAPI listens on `:8000` (Voxie HTTP callbacks + all existing REST).

Frontend Vite dev server (`npm run dev`) as before — no change to frontend startup.

---

## Phase 5 — Verification

### 5.1 Unit tests (backend)
```bash
cd C:\WORKS\VsCode\Hope-Elite-Works\Sept-Project\integrated-interview-agent
pytest tests/test_voxie_agent_api.py -v
```

### 5.2 Existing integration tests — must still pass
```bash
pytest tests/test_phase_1.py tests/test_phase_4_integration.py -v
```

### 5.3 Voxie synthetic caller (end-to-end)
```bash
cd C:\Users\praje\Voxie
python tools/callers/call.py en
```

**Pass criteria:**
- [ ] Voxie calls `POST /api/voxie/greeting` → receives intro text → plays TTS
- [ ] Synthetic candidate speech triggers `POST /api/voxie/chat` → receives next question
- [ ] Barge-in simulation: `interrupted_text` non-empty → still routes through ORDA
- [ ] After N turns: `end_call: true` returned, scorecard generation fires async
- [ ] Latency: text response from `/chat` returns in < 300ms (LLM excluded), TTS plays in ~130ms via Deepgram

---

## File Change Summary

### New files (create)
| File | Lines | Purpose |
|---|---|---|
| `backend/api/voxie_agent_api.py` | ~100 | 4-endpoint HTTP bridge |
| `tests/test_voxie_agent_api.py` | ~60 | Unit tests for bridge |
| `C:\Users\praje\Voxie\.env` | 1 | Deepgram API key |
| `C:\Users\praje\Voxie\configs\voxie.toml` | ~25 | Voxie server config |

### Modified files
| File | Change |
|---|---|
| `backend/main.py` | +2 lines: import + include_router |
| `frontend/src/hooks/useVoiceFirstInterview.ts` | Replace WS section with WHIP WebRTC (~50 lines changed) |

### Deprecated (keep but mark, delete in follow-up PR)
| File | Lines saved |
|---|---|
| `backend/api/speech_api.py` | 845 |
| `backend/api/interview_ws.py` | ~150 |
| `backend/api/speech/` (directory) | ~400 |
| `frontend/src/utils/streamingAudioPlayer.ts` | ~150 |

**Net change: +~160 lines written, ~1545 lines deprecated.**

---

## Risk Register

| Risk | Mitigation |
|---|---|
| `call_id` from Voxie doesn't match our `session_id` | Use `X-Resource-ID` header in WHIP to carry our session_id; map it in `/listen` |
| Session not found in registry at `/greeting` time | Frontend must call `POST /interview/start` before WHIP connect; add 404 guard in bridge |
| Barge-in produces empty `text` field | Fallback to `interrupted_text` in `/chat` handler |
| `process_message()` blocks on LLM call (~1–3s) | Already async in FastAPI; Voxie's `timeout_ms=5000` covers it |
| Go binary not building (missing deps) | Run `go mod tidy` first; requires Go 1.21+ |
| Existing WS tests break | `speech_api` and `interview_ws` stay mounted unchanged; no regressions |

---

*Plan authored Oct 2026 · `integration/full-merge`*

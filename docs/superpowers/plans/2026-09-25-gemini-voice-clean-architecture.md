# Gemini Voice Clean Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Gemini Live (gemini-live-2.5-flash-preview) work end-to-end as the sole voice engine — AI speaks audio, user speech is transcribed, turns cycle correctly — with no simulation mode or mock fallbacks.

**Architecture:** Rewrite `GeminiVoiceSession.start()` to launch a persistent background task that holds the `async with client.aio.live.connect()` context open; the receive loop runs inside that context and restarts after each turn. Add an abstract `VoiceEngineInterface` so both engines are swappable by env var. Remove Nova Sonic simulation entirely.

**Tech Stack:** Python 3.10, google-genai SDK (async), FastAPI WebSockets, asyncio tasks

## Global Constraints

- Working directory for all backend changes: `C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent/backend/`
- Python path must include the project root: run tests as `cd C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent && PYTHONPATH=. backend/venv/Scripts/python -m pytest ...`
- Never use `await ctx.__aenter__()` on an asynccontextmanager — use `async with` only
- Model name: `gemini-live-2.5-flash-preview` (not `gemini-3.8-live`)
- `response_modalities=["AUDIO"]` only — TEXT modality not supported on this model
- Transcripts come from `input_audio_transcription` / `output_audio_transcription` configs, not from response modalities
- Audio input format: 16kHz 16-bit PCM, `mime_type="audio/pcm;rate=16000"`
- Audio output format: 24kHz PCM chunks from `inline_data.data` in model_turn parts
- All Python files use `from backend.config import get_logger`
- No changes to any frontend file
- No changes to `orchestrator.py`, `agent_api.py`, `agentic_coach.py`

---

### Task 1: Add VoiceEngineInterface abstract base class

**Files:**
- Create: `services/voice_engine_interface.py`

**Interfaces:**
- Produces: `VoiceEngineInterface` ABC consumed by Task 2 (GeminiVoiceEngine) and available for NovaSonicVoiceEngine

- [ ] **Step 1: Create the interface file**

Write `backend/services/voice_engine_interface.py`:

```python
"""
Abstract interface all voice engines must implement.
Swap engines by setting VOICE_PROVIDER env var.
"""
from abc import ABC, abstractmethod
from typing import Any, Callable, Awaitable, Optional, Dict


class VoiceEngineInterface(ABC):
    """
    Contract for voice streaming engines (Gemini Live, Nova Sonic, etc.).
    speech_api.py calls only these methods — no engine-specific code there.
    """

    @property
    @abstractmethod
    def voice_id(self) -> str:
        """Default voice identifier for this engine."""
        ...

    @abstractmethod
    def is_configured(self) -> bool:
        """Return True if required credentials/config are present."""
        ...

    @abstractmethod
    def get_status(self) -> Dict[str, Any]:
        """Return engine status dict (provider, model_id, active_streams, etc.)."""
        ...

    @abstractmethod
    async def create_session(
        self,
        session_id: str,
        system_prompt: str = "",
        voice_id: Optional[str] = None,
        on_audio: Optional[Callable[[str], Awaitable[None]]] = None,
        on_transcript: Optional[Callable[[str, str, bool], Awaitable[None]]] = None,
        on_barge_in: Optional[Callable[[], Awaitable[None]]] = None,
        on_turn_ended: Optional[Callable[[str], Awaitable[None]]] = None,
        on_renewed: Optional[Callable[[], Awaitable[None]]] = None,
        on_error: Optional[Callable[[str], Awaitable[None]]] = None,
    ) -> Any:
        """
        Create and start a voice session. Returns the session object.
        on_audio(base64_str)          — AI audio chunk to play
        on_transcript(text, role, is_final) — transcript chunk
        on_barge_in()                 — user interrupted AI
        on_turn_ended(stop_reason)    — turn complete
        on_error(msg)                 — session error
        on_renewed()                  — connection renewed (no-op for Gemini)
        """
        ...

    @abstractmethod
    async def send_audio_chunk(self, session_id: str, base64_audio: str) -> None:
        """Send a base64-encoded 16kHz PCM audio chunk for a session."""
        ...

    @abstractmethod
    async def close_session(self, session_id: str) -> None:
        """Stop and clean up a voice session."""
        ...
```

- [ ] **Step 2: Verify the file is importable**

```bash
cd C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent
PYTHONPATH=. backend/venv/Scripts/python -c "from backend.services.voice_engine_interface import VoiceEngineInterface; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
cd C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent
git add backend/services/voice_engine_interface.py
git commit -m "feat(voice): add VoiceEngineInterface abstract base class"
```

---

### Task 2: Rewrite GeminiVoiceSession with persistent background task

**Files:**
- Modify: `backend/services/gemini_voice_engine.py` (full rewrite of `GeminiVoiceSession` class and `_get_gemini_voice_model` default)
- Modify: `backend/.env` (model name only)

**Interfaces:**
- Consumes: `VoiceEngineInterface` from Task 1
- Produces: `GeminiVoiceSession` with methods: `start()`, `stop()`, `send_audio_chunk(base64_audio)`, `send_text_turn(text)`, `is_connected: bool`
- Produces: `GeminiVoiceEngine` implementing `VoiceEngineInterface`
- Produces: `get_gemini_voice_engine() -> GeminiVoiceEngine` singleton

- [ ] **Step 1: Fix .env model name**

In `backend/.env`, change:
```
GEMINI_VOICE_MODEL=gemini-3.8-live
```
to:
```
GEMINI_VOICE_MODEL=gemini-live-2.5-flash-preview
```

- [ ] **Step 2: Rewrite gemini_voice_engine.py**

Replace the entire content of `backend/services/gemini_voice_engine.py` with:

```python
"""
GeminiVoiceEngine — Voice provider using Google Gemini Live API.

VOICE_PROVIDER=gemini routes all voice WebSocket connections here.
Uses a persistent background task holding async with client.aio.live.connect()
open for the full session duration.
"""
import os
import base64
import asyncio
import logging
from typing import Dict, Any, Optional, Callable, Awaitable

from dotenv import load_dotenv

_env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
load_dotenv(dotenv_path=_env_path) if os.path.exists(_env_path) else load_dotenv()

from google import genai
from google.genai import types

from backend.config import get_logger
from backend.services.voice_engine_interface import VoiceEngineInterface

logger = get_logger("GeminiVoiceEngine")

_DEFAULT_MODEL = "gemini-live-2.5-flash-preview"
_DEFAULT_VOICE = "Aoede"


def _get_api_key() -> str:
    return os.getenv("GEMINI_VOICE_API_KEY", "")


def _get_model() -> str:
    return os.getenv("GEMINI_VOICE_MODEL", _DEFAULT_MODEL)


def _get_voice_name() -> str:
    return os.getenv("GEMINI_VOICE_NAME", _DEFAULT_VOICE)


class GeminiVoiceSession:
    """
    One Gemini Live bidirectional voice session.

    Lifecycle:
      await session.start()   — spawns _session_task, returns when task is created
      ...audio flows...
      await session.stop()    — sets is_closing, cancels task, waits for clean exit

    The session task holds `async with client.aio.live.connect() as live:` open.
    The receive loop runs inside that context and restarts after each turn_complete.
    """

    def __init__(
        self,
        session_id: str,
        system_prompt: str = "",
        voice_name: Optional[str] = None,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        on_audio: Optional[Callable[[str], Awaitable[None]]] = None,
        on_transcript: Optional[Callable[[str, str, bool], Awaitable[None]]] = None,
        on_barge_in: Optional[Callable[[], Awaitable[None]]] = None,
        on_turn_ended: Optional[Callable[[str], Awaitable[None]]] = None,
        on_renewed: Optional[Callable[[], Awaitable[None]]] = None,
        on_error: Optional[Callable[[str], Awaitable[None]]] = None,
    ):
        self.session_id = session_id
        self.system_prompt = system_prompt
        self.voice_name = voice_name or _get_voice_name()
        self.model = model or _get_model()
        self.api_key = api_key or _get_api_key()

        self.on_audio = on_audio
        self.on_transcript = on_transcript
        self.on_barge_in = on_barge_in
        self.on_turn_ended = on_turn_ended
        self.on_renewed = on_renewed
        self.on_error = on_error

        self._live_session = None          # set inside _session_task
        self._session_task: Optional[asyncio.Task] = None
        self._connected_event = asyncio.Event()  # signals when live session is ready
        self.is_connected = False
        self.is_closing = False
        self.active_provider = f"gemini-live:{self.model}"

    # ------------------------------------------------------------------ #
    # Public API                                                           #
    # ------------------------------------------------------------------ #

    async def start(self) -> bool:
        """Spawn the persistent session task. Returns True if task was created."""
        if not self.api_key or self.api_key.startswith("your_"):
            msg = "GEMINI_VOICE_API_KEY not configured. Set it in .env."
            logger.error(msg)
            if self.on_error:
                await self.on_error(msg)
            return False

        self._session_task = asyncio.create_task(
            self._session_task_fn(),
            name=f"gemini-session-{self.session_id}"
        )
        logger.info(f"Gemini Live session task spawned: {self.session_id} model={self.model}")
        return True

    async def stop(self):
        """Signal the session task to exit and wait for it."""
        self.is_closing = True
        self.is_connected = False
        self._connected_event.clear()

        if self._session_task and not self._session_task.done():
            self._session_task.cancel()
            try:
                await asyncio.wait_for(self._session_task, timeout=5.0)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass

        self._live_session = None
        logger.info(f"Gemini Live session stopped: {self.session_id}")

    async def send_audio_chunk(self, base64_audio: str):
        """Send a 16kHz PCM audio chunk to Gemini Live."""
        if not self.is_connected or self.is_closing or not self._live_session:
            return
        try:
            raw_bytes = base64.b64decode(base64_audio)
            await self._live_session.send_realtime_input(
                audio=types.Blob(data=raw_bytes, mime_type="audio/pcm;rate=16000")
            )
        except Exception as e:
            logger.error(f"Error sending audio chunk: {e}")

    async def send_text_turn(self, text: str):
        """Send a text prompt so Gemini responds with voice (used for initial greeting)."""
        if not self.is_connected or self.is_closing or not self._live_session:
            return
        try:
            await self._live_session.send_client_content(
                turns=types.Content(parts=[types.Part(text=text)])
            )
            logger.debug(f"Sent text turn to Gemini: {text[:80]}")
        except Exception as e:
            logger.error(f"Error sending text turn: {e}")

    async def wait_until_connected(self, timeout: float = 8.0) -> bool:
        """Wait until the live session is ready. Returns True if connected in time."""
        try:
            await asyncio.wait_for(self._connected_event.wait(), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            logger.warning(f"Gemini session {self.session_id} did not connect within {timeout}s")
            return False

    async def renew_connection(self):
        """No-op: Gemini Live manages its own connection lifecycle."""
        pass

    # ------------------------------------------------------------------ #
    # Internal: persistent session task                                    #
    # ------------------------------------------------------------------ #

    async def _session_task_fn(self):
        """
        Holds the async with live.connect() context open for the entire session.
        Exits only when is_closing=True or a fatal error occurs.
        """
        client = genai.Client(api_key=self.api_key)

        config = types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            system_instruction=types.Content(
                parts=[types.Part(text=self.system_prompt)]
            ) if self.system_prompt else None,
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name=self.voice_name
                    )
                )
            ),
            input_audio_transcription=types.AudioTranscriptionConfig(),
            output_audio_transcription=types.AudioTranscriptionConfig(),
        )

        try:
            async with client.aio.live.connect(model=self.model, config=config) as live:
                self._live_session = live
                self.is_connected = True
                self._connected_event.set()
                logger.info(
                    f"Gemini Live connected: session={self.session_id} "
                    f"model={self.model} voice={self.voice_name}"
                )
                await self._receive_loop()

        except asyncio.CancelledError:
            pass  # clean stop() call
        except Exception as e:
            if not self.is_closing:
                logger.error(f"Gemini Live session error: {e}")
                if self.on_error:
                    try:
                        await self.on_error(f"Gemini Live session failed: {e}")
                    except Exception:
                        pass
        finally:
            self.is_connected = False
            self._live_session = None
            self._connected_event.clear()

    async def _receive_loop(self):
        """
        Processes messages from Gemini Live.
        Restarts after each turn_complete so multi-turn interviews work.
        """
        while not self.is_closing:
            try:
                async for msg in self._live_session.receive():
                    if self.is_closing:
                        return

                    sc = getattr(msg, "server_content", None)
                    if not sc:
                        continue

                    # Barge-in (user interrupted AI)
                    if getattr(sc, "interrupted", False):
                        if self.on_barge_in:
                            await self.on_barge_in()
                        continue

                    # AI audio chunks
                    model_turn = getattr(sc, "model_turn", None)
                    if model_turn and hasattr(model_turn, "parts"):
                        for part in model_turn.parts:
                            inline = getattr(part, "inline_data", None)
                            if inline and getattr(inline, "data", None):
                                data = inline.data
                                if isinstance(data, bytes):
                                    b64 = base64.b64encode(data).decode("ascii")
                                else:
                                    b64 = base64.b64encode(bytes(data)).decode("ascii")
                                if self.on_audio:
                                    await self.on_audio(b64)

                    # User speech transcript (streaming)
                    interim = getattr(sc, "interim_input_transcription", None)
                    if interim:
                        text = self._extract_text(interim)
                        if text and self.on_transcript:
                            await self.on_transcript(text, "user", False)

                    # User speech transcript (final)
                    input_tx = getattr(sc, "input_transcription", None)
                    if input_tx:
                        text = self._extract_text(input_tx)
                        if text and self.on_transcript:
                            logger.info(f"User said (final): '{text}'")
                            await self.on_transcript(text, "user", True)

                    # AI speech transcript (final)
                    output_tx = getattr(sc, "output_transcription", None)
                    if output_tx:
                        text = self._extract_text(output_tx)
                        if text and self.on_transcript:
                            await self.on_transcript(text, "assistant", True)

                    # Turn complete — fire callback and let while loop restart receive()
                    if getattr(sc, "turn_complete", False):
                        if self.on_turn_ended:
                            await self.on_turn_ended("END_TURN")
                        break  # exit inner for-loop; while loop restarts receive()

            except asyncio.CancelledError:
                return
            except Exception as e:
                if not self.is_closing:
                    logger.error(f"Gemini receive error: {e}")
                    if self.on_error:
                        await self.on_error(f"Gemini Live stream error: {e}")
                return  # fatal error — exit loop

    @staticmethod
    def _extract_text(obj) -> str:
        """Extract text string from a transcription object."""
        text = getattr(obj, "text", "") or ""
        if not text and hasattr(obj, "parts") and obj.parts:
            text = " ".join(
                getattr(p, "text", "") for p in obj.parts if getattr(p, "text", None)
            )
        return text.strip()


# ------------------------------------------------------------------ #
# Engine (manages sessions, implements VoiceEngineInterface)          #
# ------------------------------------------------------------------ #

class GeminiVoiceEngine(VoiceEngineInterface):
    """Manages GeminiVoiceSession instances. One engine per process."""

    def __init__(self):
        self._active_sessions: Dict[str, GeminiVoiceSession] = {}

    @property
    def voice_id(self) -> str:
        return _get_voice_name()

    def is_configured(self) -> bool:
        key = _get_api_key()
        return bool(key and not key.startswith("your_"))

    def get_status(self) -> Dict[str, Any]:
        return {
            "status": "ready" if self.is_configured() else "credentials_needed",
            "provider": "gemini_live",
            "model_id": _get_model(),
            "voice_id": self.voice_id,
            "region": "global",
            "active_streams": len(self._active_sessions),
            "transport": "websocket",
            "turn_detection": "native",
        }

    async def create_session(
        self,
        session_id: str,
        system_prompt: str = "",
        voice_id: Optional[str] = None,
        on_audio=None,
        on_transcript=None,
        on_barge_in=None,
        on_turn_ended=None,
        on_renewed=None,
        on_error=None,
    ) -> GeminiVoiceSession:
        if session_id in self._active_sessions:
            await self._active_sessions[session_id].stop()

        session = GeminiVoiceSession(
            session_id=session_id,
            system_prompt=system_prompt,
            voice_name=voice_id or self.voice_id,
            model=_get_model(),
            on_audio=on_audio,
            on_transcript=on_transcript,
            on_barge_in=on_barge_in,
            on_turn_ended=on_turn_ended,
            on_renewed=on_renewed,
            on_error=on_error,
        )
        self._active_sessions[session_id] = session
        await session.start()
        return session

    def get_session(self, session_id: str) -> Optional[GeminiVoiceSession]:
        return self._active_sessions.get(session_id)

    async def send_audio_chunk(self, session_id: str, base64_audio: str) -> None:
        session = self._active_sessions.get(session_id)
        if session:
            await session.send_audio_chunk(base64_audio)

    async def close_session(self, session_id: str) -> None:
        session = self._active_sessions.pop(session_id, None)
        if session:
            await session.stop()


_gemini_engine: Optional[GeminiVoiceEngine] = None


def get_gemini_voice_engine() -> GeminiVoiceEngine:
    global _gemini_engine
    if _gemini_engine is None:
        _gemini_engine = GeminiVoiceEngine()
    return _gemini_engine
```

- [ ] **Step 3: Verify import and basic structure**

```bash
cd C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent
PYTHONPATH=. backend/venv/Scripts/python -c "
from backend.services.gemini_voice_engine import GeminiVoiceEngine, get_gemini_voice_engine
e = get_gemini_voice_engine()
print('engine:', e.get_status()['provider'])
print('model:', e.get_status()['model_id'])
assert e.get_status()['model_id'] == 'gemini-live-2.5-flash-preview', 'WRONG MODEL'
print('OK')
"
```
Expected output:
```
engine: gemini_live
model: gemini-live-2.5-flash-preview
OK
```

- [ ] **Step 4: Quick live connection test (requires real API key)**

```bash
cd C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent
PYTHONPATH=. backend/venv/Scripts/python -c "
import asyncio
from dotenv import load_dotenv
load_dotenv('backend/.env')
from backend.services.gemini_voice_engine import GeminiVoiceSession

async def test():
    audio_received = []
    transcript_received = []

    session = GeminiVoiceSession(
        session_id='test-001',
        system_prompt='You are a helpful assistant.',
        on_audio=lambda b64: audio_received.append(len(b64)) or asyncio.coroutine(lambda: None)(),
        on_transcript=lambda t, r, f: transcript_received.append((t, r, f)) or asyncio.coroutine(lambda: None)(),
    )
    started = await session.start()
    assert started, 'session.start() returned False'

    connected = await session.wait_until_connected(timeout=8.0)
    assert connected, 'did not connect within 8 seconds'
    print('Connected OK')

    await session.send_text_turn('Say hello in one short sentence.')
    await asyncio.sleep(6)

    print(f'Audio chunks received: {len(audio_received)}')
    print(f'Transcripts received: {len(transcript_received)}')
    assert len(audio_received) > 0, 'NO AUDIO CHUNKS — check model name and API key'
    assert len(transcript_received) > 0, 'NO TRANSCRIPTS'
    print('PASS')
    await session.stop()

asyncio.run(test())
"
```
Expected: `Connected OK`, then `Audio chunks received: N` (N > 0), then `PASS`.

- [ ] **Step 5: Commit**

```bash
cd C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent
git add backend/services/gemini_voice_engine.py backend/.env
git commit -m "feat(voice): rewrite GeminiVoiceSession with persistent async-with task, fix model name"
```

---

### Task 3: Remove Nova Sonic simulation mode

**Files:**
- Modify: `backend/services/nova_sonic_worker.py` — delete simulation methods, fail loudly on missing creds

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `nova_sonic_worker.py` with no simulation/mock code

- [ ] **Step 1: Read the current simulation code locations**

```bash
grep -n "simulated\|_enter_sim\|_send_simulated\|_handle_simulated\|is_simulated" C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent/backend/services/nova_sonic_worker.py
```

Note the line numbers of: `_enter_simulated_mode`, `_send_simulated_greeting`, `_send_simulated_speech`, `_handle_simulated_turn_completion`, and all `is_simulated` references.

- [ ] **Step 2: Edit nova_sonic_worker.py**

Make these changes using a Python script (safest for multi-line edits):

```bash
cd C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent
backend/venv/Scripts/python << 'PYEOF'
import re

path = "backend/services/nova_sonic_worker.py"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()

# 1. Remove is_simulated field from __init__
src = src.replace("        self.is_simulated: bool = False\n", "")

# 2. Replace calls to _enter_simulated_mode with RuntimeError
# Line like: self._enter_simulated_mode(is_renewal)
src = re.sub(
    r"self\._enter_simulated_mode\([^)]*\)",
    'raise RuntimeError("AWS credentials not configured for Nova Sonic. '
    'Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION in .env.")',
    src
)

# 3. Remove the is_simulated guard in audio_chunk handler
# Pattern: if self.is_simulated:\n            return
src = re.sub(
    r"        if self\.is_simulated:\s+return\n",
    "",
    src
)

# 4. Remove _enter_simulated_mode, _send_simulated_speech,
#    _send_simulated_greeting, _handle_simulated_turn_completion methods
#    (they are defined as async def _xxxxx methods)
methods_to_remove = [
    "_enter_simulated_mode",
    "_send_simulated_speech",
    "_send_simulated_greeting",
    "_handle_simulated_turn_completion",
]
for method in methods_to_remove:
    # Match: 4-space indent + def/async def + method name through end of method body
    pattern = rf"    (?:async )?def {method}\(.*?(?=\n    (?:async )?def |\nclass |\Z)"
    src = re.sub(pattern, "", src, flags=re.DOTALL)

with open(path, "w", encoding="utf-8") as f:
    f.write(src)

print("Done. Verify no simulation references remain:")
PYEOF
```

- [ ] **Step 3: Verify no simulation references remain**

```bash
grep -n "simulated\|PROTOCOL TEST\|synthetic\|hardcoded" C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent/backend/services/nova_sonic_worker.py
```
Expected: no output (zero matches).

- [ ] **Step 4: Verify the file is still importable**

```bash
cd C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent
PYTHONPATH=. backend/venv/Scripts/python -c "
import importlib.util, sys
spec = importlib.util.spec_from_file_location('nova_sonic_worker', 'backend/services/nova_sonic_worker.py')
print('Importable OK')
"
```
Expected: `Importable OK`

- [ ] **Step 5: Commit**

```bash
cd C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent
git add backend/services/nova_sonic_worker.py
git commit -m "fix(voice): remove Nova Sonic simulation mode — fail loudly on missing AWS creds"
```

---

### Task 4: Fix speech_api.py initial prompt injection (wait for is_connected)

**Files:**
- Modify: `backend/api/speech_api.py` — lines ~559-573 (initial Gemini prompt block)

**Interfaces:**
- Consumes: `GeminiVoiceSession.wait_until_connected(timeout)` from Task 2
- Consumes: `GeminiVoiceSession.send_text_turn(text)` from Task 2

The current initial prompt block fires **immediately** after `create_session()` returns. But `create_session()` calls `session.start()` which only _spawns_ the background task — the actual `is_connected=True` happens asynchronously a few seconds later when the Gemini API handshake completes. Sending the intro text before `is_connected=True` silently does nothing.

- [ ] **Step 1: Replace the initial prompt block**

Find and replace in `backend/api/speech_api.py`.

Current code (around lines 559-573):
```python
        # Send initial prompt so Gemini starts the interview with voice
        if system_prompt and provider_label == 'gemini':
            try:
                intro_text = "Please introduce yourself as the interviewer and begin the interview. Greet the candidate and ask your first question."
                if session_manager:
                    intro = session_manager.get_interviewer_introduction()
                    if intro:
                        intro_text = f"Say this to the candidate as your opening: {intro}"
                if hasattr(nova_session, "send_realtime_text"):
                    await nova_session.send_realtime_text(intro_text)
                elif hasattr(nova_session, "_live_session") and nova_session._live_session:
                    await nova_session._live_session.send_realtime_input(text=intro_text)
                logger.info("Sent initial prompt to Gemini Live for voice intro")
            except Exception as e:
                logger.warning(f"Could not send initial Gemini prompt: {e}")
```

Replace with:
```python
        # Wait for Gemini Live to connect, then send opening prompt so AI starts speaking
        if provider_label == 'gemini' and hasattr(nova_session, 'wait_until_connected'):
            connected = await nova_session.wait_until_connected(timeout=8.0)
            if connected and system_prompt:
                try:
                    intro = None
                    if session_manager and hasattr(session_manager, 'get_interviewer_introduction'):
                        intro = session_manager.get_interviewer_introduction()
                    if intro:
                        opening = f"Begin the interview. Open with exactly this greeting: {intro}"
                    else:
                        opening = "Begin the interview. Greet the candidate warmly and ask your first question."
                    await nova_session.send_text_turn(opening)
                    logger.info(f"Sent opening prompt to Gemini Live: session={session_id}")
                except Exception as e:
                    logger.warning(f"Could not send Gemini opening prompt: {e}")
            elif not connected:
                logger.warning(f"Gemini session {session_id} not connected — skipping opening prompt")
```

Apply this change with a Python script:

```bash
cd C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent
backend/venv/Scripts/python << 'PYEOF'
path = "backend/api/speech_api.py"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()

old = """        # Send initial prompt so Gemini starts the interview with voice
        if system_prompt and provider_label == 'gemini':
            try:
                intro_text = "Please introduce yourself as the interviewer and begin the interview. Greet the candidate and ask your first question."
                if session_manager:
                    intro = session_manager.get_interviewer_introduction()
                    if intro:
                        intro_text = f"Say this to the candidate as your opening: {intro}"
                if hasattr(nova_session, "send_realtime_text"):
                    await nova_session.send_realtime_text(intro_text)
                elif hasattr(nova_session, "_live_session") and nova_session._live_session:
                    await nova_session._live_session.send_realtime_input(text=intro_text)
                logger.info("Sent initial prompt to Gemini Live for voice intro")
            except Exception as e:
                logger.warning(f"Could not send initial Gemini prompt: {e}")"""

new = """        # Wait for Gemini Live to connect, then send opening prompt so AI starts speaking
        if provider_label == 'gemini' and hasattr(nova_session, 'wait_until_connected'):
            connected = await nova_session.wait_until_connected(timeout=8.0)
            if connected and system_prompt:
                try:
                    intro = None
                    if session_manager and hasattr(session_manager, 'get_interviewer_introduction'):
                        intro = session_manager.get_interviewer_introduction()
                    if intro:
                        opening = f"Begin the interview. Open with exactly this greeting: {intro}"
                    else:
                        opening = "Begin the interview. Greet the candidate warmly and ask your first question."
                    await nova_session.send_text_turn(opening)
                    logger.info(f"Sent opening prompt to Gemini Live: session={session_id}")
                except Exception as e:
                    logger.warning(f"Could not send Gemini opening prompt: {e}")
            elif not connected:
                logger.warning(f"Gemini session {session_id} not connected — skipping opening prompt")"""

if old in src:
    src = src.replace(old, new)
    with open(path, "w", encoding="utf-8") as f:
        f.write(src)
    print("Replaced OK")
else:
    print("ERROR: old block not found — check indentation or line endings")
PYEOF
```

Expected: `Replaced OK`

- [ ] **Step 2: Verify speech_api.py still imports cleanly**

```bash
cd C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent
PYTHONPATH=. backend/venv/Scripts/python -c "
from backend.api.speech_api import router
print('speech_api imports OK')
"
```
Expected: `speech_api imports OK`

- [ ] **Step 3: End-to-end manual test**

Start the backend:
```bash
cd C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent/backend
./venv/Scripts/python -m uvicorn main:app --port 8000
```

Start the frontend:
```bash
cd C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent/frontend
npx vite --port 8080
```

Open http://localhost:8080, select Software Engineer role, click Start Interview Practice, click Understood. 

Expected console logs in backend terminal (in order):
1. `Gemini Live session task spawned: <session_id>`
2. `Gemini Live connected: session=<id> model=gemini-live-2.5-flash-preview voice=Aoede`
3. `Sent opening prompt to Gemini Live: session=<id>`
4. `User said (final): Hello` (after you speak)

Expected browser behaviour:
- AI speaks the interview greeting within ~3 seconds of clicking Understood
- Speaking into microphone produces transcript in chat stream
- AI responds with voice after each user turn

- [ ] **Step 4: Commit**

```bash
cd C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent
git add backend/api/speech_api.py
git commit -m "fix(voice): wait for Gemini is_connected before sending opening prompt"
```

# Gemini Voice Clean Architecture — Design Spec

## Goal
Fix the interview agent voice pipeline so Gemini Live (gemini-live-2.5-flash-preview) works correctly end-to-end: session starts, AI speaks through audio, user speech is transcribed, turns are managed properly. Remove Nova Sonic simulation/mock mode. Keep both engines in separate clean files so toggling is one env var.

## Root Causes of Current Breakage

1. **Wrong model name**: `.env` has `gemini-3.8-live` (does not exist). Correct: `gemini-live-2.5-flash-preview`
2. **Broken async context manager**: `start()`/`stop()` manually call `__aenter__`/`__aexit__` — fragile, breaks on exit. Correct pattern: persistent background task holding `async with` open.
3. **Receive loop exits after one turn**: `async for msg in session.receive()` completes after turn_complete. Needs `while not is_closing:` wrapper to restart after each turn.
4. **Nova Sonic simulation mode**: When AWS creds missing, `nova_sonic_worker.py` silently emits fake hardcoded audio/transcripts instead of failing loudly.

## Files Changed

### Full rewrite
- `backend/services/gemini_voice_engine.py` — persistent task pattern, correct model
- `backend/.env` — model name only

### Add
- `backend/services/voice_engine_interface.py` — abstract base class

### Small edits
- `backend/services/nova_sonic_worker.py` — remove simulation mode
- `backend/api/speech_api.py` — wait for is_connected before sending intro prompt

### Untouched
- `backend/agents/orchestrator.py` — text LLM call is real
- `backend/agents/agentic_coach.py` — error fallbacks are acceptable
- `backend/api/agent_api.py`
- All frontend files

## GeminiVoiceSession: Persistent Background Task Pattern

```
start()
  creates asyncio.Task(_session_task)  <- non-blocking

_session_task()
  async with client.aio.live.connect(model, config) as session:
    self._live_session = session
    self.is_connected = True
    await self._receive_loop()   <- runs until is_closing=True

_receive_loop()
  while not self.is_closing:
    async for msg in self._live_session.receive():
      handle audio  -> on_audio(base64)
      handle transcript -> on_transcript(text, role, is_final)
      handle turn_complete -> on_turn_ended(reason)
      handle interrupted -> on_barge_in()
    # receive() exits after turn_complete — while loop restarts it

stop()
  self.is_closing = True
  cancel and await _session_task
  self.is_connected = False
```

## Gemini Live Config (correct)

```python
LiveConnectConfig(
    response_modalities=["AUDIO"],        # AUDIO only — TEXT not supported on this model
    system_instruction=Content(parts=[Part(text=system_prompt)]),
    speech_config=SpeechConfig(
        voice_config=VoiceConfig(
            prebuilt_voice_config=PrebuiltVoiceConfig(voice_name=voice_name)
        )
    ),
    input_audio_transcription=AudioTranscriptionConfig(),
    output_audio_transcription=AudioTranscriptionConfig(),
)
```

## VoiceEngineInterface (abstract base)

```python
class VoiceEngineInterface(ABC):
    async def create_session(session_id, system_prompt, voice_id, callbacks...) -> Session
    async def close_session(session_id) -> None
    async def send_audio_chunk(session_id, base64_audio) -> None
    def get_status() -> dict
    @property is_configured -> bool
```

Both `GeminiVoiceEngine` and `NovaSonicVoiceEngine` implement this. `speech_api.py` uses the interface — no if/else inside the handler.

## Nova Sonic Simulation Removal

In `nova_sonic_worker.py`:
- Delete `_enter_simulated_mode()` entirely
- Delete `_simulate_interview_turn()` entirely
- Delete all hardcoded greeting/candidate/interviewer strings
- On missing AWS creds: raise `RuntimeError("AWS credentials not configured. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION.")` instead

## Initial Prompt Injection in speech_api.py

```python
# Wait for Gemini session to connect (max 5s)
if VOICE_PROVIDER == 'gemini':
    for _ in range(50):
        if nova_session.is_connected: break
        await asyncio.sleep(0.1)
    if nova_session.is_connected and system_prompt:
        intro = session_manager.get_interviewer_introduction() if session_manager else None
        prompt = f"Begin the interview. Open with: {intro}" if intro else "Begin the interview."
        await nova_session.send_text_turn(prompt)
```

`send_text_turn(text)` is a new method on GeminiVoiceSession:
```python
async def send_text_turn(self, text: str):
    if not self.is_connected or not self._live_session: return
    await self._live_session.send_client_content(
        turns=types.Content(parts=[types.Part(text=text)])
    )
```

## .env Fix

```
GEMINI_VOICE_MODEL=gemini-live-2.5-flash-preview
```

## Success Criteria
1. Interview starts → Gemini Live WebSocket connects
2. AI speaks intro greeting as audio within 3s
3. User speaks → transcript appears, Gemini responds with audio
4. Session runs full duration without dropping
5. No simulated/hardcoded audio or transcripts ever reach frontend
6. Setting `VOICE_PROVIDER=nova` (with real AWS creds) uses Nova Sonic, no simulation

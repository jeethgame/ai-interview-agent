# VOICE ARCHITECTURE QUESTIONS

> Questions that cannot responsibly be answered without an architectural or product decision.
> These are derived from code analysis — not generic software engineering questions.

---

## Provider Strategy

### 1. Is Nova Sonic or Gemini Live the primary voice provider?

Both are fully implemented. The system defaults to Nova Sonic, but Gemini is wired in identically. The answer determines:
- Which provider gets production hardening
- Whether the simulation/fallback mode in Nova Sonic is acceptable
- Whether the `VOICE_PROVIDER` env var approach is permanent

### 2. Should we implement provider fallback (Nova → Gemini or vice versa)?

Currently: Nova Sonic silently degrades to synthetic sine tones. Gemini hard-fails. Neither falls back to the other. The answer determines:
- Session recovery architecture
- Whether provider connections should be pre-warmed
- Whether the system needs provider health checking

### 3. Should the Nova Sonic simulation mode be removed?

When AWS credentials are missing/invalid, the worker generates fake interview audio and hardcoded transcripts. This masks real failures in production. The answer determines whether to fail fast or maintain the testing convenience.

---

## Audio Architecture

### 4. What is the Gemini Live output audio sample rate?

The `StreamingAudioPlayer` hardcodes 24kHz. Nova Sonic explicitly outputs 24kHz. Gemini's output rate is **not specified in the code**. If it differs from 24kHz, audio will play at the wrong speed. This must be verified from the Gemini API specification.

### 5. Should we replace `ScriptProcessorNode` with `AudioWorkletNode`?

`ScriptProcessorNode` is deprecated. It works today but may be removed from browsers. The answer determines:
- Complexity of the recording pipeline
- Whether to invest in AudioWorklet architecture now or defer
- Target browser compatibility matrix

### 6. Should the browser or the backend perform Voice Activity Detection (VAD)?

Currently: browser does RMS-based echo gating only; provider does turn detection. True VAD (send audio only when speaking) could:
- Reduce bandwidth usage
- Improve turn detection accuracy
- But adds complexity and potential false negatives

---

## Reliability

### 7. Should the voice WebSocket reconnect automatically?

Currently: no reconnection. Network glitch = interview lost. The answer determines:
- Whether session state must be serializable for recovery
- Whether the provider connection can be resumed
- UX design for reconnection state

### 8. Should voice sessions survive backend restart?

Currently: in-memory session state is lost on restart. The answer determines:
- Whether session state must be persistable mid-stream
- Whether the provider connection architecture needs to change
- Recovery UX

### 9. What is the maximum acceptable 8-minute renewal gap (Nova Sonic)?

Nova Sonic streams must be renewed every 8 minutes. During renewal, audio may be interrupted. The answer determines:
- Whether renewal overlap is needed (open new stream before closing old)
- User notification during renewal
- Whether to prefer Gemini to avoid this issue entirely

---

## Scale & Operations

### 10. What maximum concurrent voice sessions do we target?

Each Nova Sonic session spawns a subprocess. Each Gemini session opens a WebSocket. No limits exist. The answer determines:
- Server sizing
- Whether connection pooling is needed
- Whether a session queue/waiting room is needed
- Provider quota planning

### 11. What latency target do we want?

Zero instrumentation exists. Cannot optimize without a target. The answer determines:
- Which latency segments to prioritize
- Whether to invest in client-side or server-side optimization
- Provider selection (if one is significantly faster)

### 12. Should voice sessions require authentication?

Currently: WebSocket auth is optional. Anonymous users can consume provider API resources. The answer determines:
- Whether rate limiting is needed for anonymous users
- Cost exposure risk
- Whether to add auth enforcement before or after other improvements

---

## User Experience

### 13. How should the system handle the post-barge-in audio race condition?

Audio chunks in the WebSocket pipeline arrive after the user interrupts, causing brief AI speech playback after stop. Options:
- Accept the brief glitch (simplest)
- Add a barge-in guard window
- Implement sequence-based audio drop
The answer affects perceived interruption responsiveness.

### 14. Should the client-side barge-in threshold be configurable?

The RMS threshold (0.035) and consecutive frame count (2) are hardcoded. Different microphones, environments, and echo cancellation implementations may require different thresholds. The answer determines whether these should be tunable or fixed.

### 15. What should happen when the interview timer hits 0:00?

Currently: `onEndInterview()` fires immediately. But audio may still be playing/streaming. The answer determines:
- Whether to wait for current AI speech to finish
- Whether to send a final turn signal to the provider
- How to handle the edge case of user speaking when time expires

---

## Code Quality

### 16. Should dead code paths be removed?

The following are present but unused in the real-time voice flow:
- Amazon Polly TTS (`tts_service.py`) — disabled via early return in hook
- AssemblyAI batch STT (`speech_api.py` L116–L201) — separate from streaming
- Deepgram references (`websocket_processor.py`) — handler module doesn't exist
- `MediaRecorder` fallback (`api.ts` L348–L366) — sends incompatible format

The answer determines whether to clean up now (reducing surface area) or keep for future use.

### 17. Should the voice configuration use `arjun` or `matthew`?

`NOVA_SONIC_VOICE_ID` defaults to `arjun`, but the worker's validation list doesn't include `arjun`, silently falling back to `matthew`. Need to verify:
- Is `arjun` a valid Nova Sonic voice?
- If so, add it to validation list
- If not, change the default

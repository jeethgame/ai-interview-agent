# VOICE CURRENT STATE — Complete Reverse-Engineering

> Traced from source code on 2026-09-25. No assumptions. Every claim derived from code.

---

## PART 1 — COMPLETE VOICE PATH TRACE

### Stage 1: Microphone Capture

| Property | Value |
|---|---|
| **File** | [`api.ts`](file:///C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent/frontend/src/services/api.ts) — `StreamingSpeechRecognition.start()` (L103–L124) |
| **API** | `navigator.mediaDevices.getUserMedia()` |
| **Constraints** | `echoCancellation: true`, `noiseSuppression: true`, `autoGainControl: true` |
| **Output** | `MediaStream` stored in `this.mediaStream` |
| **Sample Rate** | Browser native (typically 44,100 Hz or 48,000 Hz) — **NOT** controlled by the application |
| **Channels** | 1 (mono — `createScriptProcessor(bufferSize, 1, 1)`) |
| **Error Handling** | Rejects Promise; `useVoiceFirstInterview` catches and shows toast |

### Stage 2: Audio Processing & Echo Gating

| Property | Value |
|---|---|
| **File** | [`api.ts`](file:///C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent/frontend/src/services/api.ts) — `startRecording()` (L280–L367) |
| **API** | `ScriptProcessorNode` (deprecated Web Audio API) |
| **Buffer Size** | `sampleRate > 32000 ? 4096 : 2048` samples |
| **Processing** | Per-frame RMS energy calculation |
| **Echo Gating Logic** | If `isAiSpeaking` or within 200ms cooldown after AI stops: audio frames with RMS < 0.035 are **dropped** (not sent). Frames with RMS ≥ 0.035 for ≥ 2 consecutive frames trigger **barge-in** |
| **Barge-in Threshold** | `BARGE_IN_RMS_THRESHOLD = 0.035` |
| **Consecutive Frames Required** | 2 |
| **Cooldown Period** | 200ms after `lastAiSpeechEndTime` |
| **Zero-Gain Routing** | Mic → processor → `silentGain(gain=0)` → destination. Prevents local playback |

### Stage 3: Resampling & Encoding

| Property | Value |
|---|---|
| **File** | [`api.ts`](file:///C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent/frontend/src/services/api.ts) — `resampleTo16kHz()` (L253–L278) |
| **Algorithm** | Linear interpolation resampling |
| **Input** | `Float32Array` at native sample rate (e.g., 48kHz) |
| **Output** | `Int16Array` at 16,000 Hz |
| **Quantization** | `s < 0 ? s * 0x8000 : s * 0x7FFF` (asymmetric Int16 mapping) |
| **Clamping** | `Math.max(-1, Math.min(1, value))` |
| **Bytes per Sample** | 2 (16-bit signed integers, little-endian per platform) |

### Stage 4: WebSocket Client → Server

| Property | Value |
|---|---|
| **File** | [`api.ts`](file:///C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent/frontend/src/services/api.ts) L336 |
| **Transport** | `this.ws.send(pcm16.buffer)` — **raw binary ArrayBuffer** |
| **No JSON wrapping** | Audio sent as binary WebSocket frames, **not** base64 JSON |
| **Chunk size** | Variable: depends on buffer size and resample ratio. At 48kHz→16kHz with 4096-sample buffer: ~1365 samples × 2 bytes = ~2,730 bytes. At 44.1kHz→16kHz with 4096: ~1,482 samples × 2 bytes = ~2,964 bytes |
| **Chunk duration** | ~85ms (4096/48000) to ~93ms (4096/44100) of captured audio → produces ~85ms of 16kHz audio |
| **Timing** | Fires every `ScriptProcessorNode` `onaudioprocess` event (buffer-driven, not interval-driven) |

### Stage 5: Backend WebSocket Endpoint

| Property | Value |
|---|---|
| **File** | [`speech_api.py`](file:///C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent/backend/api/speech_api.py) — `_handle_nova_sonic_stream()` (L435–L604) |
| **Endpoints** | `WS /api/speech-to-text/stream` (L606) and `WS /api/voice/nova-sonic/stream` (L615) — both route to same handler |
| **Binary handling** | `msg["bytes"]` → `base64.b64encode(msg["bytes"]).decode("ascii")` (L581) |
| **JSON handling** | `msg["text"]` → parses JSON, extracts `type: "audio"` → `parsed["data"]` passed as base64 |
| **Also handles** | `type: "renew"` → `nova_session.renew_connection()`, `type: "stop"` → break |
| **Authentication** | Optional JWT token via query param `?token=` (L609) |
| **Session linking** | Optional `?session_id=` query param (L610) |

### Stage 6: Voice Provider — Nova Sonic Path

| Property | Value |
|---|---|
| **File** | [`nova_sonic_engine.py`](file:///C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent/backend/services/nova_sonic_engine.py) → [`nova_sonic_worker.py`](file:///C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent/backend/services/nova_sonic_worker.py) |
| **IPC** | stdin/stdout JSON lines between FastAPI process and Python 3.13 subprocess |
| **Audio forward** | `{"action": "audio", "data": "<base64_pcm>"}` written to worker stdin |
| **Worker sends to Bedrock** | `audioInput` event containing base64 PCM via HTTP/2 bidirectional stream |
| **Bedrock input config** | `audio/lpcm`, 16kHz, 16-bit, 1 channel, base64 encoding |
| **Bedrock output config** | `audio/lpcm`, 24kHz, 16-bit, 1 channel, base64 encoding |
| **Model** | `amazon.nova-2-sonic-v1:0` |
| **Voice** | Default `arjun`; validated against `matthew, tiffany, amy, florian, ambre, beatrice, lorenzo, greta, lupe, carlos` |
| **Connection limit** | 8 minutes hard limit; auto-renewal at 7.5 minutes (450s) |
| **Inference params** | `maxTokens: 1024`, `topP: 0.9`, `temperature: 0.7` |

### Stage 6b: Voice Provider — Gemini Live Path

| Property | Value |
|---|---|
| **File** | [`gemini_voice_engine.py`](file:///C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent/backend/services/gemini_voice_engine.py) |
| **SDK** | `google-genai` — `client.aio.live.connect()` |
| **Audio send** | `base64.b64decode(base64_audio)` → `send_realtime_input(audio=types.Blob(data=raw_bytes, mime_type="audio/pcm;rate=16000"))` |
| **Output modalities** | `["AUDIO"]` |
| **Model** | `gemini-3.8-live` (env: `GEMINI_VOICE_MODEL`) |
| **Voice** | `Aoede` (env: `GEMINI_VOICE_NAME`) |
| **Transcription** | Both `input_audio_transcription` and `output_audio_transcription` enabled via `AudioTranscriptionConfig()` |
| **Connection renewal** | No-op (Gemini manages its own session) |
| **Turn detection** | Native: `server_content.turn_complete`, `server_content.interrupted` |

### Stage 7: AI Model Output → Backend

| Property | Value |
|---|---|
| **Nova Sonic** | Worker emits `{"type": "audio", "data": "<base64_24khz_pcm>"}` via stdout |
| **Gemini** | `_receive_loop()` extracts `part.inline_data.data` → `base64.b64encode()` |
| **Transcripts** | Both providers emit `{"type": "transcript", "text": "...", "role": "user|assistant", "is_final": bool}` |
| **Barge-in** | Nova: `stopReason == "INTERRUPTED"` → `{"type": "barge_in"}`. Gemini: `server_content.interrupted == True` |
| **Turn end** | Both emit `{"type": "turn_ended", "stop_reason": "END_TURN"}` |

### Stage 8: Backend → WebSocket → Browser

| Property | Value |
|---|---|
| **File** | [`speech_api.py`](file:///C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent/backend/api/speech_api.py) — callbacks (L484–L537) |
| **Transport** | `websocket.send_json(...)` — JSON text frames |
| **Audio message** | `{"type": "audio", "data": "<base64_pcm_24khz>"}` |
| **Transcript message** | `{"type": "transcript", "text": "...", "role": "user|assistant", "is_final": bool}` |
| **Barge-in message** | `{"type": "barge_in", "message": "User interruption detected"}` |
| **Turn ended message** | `{"type": "turn_ended", "stop_reason": "END_TURN"}` |
| **Interview ending** | `{"type": "interview_ending", "state": {...}}` (triggered by `session_manager.record_voice_turn()`) |
| **Error message** | `{"type": "error", "error": "..."}` |
| **Connected message** | `{"type": "connected", "engine": "nova|gemini", "voice_id": "...", "session_id": "..."}` |

### Stage 9: Browser Audio Playback

| Property | Value |
|---|---|
| **File** | [`streamingAudioPlayer.ts`](file:///C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent/frontend/src/utils/streamingAudioPlayer.ts) |
| **API** | Web Audio API — `AudioContext`, `AudioBufferSourceNode` |
| **Context sample rate** | **24,000 Hz** (`new AudioCtx({ sampleRate: 24000 })`) |
| **Input** | Base64 string → `atob()` → `Uint8Array` → `Int16Array` → `Float32Array` (÷ 32768.0) |
| **Buffer creation** | `audioContext.createBuffer(1, float32.length, 24000)` — mono, 24kHz |
| **Scheduling** | Gapless: `startTime = max(currentTime, nextPlayTime)`, then `nextPlayTime = startTime + duration` |
| **Playback** | `source.connect(audioContext.destination)` → `source.start(startTime)` |
| **Barge-in cutoff** | `stop()`: iterates all `activeSources`, calls `source.stop()` and `source.disconnect()` immediately |
| **State tracking** | `isPlaying` flag, `activeSources[]` array, `onPlaybackStateChange` callback |

### Stage 10: Voice Activity Detection (Separate from Recording)

| Property | Value |
|---|---|
| **File** | [`useVoiceFirstInterview.ts`](file:///C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent/frontend/src/hooks/useVoiceFirstInterview.ts) — `setupVoiceActivityDetection()` (L103–L164) |
| **API** | Separate `AudioContext` + `AnalyserNode` (fftSize=256) |
| **Data** | `getByteFrequencyData()` → average of 128 frequency bins |
| **Normalization** | `average / 128`, clamped to [0, 1] |
| **Detection threshold** | `normalizedVolume > 0.1` sets `voiceActivity.isDetected = true` |
| **Update rate** | `requestAnimationFrame` loop (~60fps) |
| **Purpose** | Drives `CockpitAudioWave` WebGL visualization glow intensity |

---

## PART 2 — AUDIO DATA

### What the Application Sends (Microphone → Network)

```
Microphone
  → MediaStream (native rate, typically 44.1kHz or 48kHz)
  → ScriptProcessorNode (buffer: 2048 or 4096 samples)
  → Float32Array (native rate, mono)
  → RMS energy check (echo gating)
  → Linear interpolation resampling to 16kHz
  → Int16Array quantization (16-bit signed PCM)
  → WebSocket.send(pcm16.buffer)  ← RAW BINARY ArrayBuffer
```

**Exact format sent over WebSocket (client → server):**
- **Format**: Raw 16-bit signed integer linear PCM
- **Sample rate**: 16,000 Hz
- **Channels**: 1 (mono)
- **Bytes per sample**: 2
- **Endianness**: Platform-native (little-endian on x86/ARM)
- **Chunk duration**: ~85ms–93ms (varies by browser native sample rate)
- **Chunk size**: ~2,730–2,964 bytes
- **WebSocket frame type**: Binary

**Backend re-encodes for provider:**
- Nova Sonic: Binary → `base64.b64encode()` → JSON stdin to subprocess
- Gemini: Binary → `base64.b64encode()` → `base64.b64decode()` → raw bytes → `Blob(data=, mime_type="audio/pcm;rate=16000")`

### What the Application Receives (Network → Speaker)

```
Provider (Nova Sonic / Gemini)
  → 24kHz 16-bit mono linear PCM
  → Base64 encoded string
  → JSON: {"type": "audio", "data": "<base64>"}
  → WebSocket text frame to browser
  → atob() → Uint8Array → Int16Array → Float32Array (÷ 32768.0)
  → AudioBuffer (24kHz, mono)
  → AudioBufferSourceNode.start(scheduledTime)
  → AudioContext.destination (speakers)
```

**Exact format received over WebSocket (server → client):**
- **Format**: Base64-encoded 16-bit signed integer linear PCM
- **Sample rate**: 24,000 Hz
- **Channels**: 1 (mono)
- **Bytes per sample**: 2 (before base64 expansion)
- **WebSocket frame type**: Text (JSON)
- **Chunk size**: Variable (provider-determined)

### Summary: The system does NOT send

- ❌ Encoded audio (no Opus, no AAC, no WebM, no MP3 over WebSocket)
- ❌ Vectors, tensors, or embeddings
- ❌ JSON-wrapped audio on the uplink (raw binary only)
- ✅ Raw 16-bit signed integer linear PCM byte buffers (uplink)
- ✅ Base64-encoded 16-bit signed integer linear PCM in JSON (downlink)

---

## PART 4 — VOICE PROVIDERS

### Provider 1: Amazon Nova 2 Sonic

| Property | Value |
|---|---|
| **API Type** | HTTP/2 Bidirectional Event Stream (Bedrock Runtime) |
| **SDK** | `aws-sdk-bedrock-runtime` + `awscrt` (CRT HTTP/2) |
| **Model ID** | `amazon.nova-2-sonic-v1:0` |
| **Endpoint** | Amazon Bedrock (region-based, default `us-east-1`) |
| **Authentication** | AWS Access Key + Secret Key |
| **Transport** | Subprocess (`py -3.13 nova_sonic_worker.py`) communicating via stdio JSON lines |
| **Input format** | `audio/lpcm`, 16kHz, 16-bit, mono, base64 |
| **Output format** | `audio/lpcm`, 24kHz, 16-bit, mono, base64 |
| **Turn detection** | Native bidirectional (provider-owned) |
| **Interruption** | `stopReason: "INTERRUPTED"` emitted by provider |
| **Connection limit** | 8-minute hard limit; auto-renewed at 7.5 minutes |
| **Supported voices** | matthew, tiffany, amy, florian, ambre, beatrice, lorenzo, greta, lupe, carlos |
| **Default voice** | `arjun` (but falls back to `matthew` since `arjun` is not in the validation list) |
| **Fallback mode** | Simulated: generates synthetic sine tones and hardcoded interview dialogue |
| **Rate limits** | UNKNOWN — REQUIRES VERIFICATION (not documented in repo) |

### Provider 2: Google Gemini Live

| Property | Value |
|---|---|
| **API Type** | WebSocket (Gemini Live API) |
| **SDK** | `google-genai` (Python) |
| **Model ID** | `gemini-3.8-live` (env: `GEMINI_VOICE_MODEL`) |
| **Endpoint** | Google Gemini Live API (global) |
| **Authentication** | API Key (`GEMINI_VOICE_API_KEY`) |
| **Transport** | In-process async (no subprocess) |
| **Input format** | Raw PCM bytes, `audio/pcm;rate=16000` |
| **Output format** | Raw audio bytes (base64 encoded to client) — UNKNOWN — REQUIRES VERIFICATION (sample rate not explicitly specified in receive code; assumed 24kHz based on `StreamingAudioPlayer` expecting 24kHz) |
| **Turn detection** | Native (`server_content.turn_complete`) |
| **Interruption** | `server_content.interrupted = true` |
| **Connection limit** | Managed by Google (no manual renewal) |
| **Voice** | `Aoede` (default) |
| **Transcription** | Server-side: both input and output audio transcription enabled |
| **Special feature** | Initial text prompt sent to trigger interviewer greeting voice |
| **Rate limits** | UNKNOWN — REQUIRES VERIFICATION |

### Provider 3: Amazon Polly (TTS only — legacy/fallback)

| Property | Value |
|---|---|
| **File** | [`tts_service.py`](file:///C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent/backend/api/speech/tts_service.py) |
| **API Type** | HTTP REST (boto3 `synthesize_speech`) |
| **Output format** | MP3 (`audio/mpeg`) |
| **Voice** | `Patrick` (env: `POLLY_DEFAULT_VOICE`) |
| **Engine** | `long-form` (env: `POLLY_ENGINE`) |
| **Usage** | Called via `POST /api/text-to-speech` — **currently disabled in voice-first flow** (auto-TTS `useEffect` has early `return` at line 525) |
| **Rate limiting** | Integrated with `RateLimiter` (acquire/release pattern) |
| **Caching** | In-memory MD5-keyed cache for short common phrases (max 50 items) |

### Provider 4: AssemblyAI (STT only — batch, non-streaming)

| Property | Value |
|---|---|
| **File** | [`speech_api.py`](file:///C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent/backend/api/speech_api.py) L116–L201 |
| **API Type** | HTTP REST (upload + poll) |
| **Usage** | `POST /api/speech-to-text` — batch file upload transcription |
| **Not used** | in the real-time voice streaming path |

### Provider 5: Deepgram (Legacy — referenced but not wired)

| Property | Value |
|---|---|
| **File** | [`websocket_processor.py`](file:///C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent/backend/api/speech/websocket_processor.py) |
| **Status** | References `DeepgramEventHandlers` and `deepgram_connection.send()` but the `deepgram_handlers.py` module does **not exist** in the codebase. This is **dead code** from a previous architecture |

---

## PART 8 — CURRENT ARCHITECTURAL ASSUMPTIONS

Derived from code only:

1. **One WebSocket per interview** — The frontend creates a single `StreamingSpeechRecognition` instance per session via `startVoiceRecognition()`; stopping it closes the WebSocket
2. **One provider connection per WebSocket** — `_handle_nova_sonic_stream` creates one `engine.create_session()` per WebSocket connection
3. **Server maintains session state** — `ThreadSafeSessionRegistry` holds `AgentSessionManager` objects in-memory, serialized to Supabase on mutation
4. **Browser owns audio buffering** — `StreamingAudioPlayer` manages its own `AudioBufferSourceNode` queue; server has no knowledge of playback state
5. **Provider owns turn detection** — Both Nova Sonic and Gemini perform server-side turn detection; the backend does NOT implement VAD
6. **Client performs echo gating** — RMS-based acoustic echo suppression is entirely in `StreamingSpeechRecognition.startRecording()`
7. **Client performs barge-in detection (client-side)** — 2-consecutive-frame RMS threshold triggers `onBargeIn()` locally, which stops playback. Provider may independently detect interruption server-side
8. **Audio is streamed continuously per-frame** — No accumulation; each `onaudioprocess` event sends immediately (unless gated)
9. **The voice engine subprocess (Nova Sonic) runs on Python 3.13** while the FastAPI app runs on the system Python — separate Python runtimes
10. **VOICE_PROVIDER is set once per process** — No per-session provider selection; env var `VOICE_PROVIDER` selects globally
11. **No reconnect logic exists** — `maxReconnectAttempts = 3` is declared but never used; `reconnectAttempts` is reset on connect but no reconnect code exists
12. **Manual stop sends accumulated transcript** — When user manually stops mic, `stopVoiceRecognition()` combines `accumulatedTranscript + currentInterimText` and sends via `onSendMessage()`
13. **Auto-TTS is disabled** — The `useEffect` for auto-TTS has an early `return` at line 525, with comment: "Gemini Live handles speech-to-speech natively"
14. **Session system prompt is injected at stream start** — Retrieved from `session_manager.get_interviewer_system_prompt()` and passed to provider at creation
15. **8-minute renewal is automatic for Nova Sonic** — Worker checks elapsed time on each audio chunk and self-renews with conversation context preservation
16. **Interview ending is signal-driven** — `session_manager.record_voice_turn()` returns `should_end` flag → backend sends `interview_ending` event → frontend waits 2500ms then calls `onEndInterview()`

# VOICE WebSocket FLOW

> Complete WebSocket protocol trace derived from source code.

---

## Connection Establishment

```mermaid
sequenceDiagram
    participant Browser
    participant FastAPI
    participant Engine
    participant Provider

    Browser->>FastAPI: WS UPGRADE /api/speech-to-text/stream?session_id=X&token=Y
    FastAPI->>FastAPI: websocket.accept()
    FastAPI->>FastAPI: validate_websocket_token(token) [optional]
    FastAPI->>FastAPI: db_manager.create_speech_task(session_id, "nova_sonic_stream")
    FastAPI->>FastAPI: session_registry.get_session_manager(session_id)
    FastAPI->>FastAPI: session_manager.get_interviewer_system_prompt()
    FastAPI->>Engine: engine.create_session(session_id, system_prompt, callbacks)
    Engine->>Provider: Open provider connection (subprocess / Gemini Live)
    Provider-->>Engine: Connection ready
    Engine-->>FastAPI: NovaSonicSession / GeminiVoiceSession
    FastAPI->>Browser: {"type": "connected", "engine": "nova|gemini", "voice_id": "...", "session_id": "..."}
    Note over Browser: onConnected() fires → microphoneActive=true → starts VAD
```

### Connection Details

| Property | Value |
|---|---|
| **URL** | `ws://<host>:8000/api/speech-to-text/stream` (primary) or `/api/voice/nova-sonic/stream` (alias) |
| **Query Params** | `session_id` (optional), `token` (optional JWT) |
| **Handshake** | Standard WebSocket upgrade; no custom headers during handshake |
| **Authentication** | JWT token validated via `validate_websocket_token()` — decodes with `SUPABASE_JWT_SECRET`, checks expiry, retrieves user from DB. **Optional**: connection proceeds even if token is absent or invalid |
| **Binary Type** | Client sets `ws.binaryType = 'arraybuffer'` |

---

## Message Types

### CLIENT → SERVER Messages

| # | Format | Event / Type | Payload Schema | Purpose |
|---|---|---|---|---|
| 1 | **Binary** | *(raw PCM)* | `ArrayBuffer` containing Int16 samples at 16kHz mono | Stream microphone audio to voice provider |
| 2 | **JSON** | `"audio"` | `{"type": "audio", "data": "<base64_pcm>"}` | Alternative audio transport (not primary path) |
| 3 | **JSON** | `"renew"` | `{"type": "renew"}` | Request 8-minute Nova Sonic connection renewal |
| 4 | **JSON** | `"stop"` | `{"type": "stop"}` | Clean shutdown of voice session |

### SERVER → CLIENT Messages

| # | Type | Payload Schema | Purpose |
|---|---|---|---|
| 1 | `"connected"` | `{"type": "connected", "engine": "nova\|gemini", "voice_id": string, "session_id": string}` | Confirm connection established |
| 2 | `"audio"` | `{"type": "audio", "data": "<base64_24khz_pcm>"}` | Stream AI speech audio chunk |
| 3 | `"transcript"` | `{"type": "transcript", "text": string, "role": "user\|assistant", "is_final": boolean}` | Real-time speech transcript |
| 4 | `"barge_in"` | `{"type": "barge_in", "message": "User interruption detected"}` | AI speech interrupted by user |
| 5 | `"turn_ended"` | `{"type": "turn_ended", "stop_reason": "END_TURN"}` | AI turn completed |
| 6 | `"renewed"` | `{"type": "renewed", "message": "Nova Sonic connection renewed successfully."}` | Connection renewed (Nova Sonic only) |
| 7 | `"error"` | `{"type": "error", "error": string}` | Error notification |
| 8 | `"interview_ending"` | `{"type": "interview_ending", "state": object}` | Interview should conclude |

---

## Full Session Flow

```mermaid
sequenceDiagram
    participant Mic as Browser Mic
    participant SSR as StreamingSpeechRecognition
    participant WS as WebSocket
    participant BE as Backend (speech_api)
    participant Eng as Voice Engine
    participant Prov as Provider (Nova/Gemini)
    participant SAP as StreamingAudioPlayer

    Note over Mic,SAP: === CONNECTION PHASE ===
    SSR->>WS: WebSocket.connect(ws://host/api/speech-to-text/stream?session_id=X)
    WS->>BE: WS Upgrade
    BE->>BE: accept(), validate token, load session
    BE->>Eng: create_session(system_prompt, callbacks)
    Eng->>Prov: Open bidirectional stream
    Prov-->>Eng: Ready
    BE-->>WS: {"type": "connected", ...}
    WS-->>SSR: onConnected()

    Note over Mic,SAP: === USER SPEAKING PHASE ===
    loop Every ~85ms audio frame
        Mic->>SSR: onaudioprocess(Float32Array)
        SSR->>SSR: RMS energy check (echo gating)
        SSR->>SSR: resampleTo16kHz() → Int16Array
        SSR->>WS: ws.send(pcm16.buffer) [binary]
        WS->>BE: Binary frame received
        BE->>BE: base64.b64encode(bytes)
        BE->>Eng: send_audio_chunk(base64)
        Eng->>Prov: Forward audio
    end

    Prov-->>Eng: transcript(text, "user", is_final=false)
    Eng-->>BE: on_transcript callback
    BE-->>WS: {"type": "transcript", "text": "...", "role": "user", "is_final": false}
    WS-->>SSR: onTranscript(text, false, "user")

    Note over Mic,SAP: === AI RESPONDING PHASE ===
    Prov-->>Eng: transcript(text, "user", is_final=true)
    Eng-->>BE: on_transcript callback
    BE-->>BE: session_manager.record_voice_turn("user", text)
    BE-->>WS: {"type": "transcript", ..., "is_final": true}

    loop AI audio chunks
        Prov-->>Eng: audio chunk (base64 24kHz PCM)
        Eng-->>BE: on_audio callback
        BE-->>WS: {"type": "audio", "data": "<base64>"}
        WS-->>SSR: onAudioChunk(base64)
        SSR-->>SAP: playChunk(base64)
        SAP->>SAP: decode → Float32 → schedule AudioBufferSourceNode
        Note over SSR: setAiSpeaking(true) → gates mic audio
    end

    Prov-->>Eng: turn_ended(END_TURN)
    Eng-->>BE: on_turn_ended callback
    BE-->>WS: {"type": "turn_ended", "stop_reason": "END_TURN"}

    Note over Mic,SAP: === BARGE-IN SCENARIO ===
    Mic->>SSR: Loud audio frame (RMS ≥ 0.035)
    SSR->>SSR: consecutiveLoudFrames++ (≥2)
    SSR->>SSR: isAiSpeaking = false
    SSR->>SAP: stop() [kills all active sources]
    SSR-->>WS: *(continues sending audio)*
    Prov-->>Eng: barge_in (INTERRUPTED)
    Eng-->>BE: on_barge_in callback
    BE-->>WS: {"type": "barge_in", ...}

    Note over Mic,SAP: === DISCONNECTION ===
    SSR->>WS: ws.close()
    BE->>Eng: engine.close_session(session_id)
    Eng->>Prov: Stop/close session
    BE->>BE: db_manager.update_speech_task(completed)
```

---

## Connection Lifecycle

| Phase | Current Implementation |
|---|---|
| **Heartbeat / Ping-Pong** | **NONE** — No application-level heartbeat. Relies on WebSocket protocol-level ping/pong (if supported by Starlette/uvicorn) |
| **Ordering** | Messages are ordered within a single WebSocket connection (TCP guarantees) |
| **Buffering** | No explicit buffering on server side; `asyncio.subprocess.PIPE` buffers internally for Nova Sonic worker IPC |
| **Backpressure** | **NONE** — No flow control mechanism. Audio chunks are forwarded as fast as received |
| **Disconnect detection** | Server: `WebSocketDisconnect` exception or `msg["type"] == "websocket.disconnect"`. Client: `ws.onclose` event |
| **Reconnect** | **NOT IMPLEMENTED** — `reconnectAttempts` and `maxReconnectAttempts` exist in client code but no reconnection logic is implemented |
| **Timeout** | **NONE** — No idle timeout on the WebSocket. Nova Sonic has 8-minute connection renewal. Gemini: managed by provider |
| **Cancellation** | Client sends `{"type": "stop"}` or closes WebSocket. Server enters `finally` block and closes engine session |
| **Cleanup** | Server: `engine.close_session()` + `db_manager.update_speech_task()`. Client: stops mic tracks, closes AudioContext, nullifies refs |

---

## IPC Protocol (Nova Sonic Worker)

```mermaid
sequenceDiagram
    participant FastAPI as FastAPI Process
    participant Worker as Python 3.13 Worker

    FastAPI->>Worker: stdin: {"action": "init", "session_id": "...", "model_id": "...", "voice_id": "...", "region": "...", "system_prompt": "...", "aws_access_key_id": "...", "aws_secret_access_key": "..."}
    Worker->>Worker: Initialize Bedrock client + open stream
    Worker-->>FastAPI: stdout: {"type": "ready", "session_id": "...", "is_renewal": false}

    loop Audio streaming
        FastAPI->>Worker: stdin: {"action": "audio", "data": "<base64_pcm>"}
        Worker->>Worker: Forward to Bedrock audioInput
        Worker-->>FastAPI: stdout: {"type": "audio", "data": "<base64_24khz>"}
        Worker-->>FastAPI: stdout: {"type": "transcript", "text": "...", "role": "...", "is_final": false}
    end

    Worker-->>FastAPI: stdout: {"type": "transcript", "text": "...", "role": "user", "is_final": true}
    Worker-->>FastAPI: stdout: {"type": "turn_ended", "stop_reason": "END_TURN"}

    Note over FastAPI,Worker: === Connection Renewal ===
    FastAPI->>Worker: stdin: {"action": "renew"}
    Worker->>Worker: Close old stream, reopen with context
    Worker-->>FastAPI: stdout: {"type": "renewed", "message": "..."}

    Note over FastAPI,Worker: === Shutdown ===
    FastAPI->>Worker: stdin: {"action": "stop"}
    Worker->>Worker: Close stream, exit
```

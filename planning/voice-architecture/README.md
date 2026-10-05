# Real-Time Voice Interview Agent — Architecture & Reverse-Engineering Dossier

> Comprehensive engineering audit and reverse-engineering of the real-time voice pipeline for **Project 08 (AI Interviewer Agent)**.
> Generated: September 2026

---

## Documents in this Directory

| File | Description | Core Topics Covered |
|---|---|---|
| [**`VOICE_CURRENT_STATE.md`**](./VOICE_CURRENT_STATE.md) | Full Pipeline Reverse-Engineering | Complete 10-stage trace from microphone to speaker, exact audio formats, provider comparisons (Nova Sonic, Gemini Live, Polly, AssemblyAI), and 16 extracted code assumptions. |
| [**`VOICE_WEBSOCKET_FLOW.md`**](./VOICE_WEBSOCKET_FLOW.md) | WebSocket Protocol & Sequence Trace | Handshake, JWT query auth, binary PCM frames vs JSON text events, complete message schemas (Client $\leftrightarrow$ Server), and Nova Sonic Python 3.13 subprocess IPC protocol. |
| [**`VOICE_DATA_FLOW.md`**](./VOICE_DATA_FLOW.md) | End-to-End Audio Data Transformation | Flowchart of audio transformation across browser, backend, subprocess, and AI models. Uplink (16kHz Int16 PCM) vs Downlink (24kHz Base64 PCM) format matrix and Dual-AudioContext architecture. |
| [**`VOICE_LATENCY_FLOW.md`**](./VOICE_LATENCY_FLOW.md) | Latency Path Breakdown & Gaps | Stage-by-stage latency analysis from mic capture to speaker output. Highlights unmeasured segments and provides a priority list for missing telemetry instrumentation. |
| [**`VOICE_FAILURE_MATRIX.md`**](./VOICE_FAILURE_MATRIX.md) | Interruption & Failure Matrix | 6 barge-in/interruption scenarios with sequence diagrams, 21 failure modes across audio/network/backend/providers, and 6 critical race conditions (including post-barge-in playback leaks). |
| [**`VOICE_OPEN_DECISIONS.md`**](./VOICE_OPEN_DECISIONS.md) | Open Architectural Decisions | 13 unfinalized technical decisions (ScriptProcessor replacement, MediaRecorder bugfix, reconnection strategy, provider failover, VAD placement, concurrency caps, etc.) with evaluation criteria. |
| [**`VOICE_ARCHITECTURE_QUESTIONS.md`**](./VOICE_ARCHITECTURE_QUESTIONS.md) | Decision Questions for the Architect | 17 actionable, non-generic architectural and product questions requiring explicit decisions before production implementation. |

---

## Key Highlights & Critical Discoveries

1. **Dual Voice Providers**:
   - **Amazon Nova 2 Sonic** (`amazon.nova-2-sonic-v1:0`): Spawns a dedicated Python 3.13 subprocess (`nova_sonic_worker.py`) communicating over `stdin`/`stdout` JSON lines to interface with Bedrock HTTP/2 CRT duplex streaming. Includes 8-minute stream renewal.
   - **Google Gemini Live** (`gemini-3.8-live`): Uses in-process async WebSocket via `google-genai` SDK.
   - Switched via `VOICE_PROVIDER` environment variable (`nova` vs `gemini`).

2. **Audio Format Specifications**:
   - **Uplink (Browser $\rightarrow$ Backend $\rightarrow$ Provider)**: 16,000 Hz, 16-bit Mono Linear PCM, raw binary ArrayBuffer over WebSocket ($\sim$2.7–3.0 KB per frame).
   - **Downlink (Provider $\rightarrow$ Backend $\rightarrow$ Browser)**: 24,000 Hz, 16-bit Mono Linear PCM, Base64-encoded string inside JSON frame. Played via `StreamingAudioPlayer` (`AudioBufferSourceNode` with gapless scheduling).

3. **High-Risk Bugs & Gaps Identified**:
   - **MediaRecorder Fallback Bug**: If Web Audio fails, `MediaRecorder` sends `audio/webm` chunks which corrupts audio at the backend/provider expecting raw PCM.
   - **Voice Validation Mismatch**: Default voice is `arjun`, but the worker validation array omits `arjun`, silently falling back to `matthew`.
   - **Post-Barge-In Playback Leak**: Audio chunks already in-flight in the WebSocket buffer can restart playback after client-side interruption.
   - **Zero Live Latency Telemetry**: No active latency metrics exist in the real-time path.

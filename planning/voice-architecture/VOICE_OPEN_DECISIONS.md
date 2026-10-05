# VOICE OPEN DECISIONS

> Every architectural decision that has NOT been finalized, derived from code analysis.

---

## Decision 1: ScriptProcessorNode Replacement

**DECISION:** Replace deprecated `ScriptProcessorNode` with `AudioWorkletNode`

**WHY IT MATTERS:** `ScriptProcessorNode` is deprecated in the Web Audio API specification. It runs on the main thread, causing potential audio glitches during UI updates. Modern browsers may remove it in future versions.

**CURRENT IMPLEMENTATION:** `ScriptProcessorNode` with buffer size 2048/4096 in [`api.ts`](file:///C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent/frontend/src/services/api.ts) L290. Connected through a zero-gain node to prevent loopback.

**OPTIONS THAT NEED TO BE EVALUATED:**
- `AudioWorkletNode` (modern, runs on separate audio thread, requires worklet script)
- Keep `ScriptProcessorNode` (simpler, works today, but deprecated)
- Third-party audio capture library (e.g., `RecordRTC`, `MediaRecorder` API)

**INFORMATION REQUIRED TO CHOOSE:**
- Target browser matrix (Safari AudioWorklet support)
- Acceptable complexity increase for worklet setup
- Whether main-thread audio processing is causing observable glitches

---

## Decision 2: MediaRecorder Fallback Format

**DECISION:** What to do when Web Audio API is unavailable

**WHY IT MATTERS:** The current fallback sends `audio/webm` encoded data, but the backend expects raw 16kHz PCM. This is a **silent data corruption bug** — the provider receives encoded audio it cannot decode.

**CURRENT IMPLEMENTATION:** [`api.ts`](file:///C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent/frontend/src/services/api.ts) L348–L366 — MediaRecorder with `audio/webm` mimeType, sending ArrayBuffers.

**OPTIONS THAT NEED TO BE EVALUATED:**
- Remove MediaRecorder fallback entirely (fail fast with clear error)
- Add server-side transcoding (WebM → PCM) for fallback path
- Use a WASM-based audio decoder in the browser for fallback
- Accept Web Audio API as a hard requirement

**INFORMATION REQUIRED TO CHOOSE:**
- Which browsers/devices need to be supported
- Whether any target browser lacks Web Audio API support
- Cost/complexity of server-side transcoding

---

## Decision 3: WebSocket Reconnection Strategy

**DECISION:** Should the voice WebSocket automatically reconnect on disconnect?

**WHY IT MATTERS:** Network interruptions during a live interview cause complete session loss. The user must manually restart.

**CURRENT IMPLEMENTATION:** `reconnectAttempts` and `maxReconnectAttempts = 3` are declared in [`api.ts`](file:///C:/VsCode/Hope-Elite-Works/Sept-Project/integrated-interview-agent/frontend/src/services/api.ts) L82–L83 but **never used**. No reconnection logic exists.

**OPTIONS THAT NEED TO BE EVALUATED:**
- Automatic reconnect with exponential backoff
- Reconnect with session state recovery (resume interview)
- Reconnect with fresh session (lose conversation context)
- No reconnect — show error and end interview gracefully
- Reconnect only if disconnect was non-clean (error vs intentional close)

**INFORMATION REQUIRED TO CHOOSE:**
- Can the voice provider resume a session after reconnect?
- What is the server-side session lifetime after disconnect?
- How long should we attempt reconnection before giving up?
- Should accumulated transcript be preserved across reconnects?
- What does the user experience during reconnection?

---

## Decision 4: Voice Provider Fallback Strategy

**DECISION:** Should the system automatically fall back between providers?

**WHY IT MATTERS:** Currently, if Nova Sonic fails, it enters "simulated mode" (synthetic tones, hardcoded answers). If Gemini fails, it just errors out. Neither falls back to the other provider.

**CURRENT IMPLEMENTATION:** `VOICE_PROVIDER` env var selects globally. No runtime provider switching. Nova has silent simulation fallback. Gemini has hard failure.

**OPTIONS THAT NEED TO BE EVALUATED:**
- Automatic failover: Nova → Gemini (or vice versa)
- No failover — explicit error to user
- Configurable fallback chain via env vars
- Per-session provider selection (not just per-process)
- Remove simulation mode (it can mask real failures)

**INFORMATION REQUIRED TO CHOOSE:**
- Is Gemini Live API stable enough for production?
- Is Nova Sonic the primary target or is it Gemini?
- Should users know which provider they're using?
- Cost implications of each provider
- Latency differences between providers

---

## Decision 5: Client-Side vs Server-Side VAD

**DECISION:** Should the browser or the backend perform Voice Activity Detection?

**WHY IT MATTERS:** Currently, VAD is split: the browser does RMS-based echo gating (not true VAD), and the provider does turn detection. No explicit VAD exists for silence detection or endpointing on either side.

**CURRENT IMPLEMENTATION:**
- Browser: RMS energy check for barge-in only (threshold 0.035)
- Provider: Native turn detection (silence-based endpointing)
- Separate VAD for visualization only (`AnalyserNode` in `useVoiceFirstInterview.ts`)

**OPTIONS THAT NEED TO BE EVALUATED:**
- Provider-only turn detection (current approach — simplest)
- Client-side VAD (e.g., `@ricky0123/vad-web`) for smarter audio gating
- Server-side VAD for consistent behavior across providers
- Hybrid: client-side preliminary + provider final decision

**INFORMATION REQUIRED TO CHOOSE:**
- Is provider turn detection responsive enough?
- Are there false-positive turn endings (provider cuts user off mid-thought)?
- Should silence during user thinking be handled differently?
- Bandwidth savings from client-side VAD (only send when speaking)

---

## Decision 6: Gemini Output Audio Sample Rate

**DECISION:** What sample rate does Gemini Live actually output?

**WHY IT MATTERS:** `StreamingAudioPlayer` is hardcoded to 24kHz (`new AudioCtx({ sampleRate: 24000 })`). If Gemini outputs at a different rate, audio will play at wrong speed.

**CURRENT IMPLEMENTATION:** Gemini receive loop extracts `inline_data.data` and base64 encodes it. No sample rate specified in the receive path. Player assumes 24kHz.

**OPTIONS THAT NEED TO BE EVALUATED:**
- Verify Gemini Live output sample rate from API documentation
- Add sample rate detection from response headers/metadata
- Configure player sample rate dynamically based on provider

**INFORMATION REQUIRED TO CHOOSE:**
- Gemini Live API audio output specification
- Whether output rate is configurable via `LiveConnectConfig`

---

## Decision 7: Duplicate AudioContext / MediaStream

**DECISION:** Should the system use one or two MediaStream + AudioContext pairs?

**WHY IT MATTERS:** Currently, `StreamingSpeechRecognition.start()` creates a `MediaStream` + `AudioContext` for recording, and `setupVoiceActivityDetection()` in `useVoiceFirstInterview.ts` creates **another** `MediaStream` + `AudioContext` for visualization. This is wasteful and could cause permission issues.

**CURRENT IMPLEMENTATION:** Two separate `getUserMedia()` calls, two separate `AudioContext` instances, two separate `MediaStream` objects.

**OPTIONS THAT NEED TO BE EVALUATED:**
- Share a single `MediaStream` across recording and VAD
- Share a single `AudioContext` with multiple processing nodes
- Keep separate (if isolation is valuable)

**INFORMATION REQUIRED TO CHOOSE:**
- Does sharing a MediaStream cause any browser issues?
- Is the second getUserMedia() call ever failing?

---

## Decision 8: Audio Buffering & Backpressure

**DECISION:** How to handle audio delivery when the network or provider is slow

**WHY IT MATTERS:** No backpressure mechanism exists. If network is slow, audio chunks queue up in WebSocket buffers. No flow control or quality degradation.

**CURRENT IMPLEMENTATION:** Audio frames are sent as fast as they're captured. No queue limit, no buffer size monitoring, no adaptive bitrate.

**OPTIONS THAT NEED TO BE EVALUATED:**
- WebSocket `bufferedAmount` monitoring with frame dropping
- Adaptive chunk size based on network conditions
- Client-side audio queue with overflow handling
- Server-side buffering with backpressure signals
- Audio quality degradation (lower sample rate) under poor network

**INFORMATION REQUIRED TO CHOOSE:**
- Expected network quality of target users
- Acceptable audio quality degradation parameters
- Provider behavior with late/reordered chunks

---

## Decision 9: Post-Barge-In Audio Race Condition

**DECISION:** How to prevent AI audio from playing after user interrupts

**WHY IT MATTERS:** After barge-in, audio chunks already in the WebSocket pipeline will arrive and create new `AudioBufferSourceNode` instances. The `onAudioChunk` handler does not guard against this.

**CURRENT IMPLEMENTATION:** No guard. `onAudioChunk` unconditionally plays chunks and sets `isAiSpeaking = true`.

**OPTIONS THAT NEED TO BE EVALUATED:**
- Add a `bargeInTimestamp` and ignore audio chunks received within N ms after barge-in
- Add a `isBargedIn` flag that's cleared when next `turn_ended` or user stop occurs
- Sequence number audio chunks and drop out-of-order ones
- Flush WebSocket receive buffer after barge-in

**INFORMATION REQUIRED TO CHOOSE:**
- How many audio chunks typically arrive after barge-in?
- What latency is acceptable between barge-in and complete silence?

---

## Decision 10: Latency Instrumentation

**DECISION:** What latency metrics to collect and how to expose them

**WHY IT MATTERS:** Zero latency measurements exist for the active voice path. Cannot optimize what you cannot measure.

**CURRENT IMPLEMENTATION:** Only disabled Polly TTS synthesis time is measured.

**OPTIONS THAT NEED TO BE EVALUATED:**
- Client-side timing (JavaScript `performance.now()`)
- Server-side timing (Python `time.monotonic()`)
- OpenTelemetry spans across the pipeline
- Simple console logging with timestamps
- Prometheus metrics endpoint

**INFORMATION REQUIRED TO CHOOSE:**
- What latency target is acceptable?
- Where will metrics be viewed? (Browser console? Dashboard? Logs?)
- Is OpenTelemetry already in the infrastructure?

---

## Decision 11: Concurrent Session Limits

**DECISION:** How many simultaneous voice sessions should the system support?

**WHY IT MATTERS:** Each Nova Sonic session spawns a Python 3.13 subprocess. Each Gemini session maintains an async WebSocket. No limits are enforced.

**CURRENT IMPLEMENTATION:** `NovaSonicVoiceEngine._active_sessions` dict grows unbounded. `GeminiVoiceEngine._active_sessions` dict grows unbounded. No concurrency limits.

**OPTIONS THAT NEED TO BE EVALUATED:**
- Hard limit with queue for excess requests
- Per-user session limit (one active voice session per user)
- Provider-specific limits (AWS Bedrock quotas, Gemini API quotas)
- Auto-scaling based on session count

**INFORMATION REQUIRED TO CHOOSE:**
- Target concurrent users
- Provider rate limits and quotas
- Server memory/CPU constraints per session
- Expected session duration

---

## Decision 12: Authentication Enforcement for WebSocket

**DECISION:** Should WebSocket connections require authentication?

**WHY IT MATTERS:** Currently authentication is optional. Anonymous users can open voice sessions, consuming provider resources.

**CURRENT IMPLEMENTATION:** JWT token is a query parameter. If absent or invalid, connection proceeds as "anonymous".

**OPTIONS THAT NEED TO BE EVALUATED:**
- Require authentication (reject unauthenticated connections)
- Rate-limit anonymous connections
- Keep optional auth (current approach)
- Short-lived session tokens specifically for WebSocket auth

**INFORMATION REQUIRED TO CHOOSE:**
- Is anonymous usage a product requirement?
- Cost per voice session (provider API costs)
- Risk of abuse without auth

---

## Decision 13: Nova Sonic Default Voice Bug

**DECISION:** Fix the voice validation mismatch

**WHY IT MATTERS:** Default voice is `arjun` (from env `NOVA_SONIC_VOICE_ID`), but the validation list in the worker doesn't include `arjun`. It silently falls back to `matthew`.

**CURRENT IMPLEMENTATION:** Worker checks `if voice not in [list] → voice = "matthew"`. `arjun` is not in the list.

**OPTIONS THAT NEED TO BE EVALUATED:**
- Add `arjun` to the validation list (if it's a valid Nova Sonic voice)
- Change default to `matthew`
- Remove validation and let Bedrock reject invalid voices
- Verify the complete list of supported voices from AWS documentation

**INFORMATION REQUIRED TO CHOOSE:**
- Is `arjun` a valid Amazon Nova Sonic voice?
- What is the authoritative list of supported voices?

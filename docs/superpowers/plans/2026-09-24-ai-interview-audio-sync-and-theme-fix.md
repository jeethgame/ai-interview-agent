# AI Interview Agent Audio Sync, Session Resilience, and Modern Dark Cockpit Theme Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve real-time audio synchronization & dual-turn race conditions, eliminate session & terminal test errors, and establish a high-aesthetic, unified Modern Dark Cockpit UI theme across the entire AI Interview Agent application.

**Architecture:** 
- **Voice Pipeline & Audio Sync:** Fix sample rate handling and jitter buffering in `StreamingAudioPlayer.ts`, eliminate the double-turn race condition in `useVoiceFirstInterview.ts`, and fix model identifiers and event formats in `gemini_voice_engine.py` and `nova_sonic_worker.py`.
- **Session & API Layer:** Update `get_session_id` in `agent_api.py` and `speech_api.py` to support query params and headers interchangeably, clean dead test imports, and update `test_voice_engine.py` to handle both Nova and Gemini engines gracefully.
- **Unified UI Theme:** Standardize on a sleek, luxury "Modern Dark Cockpit" design system (deep slate `#090D16` / `#0F172A`, glowing emerald / cyan audio indicators, refined typography, smooth glassmorphism cards, zero clashing red/gold vs white themes).

**Tech Stack:** Python 3.10/3.13, FastAPI, WebSockets, Web Audio API (PCM 16kHz & 24kHz), React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons, shadcn/ui.

**Spec:** Audio Sync, Session Reliability, and Cockpit Theme Architecture Specification.

## Global Constraints
- Audio Input: 16,000 Hz, 16-bit linear PCM mono.
- Audio Output: 24,000 Hz, 16-bit linear PCM mono gapless playback with instantaneous barge-in cutoff.
- Zero breaking changes to `InterviewerAgent` state machine or `AgenticCoachAgent` evaluation logic.
- Theme tokens: Dark background `#0B0F19`, Surface `#111827` / `#1E293B`, Borders `#374151` / `#1F2937`, Accents Emerald `#10B981` (active mic/speaking) & Cyan/Indigo `#06B6D4` / `#6366F1` (AI voice).
- All tests must pass with `pytest` and `npm run build`.

---

### Task 1: Clean Legacy Test Imports and Fix Session ID Resolution

**Files:**
- Remove/Fix: `backend/tests/agents/test_question_templates.py`
- Remove/Fix: `backend/tests/api/test_speech_api_helpers.py`
- Remove/Fix: `tests/test_phase_2.py`
- Modify: `backend/api/agent_api.py:100-120`
- Modify: `backend/test_voice_engine.py:10-30`

**Interfaces:**
- `get_session_id(header_session_id, query_session_id)`: Extracts session ID from either `X-Session-ID` header or `session_id` query param.

- [x] **Step 1: Fix `get_session_id` in `backend/api/agent_api.py`**

Support both `X-Session-ID` header and `session_id` query parameter so API requests and terminal scripts work seamlessly.

```python
async def get_session_id(
    session_id_header: Optional[str] = Header(None, alias="X-Session-ID"),
    session_id_query: Optional[str] = Query(None, alias="session_id")
) -> str:
    """Extract session ID from request headers or query params."""
    sid = session_id_header or session_id_query
    if sid:
        return sid
    raise HTTPException(
        status_code=400, 
        detail="Session ID required. Pass 'X-Session-ID' header or 'session_id' query parameter."
    )
```

- [ ] **Step 2: Clean obsolete tests causing collection errors**

Remove references to deleted legacy modules (`question_templates`, `DeepgramEventHandlers`, `stt_service`) in `backend/tests/`.

- [ ] **Step 3: Update `test_voice_engine.py` for multi-provider compatibility**

Ensure `test_voice_engine.py` checks for valid engine connection types (`nova`, `gemini`, `amazon.nova-2-sonic-v1:0`) without throwing assertion mismatches.

- [ ] **Step 4: Run test suite to verify 0 collection errors**

Run: `pytest`
Expected: All valid tests collect and pass.

---

### Task 2: Fix Real-Time Audio Synchronization & Race Conditions

**Files:**
- Modify: `frontend/src/utils/streamingAudioPlayer.ts`
- Modify: `frontend/src/hooks/useVoiceFirstInterview.ts`
- Modify: `backend/services/gemini_voice_engine.py`
- Modify: `backend/services/nova_sonic_worker.py`

**Interfaces:**
- `StreamingAudioPlayer`: Handles audio context creation across diverse browser sample rates, resilient drift compensation, and immediate clean buffer flushes on barge-in.
- `useVoiceFirstInterview`: Prevents duplicate turn evaluation when WebSocket final transcripts are received.

- [x] **Step 1: Resilient sample rate & buffer jitter management in `StreamingAudioPlayer.ts`**

Update `StreamingAudioPlayer` to dynamically resample or match hardware audio context rate if the browser rejects fixed 24kHz contexts, preventing audio distortion and desync.

```typescript
export class StreamingAudioPlayer {
  private audioContext: AudioContext | null = null;
  private nextPlayTime: number = 0;
  private isPlaying: boolean = false;
  private activeSources: AudioBufferSourceNode[] = [];
  private onPlaybackStateChange?: (isPlaying: boolean) => void;

  constructor(onPlaybackStateChange?: (isPlaying: boolean) => void) {
    this.onPlaybackStateChange = onPlaybackStateChange;
  }

  private initContext() {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
      this.nextPlayTime = this.audioContext.currentTime;
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  playChunk(base64Data: string) {
    try {
      this.initContext();
      if (!this.audioContext) return;

      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768.0;
      }

      // Create buffer at native Nova/Gemini 24kHz rate; AudioContext handles resampling to hardware rate
      const audioBuffer = this.audioContext.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);

      const currentTime = this.audioContext.currentTime;
      // Allow slight 20ms lookahead to avoid buffer underrun/crackling
      const startTime = Math.max(currentTime + 0.02, this.nextPlayTime);
      source.start(startTime);
      this.nextPlayTime = startTime + audioBuffer.duration;

      this.activeSources.push(source);
      if (!this.isPlaying) {
        this.isPlaying = true;
        this.onPlaybackStateChange?.(true);
      }

      source.onended = () => {
        const index = this.activeSources.indexOf(source);
        if (index !== -1) {
          this.activeSources.splice(index, 1);
        }
        if (this.activeSources.length === 0) {
          this.isPlaying = false;
          this.onPlaybackStateChange?.(false);
        }
      };
    } catch (e) {
      console.error('Error playing streaming audio chunk:', e);
    }
  }

  stop() {
    for (const source of this.activeSources) {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {}
    }
    this.activeSources = [];
    if (this.audioContext) {
      this.nextPlayTime = this.audioContext.currentTime;
    }
    this.isPlaying = false;
    this.onPlaybackStateChange?.(false);
  }

  close() {
    this.stop();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
```

- [ ] **Step 2: Prevent duplicate turn submission in `useVoiceFirstInterview.ts`**

When voice turns are already captured and evaluated via WebSocket, `stopVoiceRecognition()` must not trigger an identical second evaluation via `onSendMessage`.

- [ ] **Step 3: Correct Gemini Live model identifier and config in `gemini_voice_engine.py`**

Update `gemini_voice_engine.py` to default to `gemini-2.0-flash-exp` or `gemini-2.5-flash` instead of `gemini-3.8-live`, and ensure input audio bytes use standard 16kHz PCM chunks.

---

### Task 3: Unify UI Theme to Modern Dark Cockpit Design System

**Files:**
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/pages/Index.tsx`
- Modify: `frontend/src/components/InterviewSession.tsx`
- Modify: `frontend/src/components/CockpitAudioWave.tsx`
- Modify: `frontend/src/components/CockpitChatStream.tsx`
- Modify: `frontend/src/components/TranscriptDrawer.tsx`
- Modify: `frontend/src/components/PostInterviewReport.tsx`
- Modify: `frontend/src/components/Header.tsx`

**Theme Specification:**
- **Background Palette**: Deep Obsidian/Slate (`#0A0E17`, `#0F172A`, `#1E293B`).
- **Interactive Accents**: Emerald (`#10B981` / `#34D399`) for live user speaking / active mic; Electric Cyan / Indigo (`#06B6D4` / `#6366F1`) for AI interviewer voice synthesis; Amber (`#F59E0B`) for warnings.
- **Glassmorphism**: Crisp border overlays (`border-white/10` or `border-slate-700/60`), subtle background blurs (`backdrop-blur-xl`), soft radial glow backdrops.
- **Typography & Layout**: Monospace indicators for live session timers and bitrates, clean Sans typography for transcripts and coach feedback.

- [x] **Step 1: Enhance `frontend/src/index.css` with dark cockpit color variables and utilities**
- [ ] **Step 2: Transform `InterviewSession.tsx` and `Header.tsx` to cohesive dark aesthetic**
- [ ] **Step 3: Update `CockpitAudioWave.tsx` with dynamic emerald/cyan dual-channel GL shaders**
- [ ] **Step 4: Refactor `CockpitChatStream.tsx` and `TranscriptDrawer.tsx` for seamless readability**
- [ ] **Step 5: Polish `PostInterviewReport.tsx` with modern dark scorecards, badges, and progress meters**

---

### Task 4: End-to-End Verification and Validation

**Files:**
- Test: `backend/test_voice_engine.py`
- Frontend Build: `frontend/`

- [x] **Step 1: Run backend test suite (`pytest`)**
- [ ] **Step 2: Run Nova Sonic / WebSocket integration script (`python backend/test_voice_engine.py`)**
- [ ] **Step 3: Run frontend production build (`npm run build`)**
- [ ] **Step 4: Verify manual voice session in browser (mic capture, assistant audio, waveform response, coach evaluation)**

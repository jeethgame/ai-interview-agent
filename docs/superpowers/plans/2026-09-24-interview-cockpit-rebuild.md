# Interview Cockpit Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the centered-mic-button interview UI with a chat-stream cockpit: conversational message display, WebGL audio wave, and dev-mode text input for MCP testing.

**Architecture:** Three new React components (CockpitChatStream, CockpitAudioWave, DevTextInput) composed inside a rewritten InterviewSession.tsx. Voice pipeline hook and all backend endpoints unchanged.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, WebGL GLSL shaders, lucide-react

## Global Constraints

- Theme: Dark cockpit bg (#000000) with red (#DC2626) and gold (#EAB308) accents. White text (#e4e4e4).
- All imports use @/ path alias.
- Message type from @/hooks/useInterviewSession.
- turnState is 'user' | 'ai' | 'idle'.
- No changes to any hook, service, or backend file.
- TypeScript must compile clean (npx tsc --noEmit).

---

## Task 1: Create CockpitChatStream component

**Files:** Create src/components/CockpitChatStream.tsx

**What it does:** Renders interview messages in a chat layout. AI messages left-aligned with sparkle icon, user messages right-aligned in pill bubbles. Status pills show current state. Auto-scrolls, top-fades older messages.

**Props:** messages (Message[]), turnState, isListening, isProcessing, accumulatedTranscript (string | undefined)

**Key details:**
- SparkleIcon: 3x3 grid of 3.5px red dots
- StatusPill: listening (gold, right), speaking (red, left), processing (dim italic, left)
- Filter out coach messages (agent === 'coach')
- Older AI messages get opacity-[0.18]
- Live accumulated transcript shows as italic gold pill when listening
- mask-image gradient fades top 15%
- max-height calc(100vh - 320px)

---

## Task 2: Create CockpitAudioWave component

**Files:** Create src/components/CockpitAudioWave.tsx

**What it does:** WebGL canvas rendering an oscilloscope wave at the bottom of the screen. Ported directly from HTML demo GLSL shader.

**Props:** turnState, isListening, isProcessing, voiceActivity (number 0-1)

**Key details:**
- Fixed bottom-0, full width, 220px height, pointer-events-none, z-index 5
- GLSL fragment shader with bell-curve wave, HSV color shifting
- State-driven: AI speaking = red, speed 10, high amplitude; Listening = dark blue flat line; Processing = gray, pulsing
- Colors: speaking #DC2626, listening #1e3a5f, processing #6B7280
- Smooth lerp between states (0.06-0.12 rate)
- requestAnimationFrame loop, cleaned up on unmount
- Canvas resizes with DPR cap at 2

---

## Task 3: Create DevTextInput component

**Files:** Create src/components/DevTextInput.tsx

**What it does:** Toggleable text input for dev/MCP testing. A Keyboard icon toggle button (placed in control dock by parent) + a fixed-position input bar that appears above the dock when toggled on.

**Props:** onSendMessage (string => void), isLoading (boolean)

**Key details:**
- Toggle button: 40x38px, Keyboard icon, red highlight when active
- Input bar: fixed bottom-[88px], max-width 640px, centered
- Dark glass style (bg-black/80 backdrop-blur-2xl border-white/10)
- Enter sends, clears after send, disabled when loading
- Send button: red bg, Send icon
- autoFocus when opened

---

## Task 4: Rewrite InterviewSession + delete old components

**Files:**
- Rewrite: src/components/InterviewSession.tsx
- Delete: src/components/VoiceFirstInterviewPanel.tsx
- Delete: src/components/CentralMicButton.tsx
- Delete: src/components/AppleIntelligenceGlow.tsx

**What it does:** Replaces the old decorative layout with the new cockpit. Same props interface as before.

**New layout (top to bottom):**
- Top bar: timer pill (green border, mono font) + "End interview" button (red border)
- Content layer: CockpitChatStream centered, padded 60px top / 200px bottom
- CockpitAudioWave: fixed bottom canvas
- DevTextInput: renders input bar + provides toggle button
- Control dock: fixed bottom-[18px], centered, dark glass pill with buttons: [Mic] [Transcript] [DevToggle]
- TranscriptDrawer: existing side panel, toggled by transcript button
- InterviewInstructionsModal: shown on mount, triggers TTS of first AI message on dismiss
- End confirm modal: simple dark modal with Cancel/End buttons
- SessionWarningDialog: existing, unchanged

**What gets removed:**
- renderAdvancedBackground (mouse-tracking gradients, orbs, particles, geometric shapes)
- renderFloatingStatusPanel (3 floating cards)
- renderAdvancedControls (bloated bottom bar)
- VoiceFirstInterviewPanel usage
- All particle/ambient state variables
- Mouse tracking state

**What stays:**
- useVoiceFirstInterview hook call (same args)
- Timer logic (sessionStartTime + currentTime)
- TranscriptDrawer
- InterviewInstructionsModal with TTS trigger
- SessionWarningDialog
- Props interface (InterviewSessionProps) unchanged

**Verification:**
- npx tsc --noEmit passes
- Landing page loads at localhost:8080
- Interview cockpit renders when "Start Interview Practice" is clicked
- Dev text input toggle shows/hides input bar
- Mic button toggles microphone
- Transcript drawer opens/closes

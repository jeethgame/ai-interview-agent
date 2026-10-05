# Interview Cockpit Rebuild — Design Spec

## Goal

Replace the current voice-first interview UI (centered mic button with decorative effects) with a chat-stream-based cockpit inspired by the HTML demo. The new cockpit shows AI and user messages in a conversational layout, a WebGL audio wave at the bottom, and a dev-mode text input toggle for testing via browser MCP.

## Components

### 1. CockpitChatStream.tsx (NEW)

Main-stage conversational message display, centered in the interview screen.

**Layout:**
- Full-width container, max-width 560px, vertically scrollable
- Top-fades (mask-image gradient so older messages fade out at top)
- Auto-scrolls to bottom on new messages

**Message types:**
- AI messages (left-aligned): Sparkle icon (3x3 dot grid in red) above the text. 15px, normal weight. Older AI messages get faded opacity.
- User messages (right-aligned): Dark pill bubble with subtle border. 14px text.
- Status pills: "Listening" (gold, right-aligned), "Speaking" (red, left-aligned), "Processing..." (dim, italic, left-aligned). Each has animated dot.

**Props:** messages, turnState, isListening, isProcessing, accumulatedTranscript

**Behavior:** Derives status from turnState/isListening/isProcessing. Shows accumulated transcript as live typing indicator. No coach feedback here (stays in TranscriptDrawer).

**Theme:** White text on dark background. Red (#DC2626) and gold (#EAB308) accents.

### 2. CockpitAudioWave.tsx (NEW)

WebGL oscilloscope wave canvas at screen bottom.

**Layout:** Fixed bottom-0, full width, 220px height. Mask-image fade at top. Pointer-events none. z-index below control bar.

**Implementation:** Port the GLSL fragment shader from HTML demo verbatim. Canvas with WebGL context. Shader uniforms driven by React state.

**State-driven behavior:**
- AI speaking: Speed 10, high amplitude, frequency 20-80, red color (#DC2626)
- User listening: Speed 5, minimal amplitude, dark blue flat line (#1e3a5f)
- Processing: Speed 20, low amplitude, pulsing, gray (#6B7280)

**Props:** turnState, isListening, isProcessing, voiceActivity (0-1)

### 3. DevTextInput.tsx (NEW)

Toggleable text input for developer/MCP testing.

- Toggle button (keyboard icon) in control bar
- When on: text input bar above control bar, max-width 640px, input + send button
- Enter sends, clears after send, disabled when loading
- Dark glass style matching control bar

**Props:** onSendMessage, isLoading

### 4. InterviewSession.tsx (MODIFY)

Rewire to use new components.

**New layout:**
```
Top bar: [Timer]              [End Interview]
─────────────────────────────────────────────
            CockpitChatStream
         (centered, scrollable)
─────────────────────────────────────────────
   [Dev text input bar]  (toggleable)
─────────────────────────────────────────────
   ~~~~ CockpitAudioWave ~~~~
   Control dock: [Mic] [Transcript] [Dev] [Settings]
```

**Remove:** renderAdvancedBackground, renderFloatingStatusPanel, renderAdvancedControls, VoiceFirstInterviewPanel import.
**Keep:** useVoiceFirstInterview hook, TranscriptDrawer, InterviewInstructionsModal, SessionWarningDialog. Props interface unchanged.

### 5. Existing Components (NO CHANGES)

Stay exactly as on origin/main: TranscriptDrawer, InterviewInstructionsModal, SessionWarningDialog, PostInterviewReport, Header, Index.tsx, all hooks, all services.

### Components to delete after rebuild

- VoiceFirstInterviewPanel.tsx (replaced by CockpitChatStream)
- CentralMicButton.tsx (mic moves inline to control dock)
- AppleIntelligenceGlow.tsx (wave provides visual feedback now)

## File changes summary

| File | Action | Lines (est.) |
|---|---|---|
| CockpitChatStream.tsx | Create | ~150 |
| CockpitAudioWave.tsx | Create | ~200 |
| DevTextInput.tsx | Create | ~60 |
| InterviewSession.tsx | Rewrite | ~250 |
| VoiceFirstInterviewPanel.tsx | Delete | -200 |
| CentralMicButton.tsx | Delete | -180 |
| AppleIntelligenceGlow.tsx | Delete | -120 |

## Theme note

The cockpit uses a dark background (black/dark gray) — intentional, matches the HTML demo. The landing page uses red/gold/white. Two distinct visual contexts: landing = marketing/config, cockpit = immersive interview. Dark cockpit with red/gold accents is the correct design.

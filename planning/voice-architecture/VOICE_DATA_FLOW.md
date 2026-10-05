# VOICE DATA FLOW

> Exact audio data formats at every stage of the pipeline.

---

## End-to-End Audio Data Flow

```mermaid
flowchart TD
    subgraph Browser ["Browser (Client)"]
        MIC["🎤 Microphone\nMediaStream\nNative rate (44.1/48kHz)\nFloat32, Mono"]
        SPN["ScriptProcessorNode\nBuffer: 2048/4096 samples\nRMS Echo Gating"]
        RS["resampleTo16kHz()\nLinear interpolation\nFloat32 → Int16\n16kHz, 16-bit, Mono"]
        WS_SEND["WebSocket.send()\nBinary ArrayBuffer\n~2.7-3.0 KB per chunk\n~85-93ms per chunk"]

        WS_RECV["WebSocket.onmessage\nJSON: {type:audio, data:base64}\n24kHz, 16-bit PCM"]
        DECODE["atob() → Uint8Array\n→ Int16Array → Float32Array\n÷ 32768.0"]
        ABUF["AudioBuffer\n24kHz, Mono, Float32"]
        PLAY["AudioBufferSourceNode\nGapless scheduling\n→ AudioContext.destination\n→ 🔊 Speakers"]
    end

    subgraph Backend ["Backend (FastAPI)"]
        WS_EP["WebSocket Endpoint\n/api/speech-to-text/stream"]
        B64_ENC["base64.b64encode(bytes)\n→ ASCII string"]
        ENGINE["Voice Engine Router\nVOICE_PROVIDER env var"]
        CB_AUDIO["on_audio callback\nwebsocket.send_json()"]
    end

    subgraph Nova ["Nova Sonic (Subprocess)"]
        WORKER["nova_sonic_worker.py\nPython 3.13"]
        BEDROCK["Amazon Bedrock\namazon.nova-2-sonic-v1:0\nHTTP/2 Duplex"]
        NS_IN["audioInput event\naudio/lpcm, 16kHz\n16-bit, Mono, Base64"]
        NS_OUT["audioOutput event\naudio/lpcm, 24kHz\n16-bit, Mono, Base64"]
    end

    subgraph Gemini ["Gemini Live (In-process)"]
        GL_API["Google GenAI SDK\ngemini-3.8-live"]
        GL_IN["send_realtime_input()\naudio/pcm;rate=16000\nRaw bytes"]
        GL_OUT["model_turn.parts\ninline_data.data\nRaw audio bytes → Base64"]
    end

    MIC --> SPN
    SPN -->|"RMS ≥ 0.035 or not gated"| RS
    SPN -->|"RMS < 0.035 during AI speech"| DROP["❌ Frame Dropped"]
    RS --> WS_SEND
    WS_SEND -->|"Binary WebSocket Frame"| WS_EP
    WS_EP --> B64_ENC
    B64_ENC --> ENGINE

    ENGINE -->|"VOICE_PROVIDER=nova"| WORKER
    WORKER -->|"stdin JSON: {action:audio, data:b64}"| NS_IN
    NS_IN --> BEDROCK
    BEDROCK --> NS_OUT
    NS_OUT -->|"stdout JSON: {type:audio, data:b64}"| CB_AUDIO

    ENGINE -->|"VOICE_PROVIDER=gemini"| GL_IN
    GL_IN --> GL_API
    GL_API --> GL_OUT
    GL_OUT --> CB_AUDIO

    CB_AUDIO -->|"JSON text frame"| WS_RECV
    WS_RECV --> DECODE
    DECODE --> ABUF
    ABUF --> PLAY

    style DROP fill:#fee2e2,stroke:#ef4444
    style MIC fill:#dbeafe,stroke:#3b82f6
    style PLAY fill:#d1fae5,stroke:#10b981
    style BEDROCK fill:#fef3c7,stroke:#f59e0b
    style GL_API fill:#e0e7ff,stroke:#6366f1
```

---

## Format at Each Stage

| Stage | Sample Rate | Bit Depth | Channels | Format | Container | Size per ~85ms |
|---|---|---|---|---|---|---|
| Microphone output | 44.1/48 kHz | 32-bit float | 1 | IEEE 754 Float32 | MediaStream | 4096 × 4 = 16,384 bytes |
| After resampling | 16 kHz | 16-bit int | 1 | Signed Int16 (PCM) | Int16Array | ~1,365–1,482 × 2 ≈ 2,730–2,964 bytes |
| WebSocket uplink | 16 kHz | 16-bit int | 1 | Raw PCM | Binary ArrayBuffer | ~2,730–2,964 bytes |
| Backend → Worker | 16 kHz | 16-bit int | 1 | Base64 PCM | JSON line (stdin) | ~3,640–3,952 chars (base64) |
| Bedrock input | 16 kHz | 16-bit int | 1 | Base64 PCM | HTTP/2 event | Same as above |
| Bedrock output | **24 kHz** | 16-bit int | 1 | Base64 PCM | HTTP/2 event | Provider-determined |
| Gemini input | 16 kHz | 16-bit int | 1 | Raw PCM bytes | WebSocket | ~2,730–2,964 bytes |
| Gemini output | **24 kHz** *(assumed)* | 16-bit int | 1 | Raw bytes → Base64 | WebSocket | Provider-determined |
| WebSocket downlink | 24 kHz | 16-bit int | 1 | Base64 in JSON | Text WebSocket frame | Variable |
| Browser decode | 24 kHz | 32-bit float | 1 | IEEE 754 Float32 | AudioBuffer | Variable |
| Speaker playback | 24 kHz | 32-bit float | 1 | Float32 | AudioBufferSourceNode | Gapless scheduled |

---

## Dual Audio Context Architecture

The browser maintains **two separate AudioContext instances** for different purposes:

```mermaid
flowchart LR
    subgraph "AudioContext #1 — Recording"
        AC1["AudioContext\n(native sample rate)\nCreated in api.ts"]
        MSS["MediaStreamSource\n← Microphone"]
        SPN1["ScriptProcessorNode\nbufferSize: 2048/4096"]
        GAIN["GainNode\ngain.value = 0"]
        DEST1["destination\n(silent output)"]

        MSS --> SPN1
        SPN1 --> GAIN
        GAIN --> DEST1
    end

    subgraph "AudioContext #2 — Playback"
        AC2["AudioContext\nsampleRate: 24000\nCreated in streamingAudioPlayer.ts"]
        BUF["AudioBuffer\n24kHz, mono"]
        SRC["AudioBufferSourceNode"]
        DEST2["destination\n→ Speakers 🔊"]

        BUF --> SRC
        SRC --> DEST2
    end

    subgraph "AudioContext #3 — VAD (optional)"
        AC3["AudioContext\n(native rate)\nCreated in useVoiceFirstInterview.ts"]
        AN["AnalyserNode\nfftSize: 256"]
        VIZ["→ voiceActivityLevel\n→ CockpitAudioWave"]

        AC3 --> AN
        AN --> VIZ
    end
```

> [!WARNING]
> The VAD AudioContext (#3) creates a **separate** `getUserMedia()` call and `MediaStream`, duplicating the microphone access already obtained by AudioContext #1. This is a potential resource waste and could cause permission issues on some browsers.

---

## Asymmetric Sample Rates

| Direction | Sample Rate | Reason |
|---|---|---|
| **Uplink** (mic → provider) | **16 kHz** | Provider requirement (both Nova Sonic and Gemini expect 16kHz input) |
| **Downlink** (provider → speaker) | **24 kHz** | Provider output (Nova Sonic outputs at 24kHz; Gemini assumed same based on player config) |

This asymmetry is intentional and correct — speech recognition models typically process 16kHz input, while speech synthesis outputs at higher quality 24kHz.

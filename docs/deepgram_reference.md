# Deepgram STT + TTS Reference
*Scraped from official docs — Sept 2026*

---

## CRITICAL: Endpoint Rules (Get These Wrong → 400 Error)

| Model Family | STT Endpoint | TTS Endpoint |
|---|---|---|
| **Flux** | `/v2/listen` | `/v2/speak` |
| **Aura-2 / Aura** | `/v1/listen` | `/v1/speak` |

**Never mix them.** `aura-2-*` on `/v2/speak` = 400. `flux-*` on `/v1/speak` = 400.

---

## STT — Flux vs Nova-3

### Flux STT (`/v2/listen`) — RECOMMENDED for voice agents
- **Model:** `flux-general-en` (English) or `flux-general-multi` (10 languages)
- **SDK:** `client.listen.v2.connect()` — NOT `.websocket.v("1")`
- **WebSocket URL:** `wss://api.deepgram.com/v2/listen?model=flux-general-en`
- **Best feature:** Built-in end-of-turn detection — fires `EndOfTurn` events automatically. No manual VAD needed.
- **Chunk size:** 80ms strongly recommended
- **Audio format:** Raw linear16 @ 16kHz (set `encoding=linear16&sample_rate=16000`)

**Key events Flux fires:**
| Event | Meaning |
|---|---|
| `EndOfTurn` | User finished speaking — trigger LLM now |
| `EagerEndOfTurn` | User probably finished — start LLM early (speculative) |
| `TurnResumed` | User kept talking — cancel the speculative LLM call |

**End-of-turn parameters:**
```
eot_threshold=0.7          # default, range 0.5–1.0. Higher = more reliable, more latency
eager_eot_threshold=0.5    # enables EagerEndOfTurn; lower = faster but more false starts
eot_timeout_ms=5000        # max silence before forcing EndOfTurn (default 5s)
```

**Common mistakes:**
- ❌ Using `/v1/listen` with `model=flux-general-en` — must be `/v2/listen`
- ❌ Using `model=flux` — must be `flux-general-en` or `flux-general-multi`
- ❌ Sending `language=en` param — not supported; language is set via model name
- ❌ Sending containerized audio AND specifying `encoding`/`sample_rate` — omit params for containerized

### Nova-3 STT (`/v1/listen`) — what reference project uses
- **Model:** `nova-3`
- **SDK:** `client.listen.websocket.v("1")`
- **Turn detection:** manual — use `endpointing=500` + `utterance_end_ms=1000`
- Still accurate, fine for non-conversational use

---

## TTS — Flux TTS vs Aura-2

### Flux TTS (`/v2/speak`) — RECOMMENDED for voice agents

- **Models:** `flux-{voice}-en` (e.g., `flux-alexis-en`, `flux-turn-en`)
- **Output:** `linear16` PCM, default 24kHz
- **Transport:** Streaming WebSocket or REST (batch)
- **Features:** Conversation-native, turn-based, interruption-aware, cross-turn context
- **English only** today

**REST call (Python httpx):**
```python
r = await httpx.AsyncClient().post(
    "https://api.deepgram.com/v2/speak",
    params={"model": "flux-alexis-en", "encoding": "linear16",
            "sample_rate": "16000", "container": "none"},
    headers={"Authorization": f"Token {DEEPGRAM_API_KEY}",
             "Content-Type": "application/json"},
    json={"text": text},
)
audio_bytes = r.content  # raw PCM16 @ 16kHz
```

**Available Flux voices:** See https://developers.deepgram.com/docs/flux-tts/voices

### Aura-2 TTS (`/v1/speak`) — use when non-English needed

- **Models:** `aura-2-{voice}-{lang}` (e.g., `aura-2-asteria-en`, `aura-2-thalia-en`)
- **Languages:** en, es, de, fr, nl, it, ja
- **Output:** linear16 PCM at 8k/16k/24k/32k/48k Hz
- `container=none` — required to avoid click/pop at start (WAV header misread as audio)

**REST call (Python httpx):**
```python
r = await httpx.AsyncClient().post(
    "https://api.deepgram.com/v1/speak",
    params={"model": "aura-2-asteria-en", "encoding": "linear16",
            "sample_rate": "16000", "container": "none"},
    headers={"Authorization": f"Token {DEEPGRAM_API_KEY}",
             "Content-Type": "application/json"},
    json={"text": text},
)
audio_bytes = r.content
```

**Popular Aura-2 English voices:**
| Voice | Character |
|---|---|
| `aura-2-asteria-en` | Clear, friendly female |
| `aura-2-orion-en` | Professional, authoritative male |
| `aura-2-thalia-en` | Confident, conversational female |
| `aura-2-arcas-en` | Grounded, calm male |
| `aura-2-luna-en` | Warm, natural female |
| `aura-2-zeus-en` | Deep, confident male |

---

## What Our Code Uses (Current State)

### STT
- File: `backend/api/speech/stt_service.py` (copied from reference)
- Using: `client.listen.websocket.v("1")` → `/v1/listen` with `nova-3`
- Turn detection: `endpointing=500` + `utterance_end_ms=1000` (manual)

**Upgrade path → Flux STT:**
Change `_create_deepgram_options()` in `stt_service.py`:
```python
# FROM (nova-3 on v1):
deepgram_connection = self.deepgram_client.listen.websocket.v("1")
options = LiveOptions(model="nova-3", ...)

# TO (Flux on v2):
deepgram_connection = self.deepgram_client.listen.websocket.v("2")
options = LiveOptions(model="flux-general-en", encoding="linear16",
                      sample_rate=16000, eot_threshold=0.7,
                      eot_timeout_ms=3000)
# Then listen for EndOfTurn instead of speech_final
```
And in the combined handler (`speech_api.py`), replace `speech_final` trigger with `EndOfTurn` event trigger.

### TTS
- Function: `deepgram_tts()` in `backend/api/speech_api.py`
- Auto-routes: `flux-*` → `/v2/speak`, everything else → `/v1/speak`
- Current default: `aura-2-asteria-en` (Aura-2 on `/v1/speak`) ✅ correct

**To switch to Flux TTS:**
```bash
# In .env
DEEPGRAM_VOICE=flux-alexis-en   # auto-routes to /v2/speak
```
Note: Flux TTS default output is 24kHz — update `StreamingAudioPlayer` from 16000 → 24000 if using Flux TTS.

### Frontend AudioPlayer
- File: `frontend/src/utils/streamingAudioPlayer.ts`
- Currently set to: `16000` Hz (for Aura-2 PCM)
- If switching to Flux TTS: change to `24000` Hz

---

## .env Variables Needed

```bash
DEEPGRAM_API_KEY=your_key_here
DEEPGRAM_VOICE=aura-2-asteria-en   # or flux-alexis-en for Flux TTS
```

No AWS keys needed. One Deepgram key handles both STT and TTS.

---

## TTS Audio Format Combinations (quick ref)

| Encoding | Container | Sample Rates | Notes |
|---|---|---|---|
| `linear16` | `none` | 8k/16k/24k/32k/48k | Raw PCM — use this |
| `linear16` | `wav` | same | Has WAV header — causes clicks in streaming |
| `mp3` | n/a | fixed 22050 | REST only |
| `opus` | `ogg` | fixed 48000 | REST only |

**Always use `container=none`** for streaming playback. WAV header bytes get misinterpreted as audio → clicks/pops at start.

---

## Recommended Upgrade: Switch STT to Flux

Currently we use `nova-3` + manual endpointing. Flux STT gives:
- `EndOfTurn` event = no manual VAD, cleaner turn detection
- ~260ms end-of-turn detection vs our 500ms endpointing
- Same accuracy as nova-3

Change in `stt_service.py`: `v("1")` → `v("2")`, `model="nova-3"` → `model="flux-general-en"`.
Change in `speech_api.py` handler: `speech_final` trigger → listen for `EndOfTurn` event from Deepgram.

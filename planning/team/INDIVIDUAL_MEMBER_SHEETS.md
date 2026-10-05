# 5-Member Team Individual Tracking Sheets

> **Purpose:** Dedicated work assignment sheets for each team member to track progress individually with the mentor.  
> **Source:** Based on `CONTEXT.md` architecture and the 11 Supabase database tables.

---

# 📑 Member 1: Interview Agent & Session Orchestration Lead (Your Sheet)
**Focus:** Dialogue State Machine, Context Injection, Orchestration, and Session Lifecycle APIs.

| Task ID | Module / Subsystem | Detailed Task Description & Deliverables | Files / Symbols Owned | Dependencies | Est. Days | Status | Sprint |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **M1-01** | Zero-LLM Interview Controller | Build `InterviewerAgent` controller with phase transitions (`Introduction` -> `Technical` -> `Behavioral` -> `Wrapup`), question counters, and topic coverage tracker | `backend/agents/interviewer.py`<br>`backend/agents/interview_state.py`<br>`backend/agents/constants.py` | None | 3 | In Progress | Sprint 1 |
| **M1-02** | Dynamic Prompt & Context Assembly | Implement dynamic context injection template incorporating Candidate Resume text, Job Description (JD), target role, interview style, and difficulty | `backend/agents/templates/interviewer_templates.py`<br>`backend/agents/config_models.py` | None | 2 | In Progress | Sprint 1 |
| **M1-03** | Agent Session Manager | Build `AgentSessionManager` to coordinate voice turns, update interview phases, handle idle timers, and maintain in-memory conversation history | `backend/agents/orchestrator.py`<br>`backend/utils/time_manager.py` | None | 3 | In Progress | Sprint 2 |
| **M1-04** | Session REST Endpoints | Implement `/interview/session` (creation), `/interview/start` (intro greeting), `/interview/message` (REST fallback), and `/interview/status` | `backend/api/agent_api.py`<br>`backend/middleware/session_middleware.py` | M2-03 | 2 | Pending | Sprint 2 |
| **M1-05** | Interview Termination & Timer Logic | Implement early termination conditions, 00:00 timer expiration trigger, and `interview_ending` event propagation to frontend | `backend/agents/interviewer.py`<br>`backend/services/session_manager.py` | M4-03 | 2 | Pending | Sprint 3 |
| **M1-06** | Agent Integration & Event Bus | Wire `InterviewerAgent` turn finalization with Voice Gateway and trigger background `CoachAgent.evaluate_answer()` | `backend/services/session_manager.py`<br>`backend/utils/event_bus.py` | M3-02, M4-03 | 3 | Pending | Sprint 4 |

---

# 📑 Member 2: Database & Data Platform Engineer's Sheet
**Focus:** Full PostgreSQL Schema, 11 Relational Tables, RLS Policies, Database Managers, and User Auth.

| Task ID | Module / Subsystem | Detailed Task Description & Deliverables | Files / Symbols Owned | Dependencies | Est. Days | Status | Sprint |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **M2-01** | Core Relational Schema | Design & deploy PostgreSQL schema for candidate & session lifecycle tables:<br>1. `users`<br>2. `interview_blueprints`<br>3. `interview_sessions`<br>4. `interview_questions`<br>5. `candidate_answers` | `backend/database/schema.sql`<br>`backend/database/migrations/001_core.sql` | None | 3 | In Progress | Sprint 1 |
| **M2-02** | Evaluation & Speech Schema | Design & deploy PostgreSQL schema for scoring, coaching, and speech tasks:<br>6. `score_dimensions`<br>7. `scores`<br>8. `turn_feedback`<br>9. `interview_reports`<br>10. `recommended_resources`<br>11. `speech_tasks` | `backend/database/schema.sql`<br>`backend/database/migrations/002_analytics.sql` | M2-01 | 3 | In Progress | Sprint 1 |
| **M2-03** | Supabase Client & CRUD Manager | Build asynchronous `DatabaseManager` providing full CRUD operations, relations, and session persistence across all 11 tables | `backend/database/db_manager.py`<br>`backend/database/mock_db_manager.py` | M2-01, M2-02 | 4 | In Progress | Sprint 2 |
| **M2-04** | Security & RLS Policies | Implement Row-Level Security (RLS) policies for user data isolation, foreign key cascading, and automated `updated_at` triggers | `backend/database/schema.sql` (RLS & Triggers) | M2-02 | 2 | Pending | Sprint 3 |
| **M2-05** | Auth API & Token Verification | Build `/auth/register`, `/auth/login`, `/auth/refresh` endpoints and JWT verification helper `get_current_user_optional` | `backend/api/auth_api.py`<br>`backend/database/auth_helpers.py` | M2-03 | 3 | Pending | Sprint 3 |
| **M2-06** | Query Optimization & Indexing | Add composite database indexes on `session_id`, `user_id`, `status`, and `created_at` for high concurrency | `backend/database/schema.sql` (Indexes) | M2-04 | 2 | Pending | Sprint 4 |

---

# 📑 Member 3: Evaluation & AI Coaching Agent Engineer's Sheet
**Focus:** Real-time Answer Evaluation, Scoring Rubrics, Final Report Generation, and Serper Resource Search.

| Task ID | Module / Subsystem | Detailed Task Description & Deliverables | Files / Symbols Owned | Dependencies | Est. Days | Status | Sprint |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **M3-01** | LLM Service Configuration | Configure `LLMService` supporting Google Gemini (`ChatGoogleGenerativeAI`) as primary and Groq (`ChatGroqViaOpenAI`) as fallback | `backend/services/llm_service.py`<br>`backend/utils/llm_utils.py`<br>`backend/utils/llm_chain_processor.py` | None | 2 | Pending | Sprint 1 |
| **M3-02** | Per-Turn Answer Evaluator | Implement `AgenticCoachAgent.evaluate_answer()` for real-time turn critique, relevance scoring, and STAR framework analysis | `backend/agents/agentic_coach.py`<br>`backend/agents/templates/coach_templates.py` | M3-01 | 3 | Pending | Sprint 2 |
| **M3-03** | Multi-Dimensional Scoring Engine | Design evaluation rubrics and compute numerical scores across competencies (Technical Knowledge, Communication, Problem Solving, Culture Fit) | `backend/agents/evaluation_rubrics.py`<br>`backend/agents/score_calculator.py` | M3-02, M2-02 | 3 | Pending | Sprint 2 |
| **M3-04** | Post-Interview Report Generator | Build `generate_final_summary()` compiling overall performance summary, key strengths, areas for improvement, and radar chart metrics | `backend/agents/report_generator.py`<br>`backend/api/agent_api.py` (report routes) | M3-03, M2-03 | 3 | Pending | Sprint 3 |
| **M3-05** | Serper Resource Discovery Tool | Build `LearningResourceSearchTool` using Serper.dev API to automatically find curated tutorials, videos, and articles based on weak topics | `backend/agents/tools/search_tool.py`<br>`backend/services/search_service.py`<br>`backend/services/search_helpers.py` | M3-04 | 3 | Pending | Sprint 3 |
| **M3-06** | Evaluation Status Polling API | Implement `/interview/final-summary-status`, `/interview/feedback`, and `/interview/resources` endpoints | `backend/api/agent_api.py` | M3-04, M3-05 | 2 | Pending | Sprint 4 |

---

# 📑 Member 4: Voice & Real-Time Streaming Engineer's Sheet
**Focus:** Amazon Nova 2 Sonic Bedrock Worker, Gemini Live Voice, WebSockets, Audio Buffer Management, and Barge-in.

| Task ID | Module / Subsystem | Detailed Task Description & Deliverables | Files / Symbols Owned | Dependencies | Est. Days | Status | Sprint |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **M4-01** | Nova Sonic Subprocess Worker | Implement Amazon Nova 2 Sonic Bedrock HTTP/2 bidirectional streaming worker (Python 3.13 subprocess with JSON-line stdin/stdout) | `backend/services/nova_sonic_worker.py`<br>`backend/config/__init__.py` | None | 4 | In Progress | Sprint 1 |
| **M4-02** | Voice Engine Supervisor | Build `NovaSonicVoiceEngine` and `NovaSonicSession` process manager with graceful 7.5-minute Bedrock stream auto-renewal | `backend/services/nova_sonic_engine.py` | M4-01 | 3 | In Progress | Sprint 1 |
| **M4-03** | WebSocket Streaming Gateway | Build real-time WebSocket endpoint `/api/speech-to-text/stream` with connection tracking and audio streaming | `backend/api/speech_api.py`<br>`backend/api/speech/websocket_processor.py`<br>`backend/api/speech/connection_manager.py` | M4-02 | 3 | In Progress | Sprint 2 |
| **M4-04** | Gemini Live Voice Fallback | Implement real-time speech-to-speech fallback engine using Gemini 3.8 Live API (`GeminiVoiceEngine`) | `backend/services/gemini_voice_engine.py` | M4-03 | 3 | Pending | Sprint 2 |
| **M4-05** | Audio Protocol & Barge-in | Implement audio chunk encoding/decoding (16kHz PCM in / 24kHz PCM out), interruption detection (barge-in), and turn completion | `backend/api/speech/audio_utils.py`<br>`backend/api/speech/tts_service.py` | M4-03 | 2 | Pending | Sprint 3 |
| **M4-06** | Audio Echo Cancellation Gating | Implement server-side audio playback state coordination to prevent acoustic mic feedback loops | `backend/api/speech_api.py`<br>`backend/services/nova_sonic_engine.py` | M4-05, M5-03 | 2 | Pending | Sprint 4 |

---

# 📑 Member 5: Frontend Cockpit & UI/UX Engineer's Sheet
**Focus:** React/Vite SPA, WebGL GLSL Oscilloscope Wave, Web Audio PCM Player, Post-Interview Scorecard, and Setup Portal.

| Task ID | Module / Subsystem | Detailed Task Description & Deliverables | Files / Symbols Owned | Dependencies | Est. Days | Status | Sprint |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **M5-01** | Active Interview Cockpit UI | Build active interview cockpit screen (`InterviewSession.tsx`, `CockpitChatStream.tsx`) with Theme 03 Red & Gold on White design | `frontend/src/components/InterviewSession.tsx`<br>`frontend/src/components/CockpitChatStream.tsx` | None | 3 | In Progress | Sprint 1 |
| **M5-02** | WebGL GLSL Audio Visualizer | Implement high-performance WebGL GLSL shader oscilloscope wave rendering real-time mic and AI audio waveforms | `frontend/src/components/CockpitAudioWave.tsx` | M5-01 | 2 | In Progress | Sprint 1 |
| **M5-03** | Web Audio PCM Streaming Player | Build gapless 24kHz PCM audio player with `AudioContext` and mic transmission gating to eliminate acoustic echo feedback | `frontend/src/utils/streamingAudioPlayer.ts`<br>`frontend/src/hooks/useVoiceFirstInterview.ts` | M5-02, M4-03 | 4 | In Progress | Sprint 2 |
| **M5-04** | Post-Interview Scorecard & Report | Build rich candidate results dashboard with competency radar charts, strength/weakness cards, and learning resource links | `frontend/src/components/PostInterviewReport.tsx`<br>`frontend/src/components/TranscriptDrawer.tsx` | M3-04, M5-01 | 3 | Pending | Sprint 3 |
| **M5-05** | Candidate Onboarding & Resume Upload | Build configuration form, resume uploader (`POST /files/upload-resume`), audio I/O device selector modal, and Auth modal | `frontend/src/pages/Index.tsx`<br>`frontend/src/components/CockpitSettingsModal.tsx`<br>`frontend/src/components/AuthModal.tsx` | M1-04, M2-05 | 3 | Pending | Sprint 3 |
| **M5-06** | State Machine & Polling Hook | Refactor `useInterviewSession.ts` to manage state transitions (`configuring` -> `interviewing` -> `post_interview`) and auto-poll report | `frontend/src/hooks/useInterviewSession.ts`<br>`frontend/src/services/api.ts` | M1-04, M3-06 | 2 | Pending | Sprint 4 |

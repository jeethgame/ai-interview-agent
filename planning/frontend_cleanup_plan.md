# Frontend Cleanup Plan — Remove Template/Example Content & Wire Backend

## Problem
Gemini built the frontend using the example theme I sent as reference, but copied over placeholder text, fake data, demo personas, debug markers, and another developer's branding verbatim. The UI needs to be cleaned to reflect **our** platform (Project 08) with real backend integration.

---

## Section 1: Remove Theme Debug Artifacts

### 1.1 — Kill the theme banner bar (top of page)
- **File:** `src/components/Header.tsx` (lines ~70-78)
- **What's there:** Visible dark banner showing `"Theme 03 — Bold Red & Gold on White"` with hex codes `#DC2626 · #EAB308 · #FFFFFF · #111827 · #FEF3C7`
- **Action:** Delete the entire banner `<div>`. Keep the rest of the Header (navbar, logo, nav links).

### 1.2 — Kill the theme footer label
- **File:** `src/pages/Index.tsx` (lines ~948-950)
- **What's there:** Footer bar repeating `"Theme 03 · Bold Red & Gold on White (#DC2626 · #EAB308 · #FFFFFF · #111827 · #FEF3C7)"`
- **Action:** Delete this element entirely.

---

## Section 2: Remove Fake Statistics

### 2.1 — Stats counters are fabricated
- **File:** `src/pages/Index.tsx` (lines ~401-415)
- **What's there:** Three hardcoded stat cards — `"1,247 Interviews Completed"`, `"89% Success Rate"`, `"342 Active Users"`
- **Action:** Remove the entire stats section. These are fake numbers with no backend source. We can add real stats later when we have `/metrics` or `/interview/stats` data flowing.

---

## Section 3: Remove Fake "Recent Interviews" Section

### 3.1 — Hardcoded demo interview cards
- **File:** `src/pages/Index.tsx` (lines ~418-468)
- **What's there:** Two fake interview cards:
  - `"Data Structures & Algorithms"` — Sep 18, 2026, 42 min, Score 87/100
  - `"System Design"` — Sep 15, 2026, 55 min, Score 72/100
- **Action:** Remove this entire "Recent Interviews" section. The "Review" buttons don't load any real data anyway. We can add a real recent-interviews section later by pulling from `/interview/history`.

---

## Section 4: Remove Hardcoded "PK" Avatar

### 4.1 — Default avatar shows someone else's initials
- **File:** `src/components/Header.tsx` (lines ~64, ~186-191)
- **What's there:** When user is not logged in, a circle avatar with initials `"PK"` is displayed with title `"Candidate Profile"`.
- **Action:** Remove the always-visible PK avatar for logged-out users. When logged out, just show the Sign In / Sign Up buttons (which already exist). When logged in, derive initials from the actual user's name via AuthContext.

---

## Section 5: Remove Other Developer's Branding & Links

### 5.1 — PostInterviewReport footer has someone else's identity
- **File:** `src/components/PostInterviewReport.tsx` (lines ~656-703)
- **What's there:**
  - Brand: `"AI Interviewer"` (not our name)
  - Copyright: `"© 2025 AI Interviewer"` (wrong year, wrong name)
  - Social links pointing to `github.com/Ranjit2111`, `x.com/Ranjit_AI`, `linkedin.com/in/ranjit-n/`, `ranjitn.dev@gmail.com`
- **Action:** Replace footer with our Project 08 branding. Remove all personal social links. Use `"© 2026 Project 08 — St. Joseph's College of Engineering"`.

### 5.2 — Main page footer also has the external GitHub link
- **File:** `src/pages/Index.tsx` (line ~944)
- **What's there:** GitHub link pointing to `Ranjit2111/AI-Interview-Agent`
- **Action:** Remove or replace with our own repo link.

---

## Section 6: Fix Mismatched Theme in PostInterviewReport

### 6.1 — PostInterviewReport uses a completely different dark theme
- **File:** `src/components/PostInterviewReport.tsx`
- **What's there:** Dark cyan/purple gradient footer and styling that clashes with the main "Bold Red & Gold on White" theme.
- **Action:** Restyle the PostInterviewReport footer to match our red/gold/white theme. Keep it simple — same red bar footer pattern as the main page.

---

## Section 7: Clean Up Placeholder Form Text

### 7.1 — Register form has fake name
- **File:** `src/components/RegisterForm.tsx` (line ~56)
- **What's there:** `placeholder="e.g., Alex Johnson"`
- **Action:** Change to `"e.g., Rahul Kumar"` or just `"Your full name"`.

### 7.2 — Placeholder emails are fine
- `"e.g., student@stjosephs.ac.in"` in LoginForm.tsx and RegisterForm.tsx — **Keep as-is**, this is contextually correct for our college.

---

## Section 8: Fix Target Role Options

### 8.1 — Non-tech roles don't belong in a coding interview platform
- **File:** `src/pages/Index.tsx` (around the config form section)
- **What's there:** Target roles include `"Marketing Manager"`, `"Sales Representative"`, `"UX Designer"` alongside `"Software Engineer"`, `"Data Scientist"`, `"Product Manager"`.
- **Action:** Keep only relevant tech/placement roles:
  - Software Engineer
  - Data Scientist
  - Product Manager
  - Backend Developer
  - Frontend Developer
  - Full Stack Developer
  - DevOps Engineer
  - ML Engineer
- Remove Marketing Manager, Sales Representative, UX Designer.

---

## Section 9: Fix Dead Footer Links

### 9.1 — Placeholder href="#" links
- **File:** `src/pages/Index.tsx` (lines ~941-943)
- **What's there:** `"Privacy Policy"`, `"Terms of Service"`, `"Faculty Portal"` all pointing to `"#"`.
- **Action:** Remove Privacy Policy and Terms of Service links entirely (we don't have those pages). Keep "Faculty Portal" as a disabled/coming-soon badge if desired, or remove it too.

---

## Section 10: Clean Up Unused/Orphaned Components

### 10.1 — Dead route pages
- `src/pages/auth/Login.tsx` and `src/pages/auth/Register.tsx` exist but are **not wired** in `App.tsx`. Auth is handled via `AuthModal`.
- **Action:** Delete these orphaned files. Auth modal is the actual flow.

### 10.2 — Unused components
- `AudioPlayer.tsx` — not imported anywhere
- `OffScreenCoachFeedback.tsx` — not imported
- `RealTimeCoachFeedback.tsx` — not imported
- `MinimalMessageDisplay.tsx` — imported but never rendered
- `InterviewConfig.tsx` — standalone version, Index has its own inline config
- `PerTurnFeedbackReview.tsx` — standalone, PostInterviewReport has its own
- **Action:** Leave these for now (they may be useful later). Just noting them.

---

## Section 11: Minor Fixes

### 11.1 — Copyright year consistency
- PostInterviewReport says `"© 2025"`, main page says `"© 2026"`
- **Action:** Standardize to `"© 2026"` everywhere.

### 11.2 — Brand name consistency
- PostInterviewReport uses `"AI Interviewer"`, rest uses `"Project 08"`
- **Action:** Standardize to `"Project 08"` everywhere.

### 11.3 — Company placeholder in config
- `"Google, Microsoft, TCS, Zoho..."` in Index.tsx — **Keep as-is**, these are reasonable suggestions for Indian placement prep context.

---

## Backend Endpoints Already Available (No New Backend Work Needed)

The backend already supports everything the cleaned frontend needs:

| Frontend Feature | Backend Endpoint | Status |
|---|---|---|
| Auth (login/register) | `POST /auth/login`, `/auth/register` | Ready |
| User profile | `GET /auth/me` | Ready |
| Start interview | `POST /interview/session`, `/interview/start` | Ready |
| Send messages | `POST /interview/message` | Ready |
| End interview | `POST /interview/end` | Ready |
| Interview history | `GET /interview/history` | Ready |
| Session stats | `GET /interview/stats` | Ready |
| Resume upload | `POST /files/upload-resume` | Ready |
| Speech-to-text | `POST /api/speech-to-text` | Ready |
| Text-to-speech | `POST /api/text-to-speech` | Ready |
| Health check | `GET /health` | Ready |

The `api.ts` service layer already has clients for all of these. No backend changes required for this cleanup.

---

## Execution Order

1. Sections 1-2: Remove debug artifacts and fake stats (quick wins)
2. Section 3: Remove fake recent interviews
3. Sections 4-5: Remove PK avatar and external developer branding
4. Section 6: Restyle PostInterviewReport footer
5. Sections 7-9: Fix form placeholders, roles, dead links
6. Section 10: Delete orphaned auth pages
7. Section 11: Consistency fixes

**Estimated scope:** ~12 targeted edits across 4-5 files. No new components. No backend changes.

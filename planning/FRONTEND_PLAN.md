# AI Interview Agent — Frontend Restructure Plan
*Theme: Current red (#DC2626) + gold (#EAB308) on white. Preserve all existing animations, cockpit, and wave components.*

---

## Problems With Current Frontend

| Problem | Where | Fix |
|---|---|---|
| App called "Project 08" | `Header.tsx`, `<title>`, `index.html` | Rename to **AI Interview Agent** everywhere |
| Auth exists but is a modal overlay — not a proper page | `AuthModal.tsx`, `Header.tsx` | Dedicated `/login` and `/register` routes |
| No role-based UI — candidate sees admin tab, admin sees interview config | `Index.tsx` — no role check | Route-guard + role-aware layouts |
| Resume Claim Parser shown as a top-level tab | `Index.tsx` platformTrack | Move to user Profile page under account settings |
| `📊 Scorecard` tab is just a random component dump | `Index.tsx` | Move to post-interview report OR profile history |
| Platform tabs live inside Index.tsx — no URL routing | `Index.tsx` | Proper React Router pages |
| Coding platform has no real UI — dark box with raw Monaco | `team_a/MonacoEditor.tsx` + Index render | Redesigned split layout with problem sidebar |
| No Settings page | — | Add `/settings` with profile, notification, API prefs |
| No user profile page | — | `/profile` — interview history, scores, resume, settings |
| Admin Dashboard accessible to all | `Index.tsx` — no guard | Only show for `role === 'admin'` or `role === 'faculty'` |
| `team_b/ResumeViewer.tsx` as tab | `Index.tsx` | Move under `/profile` |

---

## New Route Structure

```
/                    → Landing page (unauthenticated: hero + features)
                       (authenticated candidate: redirects to /interview)
                       (authenticated faculty/admin: redirects to /dashboard)

/login               → Login page (full page, not modal)
/register            → Register page (full page)

/interview           → Interview setup + live cockpit (CANDIDATE only)
/interview/[id]      → Existing live session cockpit

/coding              → Coding Assessment platform (CANDIDATE)
  ├── Problem list sidebar
  ├── Monaco editor (main)
  └── Test console (right panel)

/exam/[id]           → Formal exam portal with SEB lockdown (CANDIDATE)

/report/[id]         → Post-interview report: ScoreHero, CompetencyGrid,
                       PrepList, CoachingCards, resources (CANDIDATE)

/profile             → User profile (ALL authenticated)
  ├── Account info (name, email, change password)
  ├── Interview history (past sessions + scores)
  ├── Scorecard history (cross-session)
  ├── Resume → upload + parsed claims viewer (moved from tab)
  └── Notification preferences

/settings            → App settings (ALL authenticated)
  ├── Voice settings (model, speed)
  ├── Interview preferences (default style, difficulty, duration)
  └── Display preferences

/dashboard           → Faculty/Admin dashboard (FACULTY + ADMIN only)
  ├── Cohort overview
  ├── Candidate analytics
  └── Placement drives

/admin               → Admin-only panel (ADMIN only)
  ├── Organization management
  ├── User management
  └── Assessment creation
```

---

## Role-Based Access Control

```
Role         | Routes accessible
-------------|----------------------------------------------------------
CANDIDATE    | /, /interview, /interview/[id], /coding, /exam/[id],
             | /report/[id], /profile, /settings
FACULTY      | /, /dashboard, /profile, /settings
ADMIN        | /, /dashboard, /admin, /profile, /settings
Unauthenticated | / (landing only), /login, /register
```

### AuthContext update needed
Add `role: 'candidate' | 'faculty' | 'admin'` to the `User` interface.
The Cognito JWT payload includes `custom:role` or the `platform_users.role` column.

---

## Component Restructure

### Keep (no changes needed)
- `InterviewSession.tsx` + `CockpitChatStream.tsx` + `CockpitAudioWave.tsx` — these are good
- `PostInterviewReport.tsx` — move to `/report/[id]` route
- `TranscriptDrawer.tsx`
- `ScoreHero.tsx`, `CompetencyGrid.tsx`, `PrepListDisplay.tsx`, `CoachingCardsDisplay.tsx`

### Remove from Index.tsx
- Platform tab nav (`renderPlatformNav`) — replaced by proper React Router
- `platformTrack` state — gone
- All the `{platformTrack === 'x' && renderX()}` conditionals

### New pages to create
```
frontend/src/pages/
  LandingPage.tsx          ← current Index hero + features (unauthenticated)
  InterviewSetup.tsx       ← current Index config form (authenticated candidate)
  CodingPage.tsx           ← redesigned coding platform
  ProfilePage.tsx          ← profile + resume + history + settings
  SettingsPage.tsx         ← voice/interview/display preferences
  DashboardPage.tsx        ← faculty analytics (current AdminDashboard)
  AdminPage.tsx            ← admin org/user management
  LoginPage.tsx            ← full page login
  RegisterPage.tsx         ← full page register
  ReportPage.tsx           ← post-interview report (route /report/:sessionId)
```

### Rename throughout
- "Project 08" → **"AI Interview Agent"**
- `<title>` in `index.html`
- Header logo text
- Footer text
- `<meta>` description
- Auth modal titles
- Toast messages

---

## Coding Page Redesign

**Current problem:** Dark box with a tiny Monaco editor and ugly test console.

**Target layout (3-panel split):**
```
┌────────────────────────────────────────────────────────────┐
│  AI Interview Agent  |  🧩 Coding Assessment  |  [Timer]  │ ← header
├──────────┬──────────────────────────┬─────────────────────┤
│ Problem  │  Monaco Editor           │  Test Console       │
│ Sidebar  │                          │                     │
│          │  Language: [Python ▾]    │  ► Run   ✓ Submit   │
│ Q001     │                          │  ─────────────────  │
│ Two Sum  │  1  def two_sum(nums,    │  Input:             │
│ ● Easy   │  2      target):         │  [5 3 4 2 1]        │
│          │  3      ...              │  ─────────────────  │
│ Q002     │                          │  Output:            │
│ Reverse  │                          │  [0, 1]             │
│ ● Medium │                          │  ─────────────────  │
│          │                          │  ✅ ACCEPTED         │
│          │                          │  Time: 0.021s       │
└──────────┴──────────────────────────┴─────────────────────┘
```

**Styling:**
- Sidebar: white with red accent on active, question difficulty badge
- Editor: VS Code dark theme (already there), proper toolbar with language picker
- Console: dark panel, color-coded status (green ACCEPTED, red WRONG)
- Header: thin bar with timer + submit button

---

## Authentication Pages

### Login Page (`/login`)
- Full-page layout matching current red/gold/white theme
- Left panel: brand illustration / hero text
- Right panel: login form (email, password, forgot password)
- "Don't have an account? Sign Up" link → `/register`
- OAuth buttons (Google) if configured in Cognito
- Error states: red toast

### Register Page (`/register`)
- Same split layout
- Name, email, password, role selection (Candidate / Faculty)
- "Already have an account? Sign In"

### Route guards
```tsx
// ProtectedRoute.tsx — wrap routes that need auth
// RoleRoute.tsx — wrap routes that need specific role
```

---

## Profile Page Structure (`/profile`)

```
┌─────────────────────────────────────────────────────┐
│  👤 Prajeeth H                          [Edit]       │
│  prajeeth@example.com · Candidate · Joined Sep 2026  │
├─────────┬───────────────────────────────────────────┤
│ Account │  Name, Email, Password change             │
│ Resume  │  Upload PDF + parsed skills/claims view   │  ← moved from tab
│ History │  Past interviews with scores + report link│
│ Scores  │  Cross-session scorecard (readiness trend)│
│ Prefs   │  Default voice, difficulty, style         │
└─────────┴───────────────────────────────────────────┘
```

---

## Settings Page (`/settings`)

```
Voice Settings
  • TTS Voice: [Aura-2 Asteria ▾]
  • Speaking Speed: [1.0x slider]

Interview Defaults
  • Default Style: [Formal ▾]
  • Default Difficulty: [Medium ▾]
  • Default Duration: [10 min slider]

Display
  • (future: dark mode toggle)
```

---

## Implementation Order

**Phase 1 — Routing + Auth (do first)**
1. Update `App.tsx` — add React Router pages
2. Create `LoginPage.tsx` + `RegisterPage.tsx` (full pages)
3. Create `ProtectedRoute.tsx` + `RoleRoute.tsx`
4. Update `AuthContext.tsx` — add `role` to User type
5. Update `Header.tsx` — role-aware nav links
6. Rename "Project 08" → "AI Interview Agent" everywhere

**Phase 2 — Page extraction**
7. Extract interview config from Index → `InterviewSetup.tsx`
8. Extract `AdminDashboard` → `DashboardPage.tsx` (with role guard)
9. Create `ProfilePage.tsx` with resume viewer moved in
10. Create `SettingsPage.tsx`
11. Create `ReportPage.tsx` wrapping `PostInterviewReport`

**Phase 3 — Coding page redesign**
12. Build `CodingPage.tsx` with 3-panel layout
13. Redesign `TestConsole.tsx` — color-coded output, proper status
14. Add problem sidebar with difficulty badges

**Phase 4 — Cleanup**
15. Remove `platformTrack` state + tab nav from Index
16. Remove Scorecard as standalone tab (lives in Profile + Report)
17. Remove Resume as standalone tab (lives in Profile)
18. Remove Admin tab from candidate view

---

## Files to Create

```
frontend/src/pages/
  LandingPage.tsx
  LoginPage.tsx
  RegisterPage.tsx
  InterviewSetupPage.tsx
  CodingPage.tsx
  ProfilePage.tsx
  SettingsPage.tsx
  DashboardPage.tsx
  AdminPage.tsx
  ReportPage.tsx

frontend/src/components/
  ProtectedRoute.tsx
  RoleRoute.tsx
  AppNav.tsx          ← role-aware top navigation
  UserMenu.tsx        ← avatar + dropdown (profile, settings, logout)
```

## Files to Modify

```
frontend/src/App.tsx              ← add all routes
frontend/src/pages/Index.tsx      ← simplify to redirect logic only
frontend/src/contexts/AuthContext.tsx ← add role to User
frontend/src/components/Header.tsx   ← role-aware nav
frontend/index.html               ← update title
frontend/src/components/team_a/MonacoEditor.tsx ← new layout
frontend/src/components/team_a/TestConsole.tsx  ← redesign
```

---

## Theme Tokens (DO NOT CHANGE)

```css
--color-primary:    #DC2626;   /* red */
--color-accent:     #EAB308;   /* gold */
--color-text:       #111827;
--color-muted:      #6B7280;
--color-bg:         #FFFFFF;
--color-bg-soft:    #FAFAFA;
--color-border:     #E5E7EB;
--color-border-b:   #EAB308;   /* gold bottom border on cards */
--radius-card:      1rem;
--shadow-card:      0 2px 8px rgba(0,0,0,0.05);
```

All new pages and components must use these tokens. No new colors introduced.

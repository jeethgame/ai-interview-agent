# Overnight Autonomous Work Plan
## Oct 7, 2026 — User sleeping, Claude working solo

> **GitHub:** jeethgame (new account)
> **AWS:** 975903044204, profile p08, ap-south-1
> **Backend:** http://p08-alb-1459152437.ap-south-1.elb.amazonaws.com (LIVE)
> **Frontend:** http://project08-frontend-975903044204.s3-website.ap-south-1.amazonaws.com (LIVE)
> **Rule:** Each stage: implement → test → commit. Only proceed if previous stage works.

---

## What Claude Will Do (autonomous, no user input needed)

### Stage 1: GitHub Repo + Push Code
- Create repo `jeethgame/ai-interview-agent` (public)
- Push all code from `integration/full-merge`
- Verify: repo visible, all files present

### Stage 2: Fix COACH_LLM_PROVIDER in ECS
- Update ECS task definition: add `COACH_LLM_PROVIDER=groq`
- Force new deployment
- Verify: `/health` still 200, LLM configured correctly

### Stage 3: Frontend Fixes (9 items, incremental commits)
- 3a: Unify fallback API URLs (api.ts, AdminDashboard, AuthContext) → all `8010`
- 3b: Update mock deadlines to future dates in CandidateHomePage
- 3c: Dev quick-access buttons auto-submit on LoginPage
- 3d: ExamPage: proper mock data + submit persistence
- 3e: InterviewPage: read `?session=` query param
- 3f: Wire SettingsPage prefs into InterviewPage defaults
- 3g: CodingPage Submit button wired
- 3h: Header candidate logo → `/home`
- 3i: ExamPage timer auto-submit at 0
- After each fix: test locally if possible, commit

### Stage 4: Rebuild + Deploy to AWS
- Rebuild Docker image with all fixes
- Push to ECR
- Update ECS task definition
- Rebuild frontend with ALB URL
- Upload to S3
- Verify: frontend + backend both working on AWS

### Stage 5: CI/CD Pipeline
- Create `.github/workflows/deploy.yml`
- Set up GitHub OIDC + IAM deploy role (if permissions allow)
- Or use repository secrets with AWS keys as fallback
- Push workflow, test auto-deploy

### Stage 6: Cleanup + Documentation
- Update PROJECT_ARCHITECTURE.md with new GitHub repo + AWS URLs
- Update memory with new state
- Write session summary

---

## What User Needs To Do (before sleeping)

1. **Approve this plan** — say "approved" or modify
2. **Keep PC on** — power + wifi + Docker Desktop running
3. **Keep VS Code open** — Claude Code session stays alive
4. That's it. Go sleep.

---

## Rollback Safety

Every stage commits before proceeding. If Stage N breaks:
- Git history has clean state from Stage N-1
- AWS infra is already deployed and stable
- ECS can be rolled back to previous task definition revision

---

## How Claude Will Execute

Using `/loop` skill — self-pacing through stages. Each iteration:
1. Check which stage is current
2. Execute the next step
3. Verify it worked
4. Commit if code changed
5. Move to next step or stage

No user input needed after approval.

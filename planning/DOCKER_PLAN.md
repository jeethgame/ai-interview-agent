# Docker Plan — AI Interview Agent
*How to containerise, share, and run the full stack*

---

## Architecture

```
docker-compose up
        ↓
┌─────────────────┐    ┌─────────────────────┐
│   frontend      │    │   backend           │
│   Vite → Nginx  │◄───│   FastAPI + Uvicorn  │
│   Port 80       │    │   Port 8000         │
└─────────────────┘    └─────────────────────┘
        ↕                       ↕
  CloudFront/S3           SQLite (dev)
  (prod only)          or Supabase PG (prod)
```

---

## Files to Create

```
integrated-interview-agent/
├── Dockerfile.backend          ← FastAPI container
├── Dockerfile.frontend         ← Vite build → Nginx serve
├── docker-compose.yml          ← Wires both together
├── .dockerignore               ← What NOT to copy into images
├── backend/.env.example        ← Template (never .env itself)
└── nginx.conf                  ← Nginx config for frontend
```

---

## Step 1 — Dockerfile.backend

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install deps first (layer cache)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY backend/ ./backend/

ENV PYTHONPATH=/app
EXPOSE 8000

CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## Step 2 — Dockerfile.frontend

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

---

## Step 3 — nginx.conf

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # React SPA — all routes → index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API calls to backend container
    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Proxy WebSocket
    location /ws/ {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## Step 4 — docker-compose.yml

```yaml
version: "3.9"

services:
  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    ports:
      - "8000:8000"
    env_file:
      - backend/.env          # ← loaded from local .env (not committed)
    volumes:
      - ./project08.db:/app/project08.db   # persist SQLite data
    restart: unless-stopped

  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
      args:
        # Build-time env vars baked into the React bundle
        VITE_API_BASE_URL: http://localhost:8000
        VITE_API_WS_URL: ws://localhost:8000
        VITE_SUPABASE_URL: ${VITE_SUPABASE_URL}
        VITE_SUPABASE_ANON_KEY: ${VITE_SUPABASE_ANON_KEY}
    ports:
      - "3000:80"
    depends_on:
      - backend
    restart: unless-stopped
```

> **Note:** Frontend build-time vars (VITE_*) must be passed as `args` because they get baked into the JS bundle at build time — not read at runtime.

---

## Step 5 — .dockerignore

```
# Git + docs
.git/
.gitignore
planning/
docs/
*.md
!backend/README.md

# Your personal MD files
ARCHITECTURE_MASTER_SPECIFICATION.md
INTERVIEW_AGENT_DEEP_DIVE.md
SIMPLE_ARCHITECTURE_DIAGRAMS.md
AZURE_DEPLOYMENT_CHECKLIST.md
CONTEXT.md
FRONTEND_DOCUMENTATION.md
BACKEND_DOCUMENTATION.md
AGENTS.md
CLAUDE.md
GEMINI.md

# Dev artifacts
__pycache__/
*.pyc
*.pyo
.pytest_cache/
backend/venv/
backend/venv312/
frontend/node_modules/
frontend/dist/
.env
*.env.local

# Graph output
graphify-out/
graph.json

# IDE
.vscode/
.idea/
```

---

## Step 6 — backend/.env.example (commit this)

```bash
# Copy this to backend/.env and fill in real values
# NEVER commit backend/.env

COACH_LLM_PROVIDER=groq
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=openai/gpt-oss-120b

DEEPGRAM_API_KEY=your_deepgram_key_here
DEEPGRAM_VOICE=aura-2-asteria-en

DATABASE_URL=sqlite+aiosqlite:///./project08.db
QUESTION_BANK_DATABASE_URL=your_supabase_pg_url_here

JUDGE0_URL=http://your_judge0_ip
JUDGE0_AUTH_TOKEN=your_judge0_token

USE_MOCK_AUTH=true
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8086

SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key
```

---

## Should You Include .env Files?

**NO — NEVER commit .env files.**

| File | Committed? | Why |
|---|---|---|
| `backend/.env` | ❌ Never | Has real API keys |
| `backend/.env.example` | ✅ Yes | Template only, no real values |
| `frontend/.env.local` | ❌ Never | Has Supabase keys |
| `docker-compose.yml` | ✅ Yes | Uses ${VAR} placeholders |

### How friends get the keys:
1. You share keys **separately** (WhatsApp, Telegram, email — NOT GitHub)
2. Friend copies `backend/.env.example` → `backend/.env`
3. Friend fills in the keys you shared
4. Friend runs `docker-compose up`

---

## How Friends Run It (3 commands)

```bash
# 1. Clone the repo
git clone https://github.com/Prajeeth-12/project-08.git
cd integrated-interview-agent

# 2. Set up env (you send them the values)
cp backend/.env.example backend/.env
# → fill in the values

# 3. Run everything
docker-compose up --build
```

Then open: **http://localhost:3000**

---

## Sharing Options

| Method | Setup | Friend needs | Best for |
|---|---|---|---|
| **Docker Compose** (above) | 30 min | Docker Desktop + .env file | Team dev |
| **ngrok tunnel** | 2 min | Nothing | Quick demo |
| **GitHub Codespaces** | 0 min | GitHub account | Browser-only access |
| **Docker Hub image** | 1 hr | Docker Desktop | Public sharing |

---

## ngrok (Fastest — share today)

```bash
# Run locally
docker-compose up

# In another terminal
ngrok http 3000

# Share the https://xxxx.ngrok.io URL with anyone
# They access your running instance from their browser
# No install needed on their end
```

---

## Build & Test Commands

```bash
# Build images
docker-compose build

# Run (foreground, see logs)
docker-compose up

# Run (background)
docker-compose up -d

# Stop
docker-compose down

# Rebuild after code changes
docker-compose up --build

# See logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Shell into backend container (debug)
docker exec -it integrated-interview-agent_backend_1 bash
```

---

## What to Ignore in Docker (MD files)

Your personal MD files are already in `.dockerignore` above:
- `ARCHITECTURE_MASTER_SPECIFICATION.md`
- `INTERVIEW_AGENT_DEEP_DIVE.md`
- `planning/` (entire folder)
- `docs/` (entire folder)
- `*.md` (all markdown at root level)
- `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`

These never enter the Docker image — they're dev-only docs.

---

## Implementation Order

```
[ ] 1. Create .dockerignore
[ ] 2. Create backend/.env.example
[ ] 3. Create nginx.conf
[ ] 4. Create Dockerfile.backend
[ ] 5. Create Dockerfile.frontend
[ ] 6. Create docker-compose.yml
[ ] 7. Test: docker-compose up --build
[ ] 8. Fix any build errors
[ ] 9. Share .env.example + keys separately with friends
[ ] 10. Friends run: git clone → fill .env → docker-compose up
```

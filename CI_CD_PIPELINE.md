# CI/CD Pipeline Architecture

This document describes the automated Continuous Integration and Continuous Deployment (CI/CD) pipeline for the **AI Interview Platform** configured in [`.github/workflows/deploy.yml`](file:///.github/workflows/deploy.yml).

---

## 1. Pipeline Overview & Flowchart

```mermaid
flowchart TD
    %% Trigger
    subgraph Trigger ["1. Trigger Event"]
        PushMain["git push origin main"]
    end

    %% CI Quality Gates
    subgraph CI ["2. Continuous Integration (Parallel Quality Gates)"]
        direction TB
        subgraph BackendChecks ["Job: backend-checks (ubuntu-latest)"]
            PySetup["Python 3.11 Setup (cache: pip)"]
            PipInst["pip install -r backend/requirements.txt"]
            RuffLint["Ruff Linter (ruff==0.16.10 check backend/)"]
            PyTest["Pytest Smoke Suite (USE_MOCK_AUTH=true, USE_MOCK_DB=true)"]
            PySetup --> PipInst --> RuffLint --> PyTest
        end

        subgraph FrontendChecks ["Job: frontend-checks (ubuntu-latest)"]
            NodeSetup["Node 20 Setup (cache: npm)"]
            NpmCi["npm ci (frontend)"]
            TscCheck["TypeScript Compiler (npx tsc --noEmit)"]
            NodeSetup --> NpmCi --> TscCheck
        end
    end

    %% CD Deployment Jobs
    subgraph CD ["3. Continuous Deployment (Automated Releases)"]
        direction TB
        subgraph DeployFE ["Job: deploy-frontend (Cloudflare Pages)"]
            needsFE["needs: [frontend-checks]"]
            ViteBuild["Vite Production Build (dist/)"]
            Wrangler["Wrangler Deploy (ai-interview)"]
            needsFE --> ViteBuild --> Wrangler
        end

        subgraph DeployBE ["Job: deploy-backend (AWS ECS Fargate & S3)"]
            needsAll["needs: [backend-checks, frontend-checks]"]
            AwsAuth["AWS Configure Credentials (ap-south-1)"]
            EcrLogin["Amazon ECR Login"]
            DockerBuild["Build Docker Image (Dockerfile.backend)"]
            EcrPush["Push Image to ECR (:github.sha)"]
            TaskDefUpdate["Update Task Def (USE_MOCK_AUTH=false, CORS, Image)"]
            EcsUpdate["ECS Update Service (force-new-deployment)"]
            EcsStable["ECS Wait Services Stable"]
            S3Sync["Sync Frontend Backup (s3://project08-frontend-...)"]

            needsAll --> AwsAuth --> EcrLogin --> DockerBuild --> EcrPush
            EcrPush --> TaskDefUpdate --> EcsUpdate --> EcsStable --> S3Sync
        end
    end

    %% Production Environments
    subgraph Production ["4. Live Production Targets"]
        CFPages["Cloudflare Pages: https://ai-interview-7r1.pages.dev"]
        ECSService["AWS ECS Backend: https://api.prajeeth.tech"]
        S3Bucket["AWS S3 Backup Bucket"]
    end

    %% Connections
    PushMain --> BackendChecks
    PushMain --> FrontendChecks

    FrontendChecks --> DeployFE
    BackendChecks --> DeployBE
    FrontendChecks --> DeployBE

    Wrangler --> CFPages
    EcsStable --> ECSService
    S3Sync --> S3Bucket

    %% Styling
    classDef trigger fill:#EFF6FF,stroke:#3B82F6,stroke-width:2px,color:#1E3A8A;
    classDef gate fill:#FEF3C7,stroke:#D97706,stroke-width:2px,color:#92400E;
    classDef deploy fill:#ECFDF5,stroke:#10B981,stroke-width:2px,color:#065F46;
    classDef prod fill:#FDF2F8,stroke:#DB2777,stroke-width:2px,color:#831843;

    class PushMain trigger;
    class BackendChecks,FrontendChecks gate;
    class DeployFE,DeployBE deploy;
    class CFPages,ECSService,S3Bucket prod;
```

---

## 2. End-to-End Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer
    participant GH as GitHub Actions
    participant PyLint as Backend CI (Python 3.11)
    participant TsCheck as Frontend CI (Node 20)
    participant CF as Cloudflare Pages
    participant ECR as AWS ECR (ap-south-1)
    participant ECS as AWS ECS Fargate
    participant S3 as AWS S3 Bucket

    Dev->>GH: git push origin main
    Note over GH: deploy.yml triggered

    par Parallel CI Quality Gates
        GH->>PyLint: Run backend-checks
        PyLint->>PyLint: pip install dependencies
        PyLint->>PyLint: ruff check backend/ (pinned v0.16.10)
        PyLint->>PyLint: pytest tests/ (mock auth & db)
        PyLint-->>GH: backend-checks PASSED

        GH->>TsCheck: Run frontend-checks
        TsCheck->>TsCheck: npm ci (frontend)
        TsCheck->>TsCheck: npx tsc --noEmit (strict type check)
        TsCheck-->>GH: frontend-checks PASSED
    end

    par Independent CD Deployment
        Note over GH,CF: deploy-frontend (needs: frontend-checks)
        GH->>CF: Build Vite bundle (API: https://api.prajeeth.tech)
        GH->>CF: wrangler pages deploy dist --project-name ai-interview
        CF-->>GH: Deployed to Cloudflare Pages

    and Full Stack Backend CD
        Note over GH,ECS: deploy-backend (needs: backend-checks & frontend-checks)
        GH->>ECR: Docker build (Dockerfile.backend) & push :github.sha
        GH->>ECS: Register new Task Definition (USE_MOCK_AUTH=false)
        GH->>ECS: Update Service (force-new-deployment)
        ECS->>ECS: Provision tasks & verify health checks
        ECS-->>GH: ECS tasks stable
        GH->>S3: aws s3 sync dist/ s3://$S3_BUCKET/ (Backup)
        S3-->>GH: S3 assets synced
    end

    GH-->>Dev: Pipeline Succeeded (Production Live)
```

---

## 3. Pipeline Stages & Specifications

### Stage 1: `backend-checks` (CI)
- **Runner**: `ubuntu-latest`
- **Runtime**: Python `3.11` (pip cache enabled)
- **Quality Checks**:
  1. **Dependencies**: `pip install -r backend/requirements.txt`
  2. **Static Analysis & Linting**: `ruff check backend/` using pinned `ruff==0.16.10`. Blocks deployment on undefined symbols, missing imports, or syntax violations.
  3. **Unit & Smoke Tests**: `pytest tests/ -x -q` run with `USE_MOCK_AUTH=true` and `USE_MOCK_DB=true`. Non-zero exit codes immediately abort the pipeline.

### Stage 2: `frontend-checks` (CI)
- **Runner**: `ubuntu-latest`
- **Runtime**: Node.js `20` (npm cache enabled via `package-lock.json`)
- **Quality Checks**:
  1. **Dependencies**: `npm ci` in `frontend/`
  2. **Type Safety**: `npx tsc --noEmit`. Compiles all TypeScript (`.ts`, `.tsx`) files in strict mode with no file output to guarantee zero runtime missing-prop or type errors.

### Stage 3: `deploy-frontend` (CD)
- **Prerequisite**: Depends on `frontend-checks`. Runs independently of backend deployments so frontend assets can deploy immediately once validated.
- **Environment**:
  - `VITE_API_BASE_URL`: `https://api.prajeeth.tech`
  - `VITE_API_WS_URL`: `wss://api.prajeeth.tech`
  - `CLOUDFLARE_API_TOKEN`: GitHub Secret
- **Deployment**:
  - `npm run build` (Vite)
  - `npx wrangler pages deploy dist --project-name ai-interview`
  - **Live URL**: `https://ai-interview-7r1.pages.dev`

### Stage 4: `deploy-backend` (CD)
- **Prerequisite**: Depends on both `backend-checks` and `frontend-checks`. Production infrastructure is never touched if any CI check fails.
- **Target Infrastructure**:
  - **AWS Region**: `ap-south-1` (Mumbai)
  - **ECR Registry**: `975903044204.dkr.ecr.ap-south-1.amazonaws.com`
  - **ECR Repository**: `project08-backend`
  - **ECS Cluster**: `project08`
  - **ECS Service**: `backend` (Fargate)
  - **ECS Task Family**: `project08-backend`
  - **S3 Bucket (Backup)**: `project08-frontend-975903044204`
- **Execution Flow**:
  1. Authenticates with AWS using IAM credentials via `aws-actions/configure-aws-credentials@v4`.
  2. Logs into Amazon ECR via `aws-actions/amazon-ecr-login@v2`.
  3. Builds Docker container using [`Dockerfile.backend`](file:///Dockerfile.backend) tagged with `git commit SHA` and pushes to ECR.
  4. Fetches active task definition via AWS CLI, injects the new container image, updates production CORS origins, sets `USE_MOCK_AUTH="false"` (enabling real AWS Cognito authentication), and registers the new revision.
  5. Triggers zero-downtime rolling deployment with `aws ecs update-service --force-new-deployment`.
  6. Waits for cluster stabilization with `aws ecs wait services-stable`.
  7. Syncs frontend distribution build to S3 as an immutable static backup.

---

## 4. Environment & Secrets Mapping

| Secret / Config | Destination | Purpose |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare Pages | Authentication for Wrangler deployment |
| `AWS_ACCESS_KEY_ID` | AWS IAM | Permission to build ECR, update ECS, and sync S3 |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM | Secret credential for AWS CLI actions |
| `AWS_REGION` | GitHub Actions env | Target AWS region (`ap-south-1`) |
| `USE_MOCK_AUTH="false"` | ECS Task Definition | Enforces real Cognito RS256 token verification in production |
| `CORS_ALLOWED_ORIGINS` | ECS Task Definition | Whitelists Cloudflare Pages, custom domain, and load balancer |

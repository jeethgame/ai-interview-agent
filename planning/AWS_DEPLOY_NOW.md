# AWS Deploy — Execution Plan (Revised)
## ECS Fargate + RDS PostgreSQL (private) + S3/CloudFront + Secrets Manager

> **AWS Account:** 686255945387
> **Region:** us-west-2
> **Target users:** 5–10 (college placement demo)
> **Auth:** Mock JWT now. Cognito cutover documented in Phase 2.
> **Branch:** `main` deploys production. Feature branches → PR → main.

---

## Architecture (simple, cheap, secure)

```
Internet
   │
   ├── CloudFront (OAC) → S3 bucket (React SPA, private bucket)
   │
   └── ALB (:80) → ECS Fargate (1 task, FastAPI :8000)
                         │
                         └── RDS PostgreSQL (private, ECS-only access)

Secrets Manager holds: DATABASE_URL, GROQ_API_KEY, DEEPGRAM_API_KEY, etc.
GitHub Actions deploys via OIDC (no long-lived AWS keys).
Images tagged by Git SHA (not :latest). Rollback = redeploy old SHA.
```

**Tradeoff documented:** ECS tasks run in public subnets with public IPs to avoid NAT Gateway cost (~$32/mo). RDS stays private (no public IP, only reachable from ECS_SG). This is acceptable for a 5–10 user demo deployment.

---

## Order of Operations

```
PHASE 1: AWS Infra + Deploy (0:00–1:00)
  ├── 1.1  ECR repo (backend only — no frontend ECR)
  ├── 1.2  VPC: default VPC + security groups
  ├── 1.3  RDS PostgreSQL (PRIVATE, no public access)
  ├── 1.4  Secrets Manager (all credentials)
  ├── 1.5  ALB + target group
  ├── 1.6  ECS cluster + IAM roles + task definition + service
  ├── 1.7  S3 bucket (private) + CloudFront (OAC)
  ├── 1.8  Build + push backend image (tagged by SHA)
  ├── 1.9  Run Alembic migration
  ├── 1.10 Deploy ECS + upload frontend to S3
  └── 1.11 Verify end-to-end

PHASE 1.5: CI/CD (1:00–1:30)
  ├── 1.5.1 GitHub OIDC provider + IAM deploy role
  ├── 1.5.2 .github/workflows/deploy.yml
  └── 1.5.3 Test: merge to main → auto-deploy

PHASE 2 (later, not today):
  ├── Cognito auth cutover
  ├── S3 presigned uploads for resumes
  └── SQS + worker for async eval

PHASE 3 (only if needed):
  ├── Redis/ElastiCache
  ├── Autoscaling
  └── Monitoring/alerts
```

---

## Phase 1 — Infrastructure + Deploy

### 1.1 ECR Repository (backend only)

```bash
aws ecr create-repository --repository-name project08-backend --region us-west-2 --image-tag-mutability MUTABLE
```

No frontend ECR — React builds go to S3.

### 1.2 VPC + Security Groups

```bash
# Get default VPC
DEFAULT_VPC=$(aws ec2 describe-vpcs --filters "Name=is-default,Values=true" \
  --query "Vpcs[0].VpcId" --output text)

# Get 2 subnets in different AZs (required for ALB + RDS)
SUBNET_A=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$DEFAULT_VPC" \
  --query "Subnets[0].SubnetId" --output text)
SUBNET_B=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$DEFAULT_VPC" \
  --query "Subnets[1].SubnetId" --output text)

# ALB security group — public HTTP only
ALB_SG=$(aws ec2 create-security-group \
  --group-name p08-alb-sg --description "ALB public HTTP" \
  --vpc-id $DEFAULT_VPC --query "GroupId" --output text)
aws ec2 authorize-security-group-ingress \
  --group-id $ALB_SG --protocol tcp --port 80 --cidr 0.0.0.0/0

# ECS security group — port 8000 from ALB only
ECS_SG=$(aws ec2 create-security-group \
  --group-name p08-ecs-sg --description "ECS from ALB only" \
  --vpc-id $DEFAULT_VPC --query "GroupId" --output text)
aws ec2 authorize-security-group-ingress \
  --group-id $ECS_SG --protocol tcp --port 8000 --source-group $ALB_SG

# RDS security group — port 5432 from ECS only (NOT public)
RDS_SG=$(aws ec2 create-security-group \
  --group-name p08-rds-sg --description "RDS from ECS only" \
  --vpc-id $DEFAULT_VPC --query "GroupId" --output text)
aws ec2 authorize-security-group-ingress \
  --group-id $RDS_SG --protocol tcp --port 5432 --source-group $ECS_SG
```

### 1.3 RDS PostgreSQL (PRIVATE)

```bash
# DB subnet group
aws rds create-db-subnet-group \
  --db-subnet-group-name p08-db-subnets \
  --db-subnet-group-description "Project08 DB subnets" \
  --subnet-ids $SUBNET_A $SUBNET_B

# Create RDS — NOT publicly accessible
aws rds create-db-instance \
  --db-instance-identifier project08-db \
  --db-instance-class db.t3.micro \
  --engine postgres --engine-version 15 \
  --master-username p08admin \
  --master-user-password "$(openssl rand -base64 24)" \
  --allocated-storage 20 \
  --db-name project08 \
  --vpc-security-group-ids $RDS_SG \
  --db-subnet-group-name p08-db-subnets \
  --no-multi-az \
  --no-publicly-accessible \
  --backup-retention-period 1

# Wait (~5-8 min)
aws rds wait db-instance-available --db-instance-identifier project08-db

# Get private endpoint
RDS_HOST=$(aws rds describe-db-instances \
  --db-instance-identifier project08-db \
  --query "DBInstances[0].Endpoint.Address" --output text)
echo "RDS endpoint (private): $RDS_HOST"
```

**RDS password:** Generated randomly by `openssl rand`. Stored in Secrets Manager (next step). Never written to any file in the repo.

### 1.4 Secrets Manager

```bash
# Store all secrets in one JSON secret
aws secretsmanager create-secret \
  --name project08/backend \
  --description "Project08 backend secrets" \
  --secret-string "{
    \"DATABASE_URL\": \"postgresql+asyncpg://p08admin:<RDS_PASSWORD>@$RDS_HOST:5432/project08\",
    \"GROQ_API_KEY\": \"<PASTE_FROM_BACKEND_ENV>\",
    \"GROQ_BASE_URL\": \"https://api.groq.com/openai\",
    \"DEEPGRAM_API_KEY\": \"<PASTE_FROM_BACKEND_ENV>\",
    \"JUDGE0_URL\": \"http://13.233.179.205:2358\",
    \"JUDGE0_AUTH_TOKEN\": \"<PASTE_FROM_BACKEND_ENV>\",
    \"SUPABASE_URL\": \"<PASTE_FROM_BACKEND_ENV>\",
    \"SUPABASE_SERVICE_KEY\": \"<PASTE_FROM_BACKEND_ENV>\",
    \"QUESTION_BANK_DATABASE_URL\": \"<PASTE_FROM_BACKEND_ENV>\",
    \"SECRET_KEY\": \"$(openssl rand -hex 32)\"
  }"

# Get ARN for task definition
SECRET_ARN=$(aws secretsmanager describe-secret \
  --secret-id project08/backend \
  --query "ARN" --output text)
echo "Secret ARN: $SECRET_ARN"
```

**Important:** Replace `<PASTE_FROM_BACKEND_ENV>` placeholders with real values from `backend/.env` when running this command. Do NOT commit the command with real keys.

### 1.5 ALB + Target Group

```bash
# Create ALB
ALB_ARN=$(aws elbv2 create-load-balancer \
  --name p08-alb \
  --subnets $SUBNET_A $SUBNET_B \
  --security-groups $ALB_SG \
  --scheme internet-facing --type application \
  --query "LoadBalancers[0].LoadBalancerArn" --output text)

# Target group (IP type for Fargate)
TG_ARN=$(aws elbv2 create-target-group \
  --name p08-backend-tg \
  --protocol HTTP --port 8000 \
  --vpc-id $DEFAULT_VPC --target-type ip \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --healthy-threshold-count 2 \
  --query "TargetGroups[0].TargetGroupArn" --output text)

# Listener
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTP --port 80 \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN

# Get ALB DNS
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns $ALB_ARN \
  --query "LoadBalancers[0].DNSName" --output text)
echo "Backend URL: http://$ALB_DNS"
```

### 1.6 ECS Cluster + IAM Roles + Task Definition

```bash
# Cluster
aws ecs create-cluster --cluster-name project08

# Log group
aws logs create-log-group --log-group-name /ecs/project08-backend

# ECS task execution role (pulls ECR images + reads Secrets Manager + writes logs)
aws iam create-role --role-name p08-ecs-execution \
  --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{
      "Effect":"Allow",
      "Principal":{"Service":"ecs-tasks.amazonaws.com"},
      "Action":"sts:AssumeRole"
    }]
  }'

aws iam attach-role-policy --role-name p08-ecs-execution \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# Grant Secrets Manager read to execution role
aws iam put-role-policy --role-name p08-ecs-execution \
  --policy-name SecretsAccess \
  --policy-document "{
    \"Version\":\"2012-10-17\",
    \"Statement\":[{
      \"Effect\":\"Allow\",
      \"Action\":[\"secretsmanager:GetSecretValue\"],
      \"Resource\":\"$SECRET_ARN\"
    }]
  }"

EXECUTION_ROLE_ARN="arn:aws:iam::686255945387:role/p08-ecs-execution"
```

**Task definition:** Created as `infra/task-definition.json` in the repo.

Secrets come from Secrets Manager via `secrets` block (not `environment`):

```json
{
  "family": "project08-backend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "<EXECUTION_ROLE_ARN>",
  "containerDefinitions": [{
    "name": "backend",
    "image": "686255945387.dkr.ecr.us-west-2.amazonaws.com/project08-backend:<GIT_SHA>",
    "portMappings": [{"containerPort": 8000, "protocol": "tcp"}],
    "environment": [
      {"name": "USE_MOCK_AUTH", "value": "true"},
      {"name": "GROQ_MODEL", "value": "openai/gpt-oss-120b"},
      {"name": "DEEPGRAM_VOICE", "value": "aura-2-asteria-en"},
      {"name": "CORS_ALLOWED_ORIGINS", "value": "http://<ALB_DNS>,https://<CLOUDFRONT_DOMAIN>"},
      {"name": "PYTHONUNBUFFERED", "value": "1"}
    ],
    "secrets": [
      {"name": "DATABASE_URL", "valueFrom": "<SECRET_ARN>:DATABASE_URL::"},
      {"name": "GROQ_API_KEY", "valueFrom": "<SECRET_ARN>:GROQ_API_KEY::"},
      {"name": "GROQ_BASE_URL", "valueFrom": "<SECRET_ARN>:GROQ_BASE_URL::"},
      {"name": "DEEPGRAM_API_KEY", "valueFrom": "<SECRET_ARN>:DEEPGRAM_API_KEY::"},
      {"name": "SECRET_KEY", "valueFrom": "<SECRET_ARN>:SECRET_KEY::"},
      {"name": "QUESTION_BANK_DATABASE_URL", "valueFrom": "<SECRET_ARN>:QUESTION_BANK_DATABASE_URL::"},
      {"name": "SUPABASE_URL", "valueFrom": "<SECRET_ARN>:SUPABASE_URL::"},
      {"name": "SUPABASE_SERVICE_KEY", "valueFrom": "<SECRET_ARN>:SUPABASE_SERVICE_KEY::"},
      {"name": "JUDGE0_URL", "valueFrom": "<SECRET_ARN>:JUDGE0_URL::"},
      {"name": "JUDGE0_AUTH_TOKEN", "valueFrom": "<SECRET_ARN>:JUDGE0_AUTH_TOKEN::"}
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/project08-backend",
        "awslogs-region": "us-west-2",
        "awslogs-stream-prefix": "ecs"
      }
    }
  }]
}
```

### 1.7 S3 (private) + CloudFront (OAC)

```bash
# Create private S3 bucket (no public access)
ACCOUNT_ID=686255945387
BUCKET_NAME="project08-frontend-$ACCOUNT_ID"
aws s3 mb "s3://$BUCKET_NAME" --region us-west-2

# Block all public access
aws s3api put-public-access-block --bucket $BUCKET_NAME \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Create CloudFront OAC
OAC_ID=$(aws cloudfront create-origin-access-control \
  --origin-access-control-config \
  "Name=p08-oac,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3" \
  --query "OriginAccessControl.Id" --output text)

# Create CloudFront distribution
# (use aws cloudfront create-distribution with JSON config)
# Key settings:
#   Origin: $BUCKET_NAME.s3.us-west-2.amazonaws.com
#   OAC: $OAC_ID
#   DefaultRootObject: index.html
#   CustomErrorResponses: 403/404 → /index.html (SPA routing)
#   CacheBehavior: assets/* → CachePolicy Managed-CachingOptimized
#   Default: no-cache for index.html

# After distribution created, add bucket policy granting CloudFront read:
# Principal: cloudfront.amazonaws.com
# Condition: StringEquals aws:SourceArn = <distribution ARN>
```

### 1.8 Build + Push Backend Image

```bash
# ECR login
aws ecr get-login-password --region us-west-2 | \
  docker login --username AWS --password-stdin \
  686255945387.dkr.ecr.us-west-2.amazonaws.com

# Build
GIT_SHA=$(git rev-parse --short HEAD)
docker build -f Dockerfile.backend \
  -t 686255945387.dkr.ecr.us-west-2.amazonaws.com/project08-backend:$GIT_SHA .

# Push (SHA tag only — no :latest)
docker push 686255945387.dkr.ecr.us-west-2.amazonaws.com/project08-backend:$GIT_SHA
echo "Image: project08-backend:$GIT_SHA"
```

### 1.9 Alembic Migration

Run from a machine that can reach RDS. Since RDS is private, either:
- **Option A:** Run as one-off ECS task (recommended)
- **Option B:** Temporarily allow your IP in RDS_SG, run locally, then revoke

```bash
# Option A: one-off ECS task
aws ecs run-task \
  --cluster project08 \
  --task-definition project08-backend \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_A],securityGroups=[$ECS_SG],assignPublicIp=ENABLED}" \
  --overrides '{
    "containerOverrides":[{
      "name":"backend",
      "command":["python","-m","alembic","upgrade","head"]
    }]
  }'
```

### 1.10 Deploy ECS Service + Upload Frontend

```bash
# Register task definition (with real SHA + ARNs filled in)
aws ecs register-task-definition --cli-input-json file://infra/task-definition.json

# Create service (1 task — sufficient for 5-10 users)
aws ecs create-service \
  --cluster project08 \
  --service-name backend \
  --task-definition project08-backend \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={
    subnets=[$SUBNET_A,$SUBNET_B],
    securityGroups=[$ECS_SG],
    assignPublicIp=ENABLED
  }" \
  --load-balancers "targetGroupArn=$TG_ARN,containerName=backend,containerPort=8000"

aws ecs wait services-stable --cluster project08 --services backend
echo "Backend: http://$ALB_DNS/health"

# Build + upload frontend
cd frontend
VITE_API_BASE_URL="http://$ALB_DNS" npm run build
aws s3 sync dist/ "s3://$BUCKET_NAME/" --delete
echo "Frontend: https://<CLOUDFRONT_DOMAIN>"
```

### 1.11 Verify

```bash
curl "http://$ALB_DNS/health"                    # 200 + JSON
curl -X POST "http://$ALB_DNS/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@dev.example.com","password":"Test1234!"}'  # JWT returned
# Open CloudFront URL in browser → login page renders
```

---

## Phase 1.5 — CI/CD (GitHub Actions + OIDC)

### 1.5.1 GitHub OIDC Provider + Deploy Role

```bash
# Create OIDC provider for GitHub Actions
aws iam create-open-id-connect-provider \
  --url "https://token.actions.githubusercontent.com" \
  --client-id-list "sts.amazonaws.com" \
  --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1"

# Create deploy role
aws iam create-role --role-name p08-github-deploy \
  --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{
      "Effect":"Allow",
      "Principal":{"Federated":"arn:aws:iam::686255945387:oidc-provider/token.actions.githubusercontent.com"},
      "Action":"sts:AssumeRoleWithWebIdentity",
      "Condition":{
        "StringEquals":{
          "token.actions.githubusercontent.com:aud":"sts.amazonaws.com"
        },
        "StringLike":{
          "token.actions.githubusercontent.com:sub":"repo:Prajeeth-12/project-08:ref:refs/heads/main"
        }
      }
    }]
  }'

# Attach minimum permissions
aws iam put-role-policy --role-name p08-github-deploy \
  --policy-name DeployPermissions \
  --policy-document '{
    "Version":"2012-10-17",
    "Statement":[
      {
        "Effect":"Allow",
        "Action":["ecr:GetAuthorizationToken"],
        "Resource":"*"
      },
      {
        "Effect":"Allow",
        "Action":["ecr:BatchCheckLayerAvailability","ecr:GetDownloadUrlForLayer","ecr:BatchGetImage","ecr:PutImage","ecr:InitiateLayerUpload","ecr:UploadLayerPart","ecr:CompleteLayerUpload"],
        "Resource":"arn:aws:ecr:us-west-2:686255945387:repository/project08-backend"
      },
      {
        "Effect":"Allow",
        "Action":["ecs:UpdateService","ecs:DescribeServices","ecs:RegisterTaskDefinition","ecs:RunTask","ecs:DescribeTasks"],
        "Resource":"*",
        "Condition":{"StringEquals":{"ecs:cluster":"arn:aws:ecs:us-west-2:686255945387:cluster/project08"}}
      },
      {
        "Effect":"Allow",
        "Action":["ecs:RegisterTaskDefinition"],
        "Resource":"*"
      },
      {
        "Effect":"Allow",
        "Action":["iam:PassRole"],
        "Resource":"arn:aws:iam::686255945387:role/p08-ecs-execution"
      },
      {
        "Effect":"Allow",
        "Action":["s3:PutObject","s3:DeleteObject","s3:ListBucket"],
        "Resource":["arn:aws:s3:::project08-frontend-686255945387","arn:aws:s3:::project08-frontend-686255945387/*"]
      },
      {
        "Effect":"Allow",
        "Action":["cloudfront:CreateInvalidation"],
        "Resource":"*"
      }
    ]
  }'
```

### 1.5.2 GitHub Actions Workflow

**File:** `.github/workflows/deploy.yml`

```yaml
name: Deploy to AWS
on:
  push:
    branches:
      - main

permissions:
  id-token: write
  contents: read

env:
  AWS_REGION: us-west-2
  ECR_REGISTRY: 686255945387.dkr.ecr.us-west-2.amazonaws.com
  ECR_REPO: project08-backend
  ECS_CLUSTER: project08
  ECS_SERVICE: backend
  ECS_TASK_FAMILY: project08-backend
  S3_BUCKET: project08-frontend-686255945387

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::686255945387:role/p08-github-deploy
          aws-region: us-west-2

      - name: ECR Login
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build + push backend image (SHA tagged)
        run: |
          IMAGE="$ECR_REGISTRY/$ECR_REPO:${{ github.sha }}"
          docker build -f Dockerfile.backend -t $IMAGE .
          docker push $IMAGE
          echo "IMAGE=$IMAGE" >> $GITHUB_ENV

      - name: Update ECS task definition with new image
        run: |
          # Get current task def, swap image, register new revision
          TASK_DEF=$(aws ecs describe-task-definition --task-definition $ECS_TASK_FAMILY --query "taskDefinition" --output json)
          NEW_DEF=$(echo $TASK_DEF | jq --arg IMAGE "$IMAGE" '
            .containerDefinitions[0].image = $IMAGE |
            del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)
          ')
          echo "$NEW_DEF" > /tmp/new-task-def.json
          aws ecs register-task-definition --cli-input-json file:///tmp/new-task-def.json

      - name: Deploy ECS service
        run: |
          aws ecs update-service \
            --cluster $ECS_CLUSTER \
            --service $ECS_SERVICE \
            --task-definition $ECS_TASK_FAMILY \
            --force-new-deployment
          aws ecs wait services-stable --cluster $ECS_CLUSTER --services $ECS_SERVICE

      - name: Build + deploy frontend
        run: |
          cd frontend
          npm ci
          ALB_DNS=$(aws elbv2 describe-load-balancers --names p08-alb --query "LoadBalancers[0].DNSName" --output text)
          VITE_API_BASE_URL="http://$ALB_DNS" npm run build
          aws s3 sync dist/ "s3://$S3_BUCKET/" --delete

      - name: CloudFront invalidation
        run: |
          DIST_ID=$(aws cloudfront list-distributions --query "DistributionList.Items[?contains(Origins.Items[0].DomainName,'project08-frontend')].Id" --output text)
          if [ -n "$DIST_ID" ]; then
            aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/*"
          fi
```

**No GitHub secrets needed** — OIDC handles auth. No `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` stored anywhere.

### 1.5.3 Rollback

```bash
# Rollback = deploy a previous known-good SHA
aws ecs update-service --cluster project08 --service backend \
  --task-definition project08-backend:<previous-revision> \
  --force-new-deployment
```

Every deployment creates a new task definition revision with the exact Git SHA image. Old revisions are preserved in ECS.

---

## Phase 2 — Later (Cognito Auth Cutover)

When ready to switch from mock to real auth:

1. `USE_MOCK_AUTH=false` in ECS task environment
2. Create Cognito User Pool with `candidate`/`faculty`/`admin` groups
3. Set `COGNITO_USER_POOL_ID` + `COGNITO_CLIENT_ID` in Secrets Manager
4. Frontend: configure Cognito login/signup flow
5. Backend: `auth_api.py` already has Cognito JWKS validation — just needs real pool IDs
6. Redeploy

No code changes needed in `auth_api.py` — it already checks `_cognito_available()` and falls through to mock when Cognito vars are empty.

---

## Phase 2 — Later (Other features)

| Feature | What to add | When |
|---|---|---|
| S3 presigned uploads | Resume PDFs upload to S3 instead of local disk | When resume upload is tested |
| SQS + Worker | Async scorecard generation after interview ends | When blocking eval is a problem |
| HTTPS | ACM cert + ALB HTTPS listener (port 443) | Before sharing with real users |
| Custom domain | Route 53 hosted zone | When you have a domain |

---

## Phase 3 — Only If Actually Needed

| Feature | When |
|---|---|
| Redis/ElastiCache | If session state must survive ECS task restart |
| ECS autoscaling | If >10 concurrent users |
| CloudWatch alarms | If you need uptime monitoring |
| WAF | If exposed to public internet long-term |

---

## Cost Estimate (5–10 users, demo)

| Service | Monthly | Notes |
|---|---|---|
| ECS Fargate (1 task, 0.5 vCPU, 1GB) | ~$15 | Stop when not demoing |
| RDS t3.micro (PostgreSQL 15) | ~$15 | Stop when not demoing |
| ALB | ~$16 | Hourly charge |
| S3 + CloudFront | ~$1 | Minimal traffic |
| ECR | ~$1 | Image storage |
| Secrets Manager | ~$0.40 | 1 secret |
| **Total (running)** | **~$48/mo** | |
| **Stopped after demo** | **~$2** | Just S3 + ECR storage |

---

## Files to Create in Repo

| File | Purpose |
|---|---|
| `infra/task-definition.json` | ECS task def with Secrets Manager refs (no credentials in file) |
| `.github/workflows/deploy.yml` | CI/CD: OIDC → build → push SHA → update ECS → S3 sync |
| `infra/deploy.sh` | Optional: one-shot script combining all Phase 1 CLI commands |

---

## After Deploy — Frontend Fix Priority

These fixes go through the new CI/CD (merge to main → auto-deploy):

1. Unify fallback API URLs → ALB DNS
2. Update mock deadlines to future dates
3. ExamPage mock data + submit
4. InterviewPage read `?session=` param
5. Wire SettingsPage prefs
6. CodingPage Submit button
7. Header candidate logo → `/home`

---

*Revised Oct 2026 · Account 686255945387 · Region us-west-2 · 5–10 users*

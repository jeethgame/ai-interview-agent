# AWS Deploy — Ready Commands for Linux

## What's already done (from Windows session):
- ECR repo: `975903044204.dkr.ecr.ap-south-1.amazonaws.com/project08-backend` ✅
- VPC + Security Groups: ALB_SG, ECS_SG, RDS_SG ✅
- RDS PostgreSQL: `project08-db.c78so622uwyk.ap-south-1.rds.amazonaws.com` (private) ✅
- Secrets Manager: `project08/backend` with all API keys ✅
- ALB: `p08-alb-1459152437.ap-south-1.elb.amazonaws.com` ✅
- ECS Cluster + Task Definition registered ✅
- S3 frontend: `project08-frontend-975903044204` with React build uploaded ✅
- ECS service created but WAITING for Docker image in ECR ❌

## What you need to do on Linux:

### Step 1: Login to AWS
```bash
aws login --profile p08
# Or configure manually:
aws configure --profile p08
# Region: ap-south-1
# Account: 975903044204
```

### Step 2: Build and push Docker image
```bash
git clone -b integration/full-merge https://github.com/Prajeeth-12/project-08.git
cd project-08

# ECR login
aws ecr get-login-password --region ap-south-1 --profile p08 | \
  docker login --username AWS --password-stdin \
  975903044204.dkr.ecr.ap-south-1.amazonaws.com

# Build
docker build -f Dockerfile.backend \
  -t 975903044204.dkr.ecr.ap-south-1.amazonaws.com/project08-backend:c68b66d .

# Push
docker push 975903044204.dkr.ecr.ap-south-1.amazonaws.com/project08-backend:c68b66d
```

### Step 3: Force ECS to pull new image
```bash
aws ecs update-service --profile p08 --region ap-south-1 \
  --cluster project08 --service backend --force-new-deployment

# Wait for it to stabilize
aws ecs wait services-stable --profile p08 --region ap-south-1 \
  --cluster project08 --services backend

echo "Backend live at: http://p08-alb-1459152437.ap-south-1.elb.amazonaws.com/health"
```

### Step 4: Verify
```bash
# Backend health
curl http://p08-alb-1459152437.ap-south-1.elb.amazonaws.com/health

# Login test
curl -X POST http://p08-alb-1459152437.ap-south-1.elb.amazonaws.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@dev.example.com","password":"Test1234!"}'
```

### Step 5: Frontend URL
```
http://project08-frontend-975903044204.s3-website.ap-south-1.amazonaws.com
```

## AWS Resource IDs (save these):
```
Account:    975903044204
Region:     ap-south-1
VPC:        vpc-018da303857fec6f9
Subnet A:   subnet-05954cb4283acc37e
Subnet B:   subnet-021661c0e6af07b26
ALB_SG:     sg-0d91ddbee50805058
ECS_SG:     sg-0fb861a7bed41912c
RDS_SG:     sg-0d0e2a5e99c34ba53
ALB_ARN:    arn:aws:elasticloadbalancing:ap-south-1:975903044204:loadbalancer/app/p08-alb/c3658b60b9c3387b
TG_ARN:     arn:aws:elasticloadbalancing:ap-south-1:975903044204:targetgroup/p08-backend-tg/caa5ba3c33aaedfb
ALB_DNS:    p08-alb-1459152437.ap-south-1.elb.amazonaws.com
RDS_HOST:   project08-db.c78so622uwyk.ap-south-1.rds.amazonaws.com
RDS_USER:   p08admin
RDS_PASS:   TRNEHxx8O5L1oXPlaIt7
RDS_DB:     project08
SECRET_ARN: arn:aws:secretsmanager:ap-south-1:975903044204:secret:project08/backend-ztmBEo
ECR_REPO:   975903044204.dkr.ecr.ap-south-1.amazonaws.com/project08-backend
ECS_CLUSTER: project08
ECS_SERVICE: backend
TASK_DEF:   project08-backend:1
S3_BUCKET:  project08-frontend-975903044204
FRONTEND:   http://project08-frontend-975903044204.s3-website.ap-south-1.amazonaws.com
EXEC_ROLE:  arn:aws:iam::975903044204:role/p08-ecs-execution
BUILD_EC2:  i-0e888d55fcac58546 (terminate after done)
```

## After backend is live — CI/CD setup:
See planning/AWS_DEPLOY_NOW.md Phase 1.5 for GitHub OIDC + deploy.yml

## Cleanup (terminate build EC2):
```bash
aws ec2 terminate-instances --profile p08 --region ap-south-1 \
  --instance-ids i-0e888d55fcac58546
```

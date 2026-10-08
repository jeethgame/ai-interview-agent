#!/usr/bin/env bash
# Deploy project08-cognito-role-trigger Lambda and attach it to the Cognito User Pool.
# Requires AWS profile 'p08' with permissions for IAM, Lambda, and Cognito IDP.
#
# Usage: bash infra/cognito-role-trigger/deploy.sh

set -euo pipefail

PROFILE="p08"
REGION="ap-south-1"
ACCOUNT="975903044204"
FUNCTION_NAME="project08-cognito-role-trigger"
ROLE_NAME="project08-lambda-role"
USER_POOL_ID="ap-south-1_NfT5QjYyc"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> 1. Create IAM role (skip if exists)"
aws iam create-role \
  --role-name "$ROLE_NAME" \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
  --profile "$PROFILE" 2>/dev/null || echo "     Role already exists, continuing."

aws iam attach-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole \
  --profile "$PROFILE" 2>/dev/null || true

echo "==> 2. Wait for role to propagate"
sleep 10

echo "==> 3. Package Lambda"
cd "$SCRIPT_DIR"
zip -j function.zip index.py

echo "==> 4. Create or update Lambda function"
ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${ROLE_NAME}"

if aws lambda get-function --function-name "$FUNCTION_NAME" --profile "$PROFILE" --region "$REGION" &>/dev/null; then
  echo "     Updating existing function code..."
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file fileb://function.zip \
    --profile "$PROFILE" --region "$REGION"
else
  echo "     Creating new function..."
  aws lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --runtime python3.11 \
    --handler index.handler \
    --zip-file fileb://function.zip \
    --role "$ROLE_ARN" \
    --profile "$PROFILE" --region "$REGION"
fi

echo "==> 5. Get Lambda ARN"
LAMBDA_ARN=$(aws lambda get-function \
  --function-name "$FUNCTION_NAME" \
  --profile "$PROFILE" --region "$REGION" \
  --query 'Configuration.FunctionArn' --output text)
echo "     ARN: $LAMBDA_ARN"

echo "==> 6. Grant Cognito permission to invoke Lambda"
aws lambda add-permission \
  --function-name "$FUNCTION_NAME" \
  --statement-id cognito-trigger \
  --action lambda:InvokeFunction \
  --principal cognito-idp.amazonaws.com \
  --source-arn "arn:aws:cognito-idp:${REGION}:${ACCOUNT}:userpool/${USER_POOL_ID}" \
  --profile "$PROFILE" --region "$REGION" 2>/dev/null || echo "     Permission already exists, continuing."

echo "==> 7. Attach Pre-Token-Generation trigger to User Pool"
aws cognito-idp update-user-pool \
  --user-pool-id "$USER_POOL_ID" \
  --lambda-config "PreTokenGeneration=$LAMBDA_ARN" \
  --profile "$PROFILE" --region "$REGION"

echo ""
echo "Done. To verify, authenticate a user and decode the ID token's middle section:"
echo "  echo \$TOKEN | cut -d'.' -f2 | base64 -d 2>/dev/null | python -m json.tool | grep role"
echo "Expected: \"role\": \"admin\"  (or faculty/candidate depending on the user)"

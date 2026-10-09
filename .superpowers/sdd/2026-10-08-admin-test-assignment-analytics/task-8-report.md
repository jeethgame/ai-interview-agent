# Task 8 Report — Cognito Pre-Token-Generation Lambda

## Status: DONE_WITH_CONCERNS

## Commits

| SHA | Message |
|---|---|
| `9905917` | feat(auth): Cognito Pre-Token-Generation Lambda — inject role claim into JWT |

## Summary

Created the Pre-Token-Generation Lambda at `infra/cognito-role-trigger/index.py` and a full deploy script at `infra/cognito-role-trigger/deploy.sh`. AWS CLI commands were NOT executed — the AWS profile `p08` does not exist on this machine (`The config profile (p08) could not be found`).

## Concern

AWS profile `p08` is missing from the local environment. All deployment steps (IAM role creation, Lambda create/update, Cognito permission grant, User Pool trigger attachment) are scripted in `infra/cognito-role-trigger/deploy.sh`. Run it on a machine with the `p08` profile configured (or export valid `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` for that account and swap `--profile p08` for the env creds).

## Files Created

- `infra/cognito-role-trigger/index.py` — Lambda handler; reads `custom:role` from Cognito user attributes, validates to `candidate|faculty|admin`, injects as `role` claim via `claimsOverrideDetails`
- `infra/cognito-role-trigger/deploy.sh` — idempotent deploy script: creates IAM role, packages zip, creates/updates Lambda, grants Cognito invoke permission, attaches PreTokenGeneration trigger to pool `ap-south-1_NfT5QjYyc`

# pr-auto-approver

GitHub App that auto-approves pull requests after CI checks pass, with optional AI code review powered by Amazon Bedrock.

## How It Works

1. PR opened or updated → bot waits for CI checks
2. All checks pass → (optional) Bedrock AI reviews the diff
3. No issues → ✅ Approved
4. Issues found → ❌ Changes requested with inline comments
5. Fix and push → bot re-reviews automatically

## Approval Modes

| Mode | Config | Branch Protection |
|------|--------|-------------------|
| **App token** | default | Doesn't count on Free plan |
| **PAT token** | set `APPROVAL_TOKEN` | ✅ Counts as real user review |

For PAT mode: create a classic PAT (`repo` scope) from a second GitHub account, add it as collaborator with write access.

## Build

```bash
npm ci
npm run zip    # TypeScript → esbuild → lambda.zip (~1MB)
```

## Deploy

Use the [terraform-aws-pr-auto-approver](https://github.com/jonmatum/terraform-aws-pr-auto-approver) module.

## Files

| File | Purpose |
|------|---------|
| `index.js` | Bot logic — event handling, CI checks, review submission |
| `lambda.js` | Lambda handler — fetches secrets on cold start |
| `review.js` | Bedrock integration — sends diff, parses review |
| `secrets.js` | Secrets Manager client with caching |

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `APP_ID` | GitHub App ID | yes |
| `PRIVATE_KEY_SECRET_ARN` | Secrets Manager ARN for private key | yes |
| `WEBHOOK_SECRET_SECRET_ARN` | Secrets Manager ARN for webhook secret | yes |
| `ALLOWED_AUTHORS` | Comma-separated usernames | no |
| `BEDROCK_ENABLED` | `true` to enable AI review | no |
| `BEDROCK_MODEL_ID` | Bedrock model (default: Claude 3.5 Haiku) | no |
| `APPROVAL_TOKEN_SECRET_ARN` | Secrets Manager ARN for PAT | no |

## License

MIT

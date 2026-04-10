# pr-auto-approver

GitHub App that auto-approves pull requests after CI checks pass, with optional AI code review via Amazon Bedrock.

## How It Works

1. PR is opened → bot checks CI status
2. Check suite completes → bot re-evaluates
3. All checks pass → (optional) Bedrock AI reviews the diff
4. No issues found → bot approves ✅
5. Issues found → bot posts review comments + requests changes ❌

## Bedrock AI Review (Optional)

When `BEDROCK_ENABLED=true`, the bot sends the PR diff to a Bedrock model (default: Claude 3 Haiku) which reviews for:
- Bugs and logic errors
- Security vulnerabilities
- Performance issues
- Missing error handling

If Bedrock is disabled or fails, the bot falls back to auto-approve after CI passes.

## Build

```bash
npm ci
zip -r lambda.zip index.js lambda.js review.js node_modules package.json
```

The `lambda.zip` is what you pass to the [terraform-aws-pr-auto-approver](https://github.com/jonmatum/terraform-aws-pr-auto-approver) module.

## Local Dev

```bash
cp .env.example .env
# fill in APP_ID, WEBHOOK_SECRET, PRIVATE_KEY_PATH
npx smee -u https://smee.io/YOUR_CHANNEL -t http://localhost:3000
npm start
```

## Related

- [terraform-aws-pr-auto-approver](https://github.com/jonmatum/terraform-aws-pr-auto-approver) — AWS infra module (Lambda, API Gateway, Secrets Manager)
- [terraform-github-pr-auto-approver](https://github.com/jonmatum/terraform-github-pr-auto-approver) — GitHub webhooks module

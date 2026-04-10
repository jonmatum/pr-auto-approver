# pr-auto-approver

GitHub App that auto-approves pull requests after CI checks pass, with optional AI code review powered by Amazon Bedrock.

## How It Works

1. A PR is opened on any repo where the GitHub App is installed
2. The bot waits for all CI checks to complete
3. If `BEDROCK_ENABLED=true`, the bot sends the PR diff to Amazon Bedrock for AI review
4. If no issues found (or Bedrock disabled) → bot **approves** the PR ✅
5. If Bedrock finds bugs/security issues → bot **requests changes** with inline comments ❌

## Architecture

```
GitHub App webhook → API Gateway (HTTP) → Lambda → Secrets Manager (cold start)
                                            ↓
                                      [Bedrock AI Review] (optional)
                                            ↓
                                      GitHub API (approve / request changes)
```

## Files

| File | Purpose |
|------|---------|
| `index.js` | Main bot logic — listens for PR events, checks CI, triggers review |
| `lambda.js` | Lambda handler — fetches secrets from Secrets Manager on cold start, then initializes Probot |
| `review.js` | Bedrock integration — sends diff to Claude, parses review comments |
| `secrets.js` | Secrets Manager client with in-memory caching |

## Build

```bash
npm ci
zip -r lambda.zip index.js lambda.js review.js secrets.js node_modules package.json
```

The `lambda.zip` is what you pass to the [terraform-aws-pr-auto-approver](https://github.com/jonmatum/terraform-aws-pr-auto-approver) Terraform module.

## Deploy

See [pr-auto-approver-infra](https://github.com/jonmatum/pr-auto-approver-infra) for a complete deployment example, or use the Terraform modules directly:

```hcl
module "approver" {
  source = "github.com/jonmatum/terraform-aws-pr-auto-approver?ref=v1.2.0"

  github_app_id          = "123456"
  github_app_private_key = file("private-key.pem")
  github_webhook_secret  = var.webhook_secret
  allowed_authors        = "your-username"
  lambda_zip_path        = "./lambda.zip"

  bedrock_enabled    = true
  monitoring_enabled = true
  alert_email        = "you@example.com"
}
```

## Prerequisites

1. **Create a GitHub App** at https://github.com/settings/apps/new
   - Permissions: Pull requests (Read & Write), Checks (Read)
   - Events: Pull request, Check suite
   - Webhook URL: set after deploying (Terraform outputs it)
   - Webhook Secret: generate with `openssl rand -hex 20`
2. **Install the App** on your repos (or all repos)
3. **Deploy the infrastructure** using the Terraform module
4. **Set the webhook URL** in the GitHub App settings to the Terraform output

> **Important:** The GitHub App's built-in webhook delivers events to your Lambda. You do NOT need separate repo-level webhooks.

## Local Dev

```bash
cp .env.example .env
# fill in APP_ID, WEBHOOK_SECRET, PRIVATE_KEY_PATH
npx smee -u https://smee.io/YOUR_CHANNEL -t http://localhost:3000
npm start
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `APP_ID` | GitHub App ID | yes |
| `PRIVATE_KEY_SECRET_ARN` | Secrets Manager ARN for private key | yes (Lambda) |
| `WEBHOOK_SECRET_SECRET_ARN` | Secrets Manager ARN for webhook secret | yes (Lambda) |
| `ALLOWED_AUTHORS` | Comma-separated GitHub usernames | no |
| `BEDROCK_ENABLED` | Set to `true` to enable AI review | no |
| `BEDROCK_MODEL_ID` | Bedrock model (default: Claude 3 Haiku) | no |

## Related

- [terraform-aws-pr-auto-approver](https://github.com/jonmatum/terraform-aws-pr-auto-approver) — Terraform module for AWS infrastructure
- [terraform-github-pr-auto-approver](https://github.com/jonmatum/terraform-github-pr-auto-approver) — Terraform module for repo webhooks (optional, not needed with GitHub App)
- [pr-auto-approver-infra](https://github.com/jonmatum/pr-auto-approver-infra) — Example deployment configuration

## License

MIT

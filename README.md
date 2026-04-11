# pr-auto-approver

GitHub App that auto-approves pull requests with AI code review powered by Amazon Bedrock (Claude 3.5 Haiku).

## Architecture

```mermaid
sequenceDiagram
    participant GH as GitHub
    participant AG as API Gateway
    participant LM as Lambda
    participant SM as Secrets Manager
    participant BR as Bedrock (Claude)
    participant PA as GitHub API (PAT)

    GH->>AG: Webhook (PR opened/updated)
    AG->>LM: Invoke
    LM->>SM: Fetch secrets (cold start)
    SM-->>LM: Private key, webhook secret, PAT
    LM->>LM: Verify webhook signature
    LM->>LM: Check CI status
    LM->>BR: Send diff for review
    BR-->>LM: Issues found (critical/warning)
    alt Critical issues
        LM->>PA: REQUEST_CHANGES + inline comments
    else Warnings only
        LM->>PA: APPROVE + warning comments
    else Clean code
        LM->>PA: APPROVE
    end
```

## How It Works

```mermaid
flowchart LR
    A[PR Opened] --> B{CI Passes?}
    B -->|No| C[Skip]
    B -->|Yes| D{Bedrock Enabled?}
    D -->|No| E[✅ Approve]
    D -->|Yes| F[AI Review]
    F --> G{Issues Found?}
    G -->|Critical| H[❌ Request Changes]
    G -->|Warnings Only| I[✅ Approve + Comments]
    G -->|None| E
    H --> J[Fix & Push]
    J --> K[Dismiss Old Review]
    K --> F
```

## Features

| Feature | Description |
|---------|-------------|
| AI Code Review | Claude 3.5 Haiku reviews diffs for security issues |
| Severity Levels | Critical blocks, warnings approve with comments |
| Language Support | Python, Node.js, Go, Terraform, Java, and more |
| PAT Approvals | Satisfies branch protection on GitHub Free plan |
| Smart Model Selection | Haiku for small diffs, Sonnet for large ones |
| Project Context | `REVIEW_CONTEXT` env var for smarter reviews |
| Token Health | Warns 14 days before PAT expiry |
| Review Dismissal | Dismisses stale reviews on new pushes |

## Build

```bash
npm ci
npm run zip    # TypeScript → esbuild → lambda.zip (~1MB)
```

## Deploy

Use the [terraform-aws-pr-auto-approver](https://github.com/jonmatum/terraform-aws-pr-auto-approver) module ([Terraform Registry](https://registry.terraform.io/modules/jonmatum/pr-auto-approver/aws)).

## Approval Modes

| Mode | Config | Branch Protection |
|------|--------|-------------------|
| **App token** | default | Doesn't count on Free plan |
| **PAT token** | set `APPROVAL_TOKEN` | ✅ Counts as real user review |

## Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Bot logic — events, CI checks, severity routing |
| `src/lambda.ts` | Lambda handler — secrets on cold start |
| `src/review.ts` | Bedrock — prompt, model selection, parsing |
| `src/secrets.ts` | Secrets Manager client with caching |
| `src/token-health.ts` | PAT expiry monitoring |

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `APP_ID` | GitHub App ID | yes |
| `PRIVATE_KEY_SECRET_ARN` | Secrets Manager ARN for private key | yes |
| `WEBHOOK_SECRET_SECRET_ARN` | Secrets Manager ARN for webhook secret | yes |
| `ALLOWED_AUTHORS` | Comma-separated usernames | no |
| `BEDROCK_ENABLED` | `true` to enable AI review | no |
| `BEDROCK_MODEL_ID` | Default model (Claude 3.5 Haiku) | no |
| `BEDROCK_MODEL_ID_LARGE` | Model for large diffs | no |
| `APPROVAL_TOKEN_SECRET_ARN` | Secrets Manager ARN for PAT | no |
| `REVIEW_CONTEXT` | Project description for smarter reviews | no |

## License

MIT

# pr-auto-approver

GitHub App that auto-approves pull requests after all CI checks pass.

## How It Works

1. PR is opened → bot checks CI status
2. Check suite completes → bot re-evaluates
3. All checks pass + author is allowed → bot approves
4. Any check fails → bot skips

## Build

```bash
npm ci
zip -r lambda.zip index.js lambda.js node_modules package.json
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

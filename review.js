const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

const REVIEW_PROMPT = `You are a strict senior security engineer reviewing a pull request. Your job is to find REAL issues that could cause bugs, security vulnerabilities, or production incidents.

Analyze the diff carefully line by line. Look specifically for:

SECURITY:
- Hardcoded secrets, API keys, passwords, or JWT secrets
- SQL injection, command injection, path traversal
- Missing input validation or sanitization
- Weak cryptography (low salt rounds, weak algorithms)
- Sensitive data exposure (passwords, tokens in responses or logs)
- Missing authentication or authorization checks
- Use of == instead of === or proper comparison functions (e.g. bcrypt.compare)

BUGS:
- Null/undefined access without checks
- Missing error handling or swallowed errors
- Race conditions or async issues
- Wrong comparison operators
- Error messages that leak internal details to users

For EACH issue found, you MUST respond with a JSON array:
[{"path": "file/path.js", "line": 10, "body": "Description of the issue and how to fix it"}]

The "line" must be the line number in the NEW file (lines starting with + in the diff).
The "path" must match the file path from the diff header.

If you find NO issues at all, respond with: []

Be thorough. Do NOT miss hardcoded secrets or missing null checks. These are critical.

PR Title: {title}
PR Description: {description}

Diff:
{diff}`;

async function reviewWithBedrock(diff, title, description) {
  const client = new BedrockRuntimeClient();
  const modelId = process.env.BEDROCK_MODEL_ID || "us.anthropic.claude-3-5-haiku-20241022-v1:0";

  const prompt = REVIEW_PROMPT
    .replace("{title}", title || "")
    .replace("{description}", description || "")
    .replace("{diff}", diff.substring(0, 100000));

  const res = await client.send(new InvokeModelCommand({
    modelId,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  }));

  const body = JSON.parse(new TextDecoder().decode(res.body));
  const text = body.content[0].text;

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    return JSON.parse(match[0]);
  } catch {
    return [];
  }
}

module.exports = { reviewWithBedrock };

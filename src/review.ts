import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

export interface ReviewIssue {
  path: string;
  line: number;
  severity: "critical" | "warning";
  body: string;
}

const REVIEW_PROMPT = `You are a senior code reviewer. Review the pull request diff below.

Only flag issues that are CLEARLY wrong in the code as written. Do NOT flag:
- Values read from environment variables (process.env.X, os.environ.get() are correct, not hardcoded)
- Architectural suggestions or design preferences
- Missing features that aren't in scope of the PR
- Style or formatting issues

DO flag:
- Hardcoded secrets/passwords/keys (literal strings, NOT env vars)
- SQL/NoSQL injection or command injection
- Using == instead of === or bcrypt.compare for password checks
- Returning sensitive data (passwords, hashes) in API responses
- Null/undefined access without checks that WILL crash
- Weak crypto (bcrypt rounds < 10)

Language-specific notes (DO NOT flag these as issues):
- Python: db.execute("SELECT ... WHERE id = %s", (value,)) with tuple is SAFE parameterized query
- Go: db.Query("SELECT ... WHERE id = ?", value) with ? placeholder is SAFE
- Java: PreparedStatement with ? placeholder is SAFE
- Node.js: Parameterized queries with $1 or ? placeholders are SAFE

Severity levels:
- "critical": Security vulnerabilities, hardcoded secrets, injection, data exposure (MUST be fixed)
- "warning": Missing null checks, weak crypto, minor issues (should be fixed but not blocking)

Respond with a JSON array:
[{"path": "file.js", "line": 10, "severity": "critical", "body": "Description"}]

"line" = line number in the new file. "path" = file path from diff header.
If the code is acceptable, respond with: []

{context}PR Title: {title}
PR Description: {description}

Diff:
{diff}`;

const DIFF_SIZE_THRESHOLD = 50000;

export async function reviewWithBedrock(
  diff: string,
  title: string | null,
  description: string | null
): Promise<ReviewIssue[]> {
  const client = new BedrockRuntimeClient({});

  const defaultModel = "us.anthropic.claude-3-5-haiku-20241022-v1:0";
  const largeModel = process.env.BEDROCK_MODEL_ID_LARGE || defaultModel;
  const smallModel = process.env.BEDROCK_MODEL_ID || defaultModel;
  const modelId = diff.length > DIFF_SIZE_THRESHOLD ? largeModel : smallModel;

  const context = process.env.REVIEW_CONTEXT
    ? `Project context: ${process.env.REVIEW_CONTEXT}\n\n`
    : "";

  const prompt = REVIEW_PROMPT
    .replace("{context}", context)
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
  const text: string = body.content[0].text;

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    return JSON.parse(match[0]) as ReviewIssue[];
  } catch {
    return [];
  }
}

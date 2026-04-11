import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

export interface ReviewIssue {
  path: string;
  line: number;
  body: string;
}

const REVIEW_PROMPT = `You are a senior code reviewer. Review the pull request diff below.

Only flag issues that are CLEARLY wrong in the code as written. Do NOT flag:
- Values read from environment variables (process.env.X is correct, not hardcoded)
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

Respond with a JSON array of issues:
[{"path": "file/path.js", "line": 10, "body": "Description"}]

"line" = line number in the new file. "path" = file path from diff header.
If the code is acceptable, respond with: []

PR Title: {title}
PR Description: {description}

Diff:
{diff}`;

export async function reviewWithBedrock(
  diff: string,
  title: string | null,
  description: string | null
): Promise<ReviewIssue[]> {
  const client = new BedrockRuntimeClient({});
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
  const text: string = body.content[0].text;

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    return JSON.parse(match[0]) as ReviewIssue[];
  } catch {
    return [];
  }
}

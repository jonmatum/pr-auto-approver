const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

const REVIEW_PROMPT = `You are a senior code reviewer. Review the following pull request diff.

For each issue found, respond with a JSON array of objects:
[{"path": "file/path.js", "line": 10, "body": "Description of the issue"}]

If no issues are found, respond with an empty array: []

Focus on:
- Bugs and logic errors
- Security vulnerabilities
- Performance issues
- Missing error handling

Do NOT comment on style, formatting, or minor nitpicks.

PR Title: {title}
PR Description: {description}

Diff:
{diff}`;

async function reviewWithBedrock(diff, title, description) {
  const client = new BedrockRuntimeClient();
  const modelId = process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-haiku-20240307-v1:0";

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

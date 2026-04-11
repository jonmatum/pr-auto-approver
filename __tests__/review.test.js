const { mockClient } = require("aws-sdk-client-mock");
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

const brMock = mockClient(BedrockRuntimeClient);

beforeEach(() => {
  brMock.reset();
});

function mockBedrockResponse(text) {
  const body = new TextEncoder().encode(JSON.stringify({
    content: [{ text }],
  }));
  brMock.on(InvokeModelCommand).resolves({ body });
}

test("returns issues when Bedrock finds problems", async () => {
  const issues = [{ path: "src/app.js", line: 5, body: "SQL injection" }];
  mockBedrockResponse(JSON.stringify(issues));

  const { reviewWithBedrock } = require("../review");
  const result = await reviewWithBedrock("diff content", "title", "desc");

  expect(result).toEqual(issues);
});

test("returns empty array when no issues found", async () => {
  mockBedrockResponse("[]");

  const { reviewWithBedrock } = require("../review");
  const result = await reviewWithBedrock("diff content", "title", "desc");

  expect(result).toEqual([]);
});

test("returns empty array on malformed JSON", async () => {
  mockBedrockResponse("Here is my review: not valid json at all");

  const { reviewWithBedrock } = require("../review");
  const result = await reviewWithBedrock("diff", "title", "desc");

  expect(result).toEqual([]);
});

test("returns empty array when response has no JSON array", async () => {
  mockBedrockResponse('{"result": "no issues"}');

  const { reviewWithBedrock } = require("../review");
  const result = await reviewWithBedrock("diff", "title", "desc");

  expect(result).toEqual([]);
});

test("truncates diff to 100k chars", async () => {
  let capturedBody;
  brMock.on(InvokeModelCommand).callsFake((input) => {
    capturedBody = JSON.parse(input.body);
    return { body: new TextEncoder().encode(JSON.stringify({ content: [{ text: "[]" }] })) };
  });

  const { reviewWithBedrock } = require("../review");
  const longDiff = "x".repeat(200000);
  await reviewWithBedrock(longDiff, "title", "desc");

  const prompt = capturedBody.messages[0].content;
  expect(prompt.length).toBeLessThan(150000);
});

const { mockClient } = require("aws-sdk-client-mock");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

const smMock = mockClient(SecretsManagerClient);

beforeEach(() => {
  smMock.reset();
  // Clear the cache between tests
  delete require.cache[require.resolve("../src/secrets")];
});

test("fetches secret from Secrets Manager", async () => {
  smMock.on(GetSecretValueCommand).resolves({ SecretString: "my-secret" });

  const { getSecret } = require("../src/secrets");
  const result = await getSecret("arn:aws:secretsmanager:us-east-1:123:secret:test");

  expect(result).toBe("my-secret");
  expect(smMock.calls()).toHaveLength(1);
});

test("caches secrets after first fetch", async () => {
  smMock.on(GetSecretValueCommand).resolves({ SecretString: "cached-value" });

  const { getSecret } = require("../src/secrets");
  const arn = "arn:aws:secretsmanager:us-east-1:123:secret:cache-test";
  await getSecret(arn);

  // Reset mock to verify no new calls
  const callsBefore = smMock.calls().length;
  await getSecret(arn);

  expect(smMock.calls()).toHaveLength(callsBefore); // No additional call
});

test("caches different secrets independently", async () => {
  smMock.on(GetSecretValueCommand)
    .resolvesOnce({ SecretString: "secret-a" })
    .resolvesOnce({ SecretString: "secret-b" });

  const { getSecret } = require("../src/secrets");
  const a = await getSecret("arn:a");
  const b = await getSecret("arn:b");

  expect(a).toBe("secret-a");
  expect(b).toBe("secret-b");
  expect(smMock.calls()).toHaveLength(2);
});

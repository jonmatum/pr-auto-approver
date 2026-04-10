const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

const client = new SecretsManagerClient();
const cache = {};

async function getSecret(arn) {
  if (cache[arn]) return cache[arn];
  const res = await client.send(new GetSecretValueCommand({ SecretId: arn }));
  cache[arn] = res.SecretString;
  return cache[arn];
}

module.exports = { getSecret };

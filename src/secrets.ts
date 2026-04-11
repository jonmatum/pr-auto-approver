import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({});
const cache: Record<string, string> = {};

export async function getSecret(arn: string): Promise<string> {
  if (cache[arn]) return cache[arn];
  const res = await client.send(new GetSecretValueCommand({ SecretId: arn }));
  cache[arn] = res.SecretString!;
  return cache[arn];
}

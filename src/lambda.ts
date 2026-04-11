const { createLambdaFunction, createProbot } = require("@probot/adapter-aws-lambda-serverless");
import { getSecret } from "./secrets";
import { checkTokenHealth } from "./token-health";

const appFn = require("./index");

let handler: any;

exports.handler = async (event: any, context: any) => {
  if (!handler) {
    console.log("[INIT] Cold start — fetching secrets from Secrets Manager");
    const startTime = Date.now();

    const [privateKey, webhookSecret] = await Promise.all([
      getSecret(process.env.PRIVATE_KEY_SECRET_ARN!),
      getSecret(process.env.WEBHOOK_SECRET_SECRET_ARN!),
    ]);
    process.env.PRIVATE_KEY = privateKey;
    process.env.WEBHOOK_SECRET = webhookSecret;

    if (process.env.APPROVAL_TOKEN_SECRET_ARN) {
      process.env.APPROVAL_TOKEN = await getSecret(process.env.APPROVAL_TOKEN_SECRET_ARN);
      checkTokenHealth(process.env.APPROVAL_TOKEN);
      console.log("[INIT] Approval token loaded (PAT mode)");
    } else {
      console.log("[INIT] No approval token — using App token mode");
    }

    console.log(`[INIT] Secrets loaded in ${Date.now() - startTime}ms`);
    handler = createLambdaFunction(appFn, { probot: createProbot() });
    console.log("[INIT] Handler ready");
  }
  return handler(event, context);
};

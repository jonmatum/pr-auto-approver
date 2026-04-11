const { createLambdaFunction, createProbot } = require("@probot/adapter-aws-lambda-serverless");
const appFn = require("./index");
const { getSecret } = require("./secrets");
const { checkTokenHealth } = require("./token-health");

let handler;

module.exports.handler = async (event, context) => {
  if (!handler) {
    const [privateKey, webhookSecret] = await Promise.all([
      getSecret(process.env.PRIVATE_KEY_SECRET_ARN),
      getSecret(process.env.WEBHOOK_SECRET_SECRET_ARN),
    ]);
    process.env.PRIVATE_KEY = privateKey;
    process.env.WEBHOOK_SECRET = webhookSecret;

    if (process.env.APPROVAL_TOKEN_SECRET_ARN) {
      process.env.APPROVAL_TOKEN = await getSecret(process.env.APPROVAL_TOKEN_SECRET_ARN);
      checkTokenHealth(process.env.APPROVAL_TOKEN);
    }

    handler = createLambdaFunction(appFn, { probot: createProbot() });
  }
  return handler(event, context);
};

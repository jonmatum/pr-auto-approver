const { createLambdaFunction, createProbot } = require("@probot/adapter-aws-lambda-serverless");
const appFn = require("./index");
const { getSecret } = require("./secrets");

let handler;

module.exports.handler = async (event, context) => {
  if (!handler) {
    const [privateKey, webhookSecret] = await Promise.all([
      getSecret(process.env.PRIVATE_KEY_SECRET_ARN),
      getSecret(process.env.WEBHOOK_SECRET_SECRET_ARN),
    ]);
    process.env.PRIVATE_KEY = privateKey;
    process.env.WEBHOOK_SECRET = webhookSecret;
    handler = createLambdaFunction(appFn, { probot: createProbot() });
  }
  return handler(event, context);
};

const { reviewWithBedrock } = require("./review");

async function submitReview(context, pr, event, body, comments) {
  const repo = context.repo();

  if (process.env.APPROVAL_TOKEN) {
    const https = require("https");
    const payload = { event, body };
    if (comments) payload.comments = comments;
    const data = JSON.stringify(payload);
    const options = {
      hostname: "api.github.com",
      path: `/repos/${repo.owner}/${repo.repo}/pulls/${pr.number}/reviews`,
      method: "POST",
      headers: {
        Authorization: `token ${process.env.APPROVAL_TOKEN}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
        "User-Agent": "pr-auto-approver",
        Accept: "application/vnd.github+json",
      },
    };
    const res = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      });
      req.on("error", reject);
      req.write(data);
      req.end();
    });
    if (res.status >= 400) {
      console.error(`PAT review failed (${res.status}): ${res.body}`);
    }
  } else {
    await context.octokit.pulls.createReview({
      ...repo,
      pull_number: pr.number,
      commit_id: pr.head.sha,
      event,
      body,
      ...(comments ? { comments } : {}),
    });
  }
}
module.exports = (app) => {
  app.on(["pull_request.opened", "pull_request.synchronize", "check_suite.completed"], async (context) => {
    const pr =
      context.payload.pull_request ||
      (await getPRFromCheckSuite(context));

    if (!pr) return;

    const allowedUsers = (process.env.ALLOWED_AUTHORS || "").split(",").map((u) => u.trim()).filter(Boolean);

    if (allowedUsers.length && !allowedUsers.includes(pr.user.login)) {
      app.log.info(`Skipping PR #${pr.number} by ${pr.user.login} (not in allowed list)`);
      return;
    }

    const checks = await context.octokit.checks.listForRef({
      ...context.repo(),
      ref: pr.head.sha,
    });

    const pending = checks.data.check_runs.filter((c) => c.status !== "completed");
    const failed = checks.data.check_runs.filter(
      (c) => c.status === "completed" && c.conclusion !== "success" && c.conclusion !== "skipped"
    );

    if (pending.length) {
      app.log.info(`PR #${pr.number} has ${pending.length} pending checks, waiting...`);
      return;
    }

    if (failed.length) {
      app.log.info(`PR #${pr.number} has ${failed.length} failed checks, skipping`);
      return;
    }

    // Avoid duplicate reviews (skip check on new pushes)
    if (context.payload.action !== "synchronize") {
      const reviews = await context.octokit.pulls.listReviews({
        ...context.repo(),
        pull_number: pr.number,
      });
      const alreadyReviewed = reviews.data.some(
        (r) => (r.state === "APPROVED" || r.state === "CHANGES_REQUESTED") && r.user.type === "Bot"
      );
      if (alreadyReviewed) return;
    }

    // Bedrock AI review (opt-in)
    if (process.env.BEDROCK_ENABLED === "true") {
      app.log.info(`Running Bedrock review on PR #${pr.number}`);

      const { data: diff } = await context.octokit.pulls.get({
        ...context.repo(),
        pull_number: pr.number,
        mediaType: { format: "diff" },
      });

      try {
        const issues = await reviewWithBedrock(diff, pr.title, pr.body);

        if (issues.length > 0) {
          await submitReview(context, pr, "REQUEST_CHANGES",
            `AI review found ${issues.length} issue(s).`,
            issues.map((i) => ({ path: i.path, line: i.line, body: `🤖 ${i.body}` }))
          );
          app.log.info(`Requested changes on PR #${pr.number} (${issues.length} issues)`);
          return;
        }
      } catch (err) {
        app.log.error(`Bedrock review failed for PR #${pr.number}: ${err.message}`);
      }
    }

    await submitReview(context, pr, "APPROVE",
      process.env.BEDROCK_ENABLED === "true"
        ? "All checks passed. AI review found no issues. Auto-approved."
        : "All checks passed. Auto-approved by pr-auto-approver bot."
    );

    app.log.info(`Approved PR #${pr.number} by ${pr.user.login}`);
  });
};

async function getPRFromCheckSuite(context) {
  const prs = context.payload.check_suite?.pull_requests;
  if (!prs?.length) return null;

  const { data: pr } = await context.octokit.pulls.get({
    ...context.repo(),
    pull_number: prs[0].number,
  });
  return pr;
}

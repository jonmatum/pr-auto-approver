const { reviewWithBedrock } = require("./review");

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

    // Avoid duplicate reviews
    const reviews = await context.octokit.pulls.listReviews({
      ...context.repo(),
      pull_number: pr.number,
    });
    const alreadyReviewed = reviews.data.some(
      (r) => (r.state === "APPROVED" || r.state === "CHANGES_REQUESTED") && r.user.type === "Bot"
    );
    if (alreadyReviewed) return;

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
          await context.octokit.pulls.createReview({
            ...context.repo(),
            pull_number: pr.number,
            commit_id: pr.head.sha,
            event: "REQUEST_CHANGES",
            body: `AI review found ${issues.length} issue(s).`,
            comments: issues.map((i) => ({
              path: i.path,
              line: i.line,
              body: `🤖 ${i.body}`,
            })),
          });
          app.log.info(`Requested changes on PR #${pr.number} (${issues.length} issues)`);
          return;
        }
      } catch (err) {
        app.log.error(`Bedrock review failed for PR #${pr.number}: ${err.message}`);
        // Fall through to approve if Bedrock fails
      }
    }

    await context.octokit.pulls.createReview({
      ...context.repo(),
      pull_number: pr.number,
      event: "APPROVE",
      body: process.env.BEDROCK_ENABLED === "true"
        ? "All checks passed. AI review found no issues. Auto-approved."
        : "All checks passed. Auto-approved by pr-auto-approver bot.",
    });

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

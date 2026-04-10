module.exports = (app) => {
  app.on(["pull_request.opened", "check_suite.completed"], async (context) => {
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

    const pending = checks.data.check_runs.filter(
      (c) => c.status !== "completed"
    );
    const failed = checks.data.check_runs.filter(
      (c) => c.status === "completed" && c.conclusion !== "success" && c.conclusion !== "skipped"
    );

    if (pending.length) {
      app.log.info(`PR #${pr.number} has ${pending.length} pending checks, waiting...`);
      return;
    }

    if (failed.length) {
      app.log.info(`PR #${pr.number} has ${failed.length} failed checks, skipping approval`);
      return;
    }

    const reviews = await context.octokit.pulls.listReviews({
      ...context.repo(),
      pull_number: pr.number,
    });
    const alreadyApproved = reviews.data.some(
      (r) => r.state === "APPROVED" && r.user.type === "Bot"
    );
    if (alreadyApproved) return;

    await context.octokit.pulls.createReview({
      ...context.repo(),
      pull_number: pr.number,
      event: "APPROVE",
      body: "All checks passed. Auto-approved by pr-auto-approver bot.",
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

import https from "https";
import { reviewWithBedrock, ReviewIssue } from "./review";

interface ReviewParams {
  event: string;
  body: string;
  comments?: Array<{ path: string; line: number; body: string }>;
}

async function submitReview(
  context: any,
  pr: any,
  event: string,
  body: string,
  comments?: ReviewIssue[]
): Promise<void> {
  const repo = context.repo();
  const formattedComments = comments?.map((i) => ({
    path: i.path,
    line: i.line,
    body: `🤖 [${(i.severity || "critical").toUpperCase()}] ${i.body}`,
  }));

  if (process.env.APPROVAL_TOKEN) {
    const payload: ReviewParams = { event, body };
    if (formattedComments) payload.comments = formattedComments;
    const data = JSON.stringify(payload);
    const options: https.RequestOptions = {
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
    const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = "";
        res.on("data", (d: string) => (body += d));
        res.on("end", () => resolve({ status: res.statusCode!, body }));
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
      ...(formattedComments ? { comments: formattedComments } : {}),
    });
  }
}

async function getPRFromCheckSuite(context: any): Promise<any | null> {
  const prs = context.payload.check_suite?.pull_requests;
  if (!prs?.length) return null;
  const { data: pr } = await context.octokit.pulls.get({
    ...context.repo(),
    pull_number: prs[0].number,
  });
  return pr;
}

module.exports = (app: any) => {
  app.on(
    ["pull_request.opened", "pull_request.synchronize", "check_suite.completed"],
    async (context: any) => {
      const pr = context.payload.pull_request || (await getPRFromCheckSuite(context));
      if (!pr) return;

      if (context.payload.action === "synchronize") {
        await dismissPreviousReviews(context, pr);
      }

      const allowedUsers = (process.env.ALLOWED_AUTHORS || "")
        .split(",")
        .map((u: string) => u.trim())
        .filter(Boolean);

      if (allowedUsers.length && !allowedUsers.includes(pr.user.login)) {
        app.log.info(`Skipping PR #${pr.number} by ${pr.user.login} (not in allowed list)`);
        return;
      }

      const checks = await context.octokit.checks.listForRef({
        ...context.repo(),
        ref: pr.head.sha,
      });

      const pending = checks.data.check_runs.filter((c: any) => c.status !== "completed");
      const failed = checks.data.check_runs.filter(
        (c: any) => c.status === "completed" && c.conclusion !== "success" && c.conclusion !== "skipped"
      );

      if (pending.length) {
        app.log.info(`PR #${pr.number} has ${pending.length} pending checks, waiting...`);
        return;
      }
      if (failed.length) {
        app.log.info(`PR #${pr.number} has ${failed.length} failed checks, skipping`);
        return;
      }

      if (context.payload.action !== "synchronize") {
        const reviews = await context.octokit.pulls.listReviews({
          ...context.repo(),
          pull_number: pr.number,
        });
        const alreadyReviewed = reviews.data.some(
          (r: any) => (r.state === "APPROVED" || r.state === "CHANGES_REQUESTED") && r.user.type === "Bot"
        );
        if (alreadyReviewed) return;
      }

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
            const critical = issues.filter((i) => i.severity === "critical");
            const warnings = issues.filter((i) => i.severity === "warning");

            if (critical.length > 0) {
              // Critical issues block the PR
              await submitReview(
                context, pr, "REQUEST_CHANGES",
                `AI review found ${critical.length} critical and ${warnings.length} warning issue(s).`,
                issues
              );
              app.log.info(`Requested changes on PR #${pr.number} (${critical.length} critical, ${warnings.length} warnings)`);
              return;
            }

            // Only warnings — approve but include comments
            await submitReview(
              context, pr, "APPROVE",
              `AI review found ${warnings.length} warning(s) but no critical issues. Auto-approved.`,
              warnings
            );
            app.log.info(`Approved PR #${pr.number} with ${warnings.length} warnings`);
            return;
          }
        } catch (err: any) {
          app.log.error(`Bedrock review failed for PR #${pr.number}: ${err.message}`);
        }
      }

      await submitReview(
        context, pr, "APPROVE",
        process.env.BEDROCK_ENABLED === "true"
          ? "All checks passed. AI review found no issues. Auto-approved."
          : "All checks passed. Auto-approved by pr-auto-approver bot."
      );
      app.log.info(`Approved PR #${pr.number} by ${pr.user.login}`);
    }
  );
};

async function dismissPreviousReviews(context: any, pr: any): Promise<void> {
  const reviews = await context.octokit.pulls.listReviews({
    ...context.repo(),
    pull_number: pr.number,
  });

  for (const review of reviews.data) {
    if (review.state === "CHANGES_REQUESTED") {
      try {
        await context.octokit.pulls.dismissReview({
          ...context.repo(),
          pull_number: pr.number,
          review_id: review.id,
          message: "Dismissed: new commits pushed, re-reviewing.",
        });
      } catch {
        if (process.env.APPROVAL_TOKEN) {
          const https = await import("https");
          const repo = context.repo();
          const data = JSON.stringify({ message: "Dismissed: new commits pushed, re-reviewing." });
          await new Promise<void>((resolve) => {
            const req = https.request({
              hostname: "api.github.com",
              path: `/repos/${repo.owner}/${repo.repo}/pulls/${pr.number}/reviews/${review.id}/dismissals`,
              method: "PUT",
              headers: {
                Authorization: `token ${process.env.APPROVAL_TOKEN}`,
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(data),
                "User-Agent": "pr-auto-approver",
                Accept: "application/vnd.github+json",
              },
            }, () => resolve());
            req.write(data);
            req.end();
          });
        }
      }
    }
  }
}

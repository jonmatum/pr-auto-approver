const nock = require("nock");

// Mock environment
beforeEach(() => {
  process.env.BEDROCK_ENABLED = "false";
  process.env.ALLOWED_AUTHORS = "";
  process.env.APPROVAL_TOKEN = "";
  nock.cleanAll();
});

function createMockContext(action = "opened", author = "testuser") {
  const repo = { owner: "testowner", repo: "testrepo" };
  return {
    payload: {
      action,
      pull_request: {
        number: 1,
        user: { login: author },
        head: { sha: "abc123" },
        title: "test PR",
        body: "test body",
      },
    },
    repo: () => repo,
    octokit: {
      checks: {
        listForRef: jest.fn().mockResolvedValue({ data: { check_runs: [] } }),
      },
      pulls: {
        listReviews: jest.fn().mockResolvedValue({ data: [] }),
        createReview: jest.fn().mockResolvedValue({}),
        get: jest.fn().mockResolvedValue({ data: "diff content" }),
      },
    },
  };
}

function loadApp() {
  delete require.cache[require.resolve("../index")];
  const appFn = require("../index");
  const handlers = {};
  const app = {
    on: (events, handler) => {
      const list = Array.isArray(events) ? events : [events];
      list.forEach((e) => (handlers[e] = handler));
    },
    log: { info: jest.fn(), error: jest.fn() },
  };
  appFn(app);
  return { handlers, app };
}

test("approves PR when no CI checks and no Bedrock", async () => {
  const { handlers } = loadApp();
  const ctx = createMockContext();

  await handlers["pull_request.opened"](ctx);

  expect(ctx.octokit.pulls.createReview).toHaveBeenCalledWith(
    expect.objectContaining({ event: "APPROVE" })
  );
});

test("skips PR from non-allowed author", async () => {
  process.env.ALLOWED_AUTHORS = "alloweduser";
  const { handlers } = loadApp();
  const ctx = createMockContext("opened", "otheruser");

  await handlers["pull_request.opened"](ctx);

  expect(ctx.octokit.pulls.createReview).not.toHaveBeenCalled();
});

test("skips when CI checks are pending", async () => {
  const { handlers } = loadApp();
  const ctx = createMockContext();
  ctx.octokit.checks.listForRef.mockResolvedValue({
    data: { check_runs: [{ status: "in_progress", conclusion: null }] },
  });

  await handlers["pull_request.opened"](ctx);

  expect(ctx.octokit.pulls.createReview).not.toHaveBeenCalled();
});

test("skips when CI checks failed", async () => {
  const { handlers } = loadApp();
  const ctx = createMockContext();
  ctx.octokit.checks.listForRef.mockResolvedValue({
    data: { check_runs: [{ status: "completed", conclusion: "failure" }] },
  });

  await handlers["pull_request.opened"](ctx);

  expect(ctx.octokit.pulls.createReview).not.toHaveBeenCalled();
});

test("skips duplicate review on opened event", async () => {
  const { handlers } = loadApp();
  const ctx = createMockContext();
  ctx.octokit.pulls.listReviews.mockResolvedValue({
    data: [{ state: "APPROVED", user: { type: "Bot" } }],
  });

  await handlers["pull_request.opened"](ctx);

  expect(ctx.octokit.pulls.createReview).not.toHaveBeenCalled();
});

test("allows re-review on synchronize event", async () => {
  const { handlers } = loadApp();
  const ctx = createMockContext("synchronize");

  await handlers["pull_request.synchronize"](ctx);

  expect(ctx.octokit.pulls.createReview).toHaveBeenCalledWith(
    expect.objectContaining({ event: "APPROVE" })
  );
});

test("uses PAT for approval when APPROVAL_TOKEN is set", async () => {
  process.env.APPROVAL_TOKEN = "ghp_test123";
  const { handlers } = loadApp();
  const ctx = createMockContext();

  const scope = nock("https://api.github.com")
    .post("/repos/testowner/testrepo/pulls/1/reviews")
    .reply(200, { id: 1, state: "APPROVED" });

  await handlers["pull_request.opened"](ctx);

  expect(scope.isDone()).toBe(true);
  expect(ctx.octokit.pulls.createReview).not.toHaveBeenCalled();
});

test("falls back to App token when no APPROVAL_TOKEN", async () => {
  process.env.APPROVAL_TOKEN = "";
  const { handlers } = loadApp();
  const ctx = createMockContext();

  await handlers["pull_request.opened"](ctx);

  expect(ctx.octokit.pulls.createReview).toHaveBeenCalled();
});

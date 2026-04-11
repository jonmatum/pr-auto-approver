const nock = require("nock");
const { checkTokenHealth } = require("../token-health");

beforeEach(() => {
  nock.cleanAll();
  jest.spyOn(console, "error").mockImplementation();
  jest.spyOn(console, "warn").mockImplementation();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("logs critical when token is expired (401)", (done) => {
  nock("https://api.github.com").get("/user").reply(401);

  checkTokenHealth("expired-token");

  setTimeout(() => {
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("invalid or expired")
    );
    done();
  }, 100);
});

test("logs warning when token expires soon", (done) => {
  const soon = new Date(Date.now() + 5 * 86400000).toISOString();
  nock("https://api.github.com")
    .get("/user")
    .reply(200, {}, { "github-authentication-token-expiration": soon });

  checkTokenHealth("expiring-token");

  setTimeout(() => {
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/expires in [45] days/)
    );
    done();
  }, 100);
});

test("no warning when token has plenty of time", (done) => {
  const future = new Date(Date.now() + 60 * 86400000).toISOString();
  nock("https://api.github.com")
    .get("/user")
    .reply(200, {}, { "github-authentication-token-expiration": future });

  checkTokenHealth("good-token");

  setTimeout(() => {
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    done();
  }, 100);
});

test("no warning when token has no expiry header", (done) => {
  nock("https://api.github.com").get("/user").reply(200);

  checkTokenHealth("no-expiry-token");

  setTimeout(() => {
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    done();
  }, 100);
});

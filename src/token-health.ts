import https from "https";

const WARN_DAYS = parseInt(process.env.TOKEN_EXPIRY_WARN_DAYS || "14", 10);

export function checkTokenHealth(token: string): void {
  const options = {
    hostname: "api.github.com",
    path: "/user",
    headers: {
      Authorization: `token ${token}`,
      "User-Agent": "pr-auto-approver",
    },
  };

  https.get(options, (res) => {
    if (res.statusCode === 401) {
      console.error("[TOKEN-HEALTH] CRITICAL: Approval token is invalid or expired.");
      return;
    }

    const expiry = res.headers["github-authentication-token-expiration"] as string | undefined;
    if (expiry) {
      const expiresAt = new Date(expiry);
      const daysLeft = Math.floor((expiresAt.getTime() - Date.now()) / 86400000);

      if (daysLeft <= 0) {
        console.error("[TOKEN-HEALTH] CRITICAL: Approval token has expired.");
      } else if (daysLeft <= WARN_DAYS) {
        console.warn(`[TOKEN-HEALTH] WARNING: Approval token expires in ${daysLeft} days (${expiry}). Rotate soon.`);
      }
    }
  }).on("error", (err) => {
    console.error(`[TOKEN-HEALTH] Failed to check token: ${err.message}`);
  });
}

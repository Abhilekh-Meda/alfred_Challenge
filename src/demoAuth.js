const crypto = require("crypto");

const HEADER = "x-demo-password";

function demoPasswordConfigured() {
  return Boolean(process.env.DEMO_PASSWORD && String(process.env.DEMO_PASSWORD).length > 0);
}

/** Constant-time compare of UTF-8 strings via SHA-256 digests. */
function passwordMatches(attempt, expected) {
  const ha = crypto.createHash("sha256").update(String(attempt), "utf8").digest();
  const hb = crypto.createHash("sha256").update(String(expected), "utf8").digest();
  return crypto.timingSafeEqual(ha, hb);
}

function requireDemoAuth(req, res, next) {
  if (!demoPasswordConfigured()) return next();
  const attempt = req.get(HEADER) ?? "";
  if (passwordMatches(attempt, process.env.DEMO_PASSWORD)) return next();
  return res.status(401).json({
    error: "demo_auth_required",
    message: "Wrong or missing demo password.",
  });
}

module.exports = {
  HEADER,
  demoPasswordConfigured,
  passwordMatches,
  requireDemoAuth,
};

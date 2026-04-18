require("dotenv").config();
const express = require("express");
const rateLimit = require("express-rate-limit");
const path = require("path");
const { runPipeline } = require("./src/pipeline");
const { scenarios } = require("./src/scenarios");
const { errorResponse } = require("./src/errorResponse");
const { demoPasswordConfigured, requireDemoAuth } = require("./src/demoAuth");

const app = express();
// Behind Render / other proxies, so per-IP limiting uses X-Forwarded-For.
app.set("trust proxy", 1);

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/session", (_req, res) => {
  res.json({ authRequired: demoPasswordConfigured() });
});

app.get("/api/scenarios", requireDemoAuth, (_req, res) => res.json(scenarios));

const decideLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX_PER_HOUR) || 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: "rate_limited",
      message: "Too many requests from this IP. Try again later.",
    });
  },
});

app.post("/api/decide", requireDemoAuth, decideLimiter, async (req, res) => {
  const { input, simulate, timeoutMs } = req.body ?? {};

  // Simulated malformed output — synthetic error response at the server boundary.
  // Kept out of llmClient/pipeline to avoid leaking test paths into production code.
  if (simulate === "malformed") {
    return res.json(
      errorResponse(input, "malformed_output", "Simulated: model returned unparseable output.", {
        simulated: true,
      })
    );
  }

  // Simulated timeout — real pipeline path with tiny timeout exercises real retry + backoff.
  const effectiveTimeout = simulate === "timeout" ? 50 : timeoutMs;

  const result = await runPipeline(input ?? {}, effectiveTimeout);
  if (simulate === "timeout") result.simulated = true;
  res.json(result);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on :${PORT}`));

require("dotenv").config();
const express = require("express");
const path = require("path");
const { runPipeline } = require("./src/pipeline");
const { scenarios } = require("./src/scenarios");
const { errorResponse } = require("./src/errorResponse");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/scenarios", (_req, res) => res.json(scenarios));

app.post("/api/decide", async (req, res) => {
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

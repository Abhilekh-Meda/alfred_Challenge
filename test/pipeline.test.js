/**
 * Pipeline smoke tests (no HTTP, no OpenAI).
 */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { runPipeline } = require("../src/pipeline");

describe("runPipeline", () => {
  test("missing action_description returns missing_context", async () => {
    const out = await runPipeline(
      { action_description: "", conversation_history: [{ role: "user", content: "hi" }] },
      undefined
    );
    assert.equal(out.error, "missing_context");
  });

  test("missing conversation_history returns missing_context", async () => {
    const out = await runPipeline({ action_description: "do thing", conversation_history: [] }, undefined);
    assert.equal(out.error, "missing_context");
  });
});

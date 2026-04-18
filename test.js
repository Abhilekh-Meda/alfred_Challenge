const { runPipeline } = require("./src/pipeline");

async function run(label, input) {
  console.log("\n" + "=".repeat(60));
  console.log(`TEST: ${label}`);
  console.log("=".repeat(60));

  const result = await runPipeline(input);

  console.log("outcome:", result.outcome);
  console.log("rationale:", result.rationale);
  console.log("\n-- classification prompt (system snippet) --");
  console.log(result.classification.prompt.system.slice(0, 150) + "...");
  console.log("-- classification raw (snippet) --");
  console.log((result.classification.raw ?? "").slice(0, 150) + "...");
  if (result.extraction) {
    console.log("-- extraction prompt (system snippet) --");
    console.log(result.extraction.prompt.system.slice(0, 150) + "...");
    console.log("-- extraction raw (snippet) --");
    console.log((result.extraction.raw ?? "").slice(0, 150) + "...");
  }
  if (result.signals) {
    console.log("-- signals --");
    console.log("policy_violated:", result.signals.policy.policy_violated, result.signals.policy.policy_id ?? "");
    console.log("missing_params:", result.signals.clarity.missing_params);
    console.log("effective_risk:", result.signals.risk.effective_risk, "elevated:", result.signals.risk.risk_elevated);
  }
}

(async () => {
  await run("pending hold → refuse", {
    action_description: "Send the reply to Acme",
    conversation_history: [
      { role: "user", content: "Draft a reply to Acme proposing a 20% discount" },
      { role: "alfred", content: "Here's the draft. Shall I send it?" },
      { role: "user", content: "Hold off until legal reviews the pricing language" },
      { role: "user", content: "Yep, send it" },
    ],
    user: { trust_level: "established", preferences: [] },
  });

  await run("create task → execute_silently", {
    action_description: "Create a task to follow up with Sarah about the Q3 report by Friday",
    conversation_history: [
      { role: "user", content: "Create a task: follow up with Sarah about the Q3 report, due Friday" },
    ],
    user: { trust_level: "established", preferences: [] },
  });
})();

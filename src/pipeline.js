const { runExtraction } = require("./extraction");
const { computeSignals } = require("./signals");
const { route } = require("./router");

function errorResponse(input, error, rationale, extra = {}) {
  return {
    input,
    error,
    outcome: "refuse",
    rationale,
    classification: null,
    extraction: null,
    signals: null,
    ...extra,
  };
}

async function runPipeline(input, timeoutMs) {
  if (!input.action_description?.trim()) {
    return errorResponse(input, "missing_context", "No action description provided.");
  }

  if (!input.conversation_history?.length) {
    return errorResponse(input, "missing_context", "No conversation history provided.");
  }

  let extraction;
  try {
    extraction = await runExtraction(input, timeoutMs);
  } catch (err) {
    return errorResponse(input, err.type ?? "unknown", err.message);
  }

  if (extraction.type === "none") {
    return errorResponse(input, "unrecognized_action", "Could not identify a recognized action type from the request.", {
      classification: extraction.classification,
    });
  }

  const signals = computeSignals(extraction.extracted_action);
  const { outcome, rationale } = route(signals);

  return {
    input,
    error: null,
    classification: extraction.classification,
    extraction: extraction.extraction,
    signals,
    outcome,
    rationale,
  };
}

module.exports = { runPipeline };

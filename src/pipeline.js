const { runExtraction } = require("./extraction");
const { computeSignals } = require("./signals");
const { route } = require("./router");
const { errorResponse } = require("./errorResponse");

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

  let signals, outcome, rationale;
  try {
    signals = computeSignals(extraction.extracted_action);
    ({ outcome, rationale } = route(signals));
  } catch (err) {
    return errorResponse(input, "internal_error", err.message, {
      classification: extraction.classification,
      extraction: extraction.extraction,
    });
  }

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

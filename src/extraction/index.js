const { identifyActionType } = require("./classify");
const { extractActionSchema } = require("./extract");

async function runExtraction(input, timeoutMs) {
  const { action_description, conversation_history } = input;

  const classification = await identifyActionType(
    action_description,
    conversation_history,
    timeoutMs
  );

  const classificationTrace = {
    prompt: classification.prompt,
    raw: classification.raw,
    parsed: { type: classification.type, reasoning: classification.reasoning },
  };

  if (classification.type === "none") {
    return {
      type: "none",
      classification: classificationTrace,
      extraction: null,
      extracted_action: null,
    };
  }

  const extractionResult = await extractActionSchema(
    classification.type,
    action_description,
    conversation_history,
    input.user,
    timeoutMs
  );

  const { prompt, raw, type, ...actionFields } = extractionResult;

  const extractionTrace = {
    prompt,
    raw,
    parsed: actionFields,
  };

  return {
    type: classification.type,
    classification: classificationTrace,
    extraction: extractionTrace,
    extracted_action: { type, ...actionFields },
  };
}

module.exports = { runExtraction };

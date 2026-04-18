const { identifyActionType } = require("./classify");
const { extractActionSchema } = require("./extract");

async function runExtraction(input, timeoutMs) {
  const { action_description, conversation_history } = input;

  const classification = await identifyActionType(
    action_description,
    conversation_history,
    timeoutMs
  );

  if (classification.type === "none") {
    return {
      type: "none",
      classification_reasoning: classification.reasoning,
      extracted_action: null,
    };
  }

  const extracted_action = await extractActionSchema(
    classification.type,
    action_description,
    conversation_history,
    timeoutMs
  );

  return {
    type: classification.type,
    classification_reasoning: classification.reasoning,
    extracted_action,
  };
}

module.exports = { runExtraction };

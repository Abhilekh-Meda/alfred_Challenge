const { z } = require("zod");
const llm = require("../llmClient");
const { ACTION_META, ACTION_TYPES } = require("../schemas");

const ACTION_TYPE_OPTIONS = [...ACTION_TYPES, "none"];

const ActionTypeResultSchema = z.object({
  reasoning: z.string(),
  type: z.enum(ACTION_TYPE_OPTIONS),
});

function buildTypeClassificationPrompt(actionDescription, conversationHistory) {
  const actionList = ACTION_TYPES.map(
    (t) => `- ${t}: ${ACTION_META[t].description}`
  ).join("\n");

  const historyText = conversationHistory
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  return {
    system: `You are a classifier for an AI personal assistant that manages email, calendar, and tasks on behalf of the user.

Given an action description and conversation history, identify which action type is being requested.

Available action types:
${actionList}
- none: The request does not map to any available action, or is too ambiguous to classify

Return "none" if nothing maps cleanly.`,
    user: `Conversation history:
${historyText}

Proposed action: ${actionDescription}`,
  };
}

async function identifyActionType(actionDescription, conversationHistory, timeoutMs) {
  const { system, user } = buildTypeClassificationPrompt(
    actionDescription,
    conversationHistory
  );

  const result = await llm.small({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    schema: ActionTypeResultSchema,
    timeoutMs,
  });

  return result;
}

module.exports = { identifyActionType };

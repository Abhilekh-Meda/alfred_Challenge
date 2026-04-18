const llm = require("../llmClient");
const { ACTION_META, buildActionSchema } = require("../schemas");

function buildExtractionPrompt(type, actionDescription, conversationHistory) {
  const meta = ACTION_META[type];
  const historyText = conversationHistory
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  return {
    system: `You are the extraction layer of alfred_, an AI personal assistant that acts on behalf of users across email, calendar, and tasks.

Your role: given a conversation between a user and alfred_, extract the structured parameters needed to execute a "${type}" action (${meta.description}).

You will be given a schema of fields to populate. For each field, you must provide:
1. Your reasoning for the value you chose (or why it is null)
2. A verbatim quote from the conversation as evidence
3. The extracted value

Core principle: every value must be grounded in something the user explicitly said. If you cannot point to a direct quote, set both evidence and value to null.

${meta.requires_entity ? "This action targets an existing object (email, event, or task). Identify which specific one from the conversation context. Use a descriptive reference — e.g. \"email from Sarah about Q3 renewal\"." : ""}`,
    user: `Conversation:
${historyText}

Proposed action: ${actionDescription}`,
  };
}

async function extractActionSchema(type, actionDescription, conversationHistory, timeoutMs) {
  const schema = buildActionSchema(type);
  const { system, user } = buildExtractionPrompt(type, actionDescription, conversationHistory);

  const result = await llm.large({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    schema,
    timeoutMs,
  });

  return { type, ...result };
}

module.exports = { extractActionSchema };

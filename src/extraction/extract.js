const llm = require("../llmClient");
const { ACTION_META, buildActionSchema } = require("../schemas");
const { getPoliciesForType } = require("../policies");

const RISK_ORDER = { low: 0, medium: 1, high: 2 };

function buildExtractionPrompt(type, actionDescription, conversationHistory, user, applicablePolicies) {
  const meta = ACTION_META[type];
  const historyText = conversationHistory
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const userContext = [
    `- Trust level: ${user.trust_level}`,
    ...(user.preferences.length > 0
      ? [`- Preferences: ${user.preferences.join(", ")}`]
      : []),
  ].join("\n");

  const policySection =
    applicablePolicies.length > 0
      ? `\nCompany policies that apply to this action type — check each one against the conversation:
${applicablePolicies.map((p) => `- ${p.id}: ${p.description}`).join("\n")}
If the conversation context causes any of these to trigger, set policy_violation to the matching policy id and provide a verbatim evidence quote. If none apply, set policy_violation to null.`
      : "";

  return {
    system: `You are the extraction layer of alfred_, an AI personal assistant that acts on behalf of users across email, calendar, and tasks.

Your role: given a conversation between a user and alfred_, extract the structured parameters needed to execute a "${type}" action (${meta.description}).

You will be given a schema of fields to populate. For each field, you must provide:
1. Your reasoning for the value you chose (or why it is null)
2. A verbatim quote from the conversation as evidence
3. The extracted value

Core principle: every value must be grounded in something the user explicitly said. If you cannot point to a direct quote, set both evidence and value to null.

${meta.requires_entity ? "This action targets an existing object (email, event, or task). Identify which specific one from the conversation context. Use a descriptive reference — e.g. \"email from Sarah about Q3 renewal\"." : ""}

Risk assessment: The base floor for this action type is "${meta.min_risk}" risk. When assessing effective_risk, you may only raise it above this floor — never below. Raise the risk if the conversation reveals urgency, irreversibility concerns, a prior hold that was placed, ambiguity about whether the user truly confirmed, or other context that increases the danger of proceeding silently. If no such signals exist, set effective_risk to the floor ("${meta.min_risk}").
${policySection}
User context:
${userContext}`,
    user: `Conversation:
${historyText}

Proposed action: ${actionDescription}`,
  };
}

async function extractActionSchema(type, actionDescription, conversationHistory, user, timeoutMs) {
  const applicablePolicies = getPoliciesForType(type);
  const schema = buildActionSchema(type, applicablePolicies);
  const { system, user: userPrompt } = buildExtractionPrompt(type, actionDescription, conversationHistory, user, applicablePolicies);

  const { parsed, raw } = await llm.large({
    messages: [
      { role: "system", content: system },
      { role: "user", content: userPrompt },
    ],
    schema,
    timeoutMs,
  });

  const meta = ACTION_META[type];
  const llmRisk = parsed.effective_risk;
  const floor = meta.min_risk;
  const effective_risk =
    llmRisk == null || RISK_ORDER[llmRisk] < RISK_ORDER[floor] ? floor : llmRisk;

  const prompt = { system, user: userPrompt };
  return { type, ...parsed, effective_risk, prompt, raw };
}

module.exports = { extractActionSchema };

const { ACTION_META } = require("./schemas");

function isResolved(action, field) {
  const hasEvidence = action[`${field}_evidence`] != null;
  const hasValue = action[field] != null;
  return hasEvidence && hasValue;
}

function checkEntity(action) {
  const meta = ACTION_META[action.type];
  if (!meta.requires_entity) return { entity_resolved: true };
  return { entity_resolved: isResolved(action, "entity_id") };
}

function checkParams(action) {
  const meta = ACTION_META[action.type];
  const missing = meta.required_params.filter((p) => !isResolved(action, p));
  return { missing_params: missing };
}

function checkIntent(action) {
  const meta = ACTION_META[action.type];
  const unresolved = meta.intent_params.filter((p) => !isResolved(action, p));
  return { intent_clear: unresolved.length === 0, unresolved_intent_params: unresolved };
}

function runChecks(action) {
  const entity = checkEntity(action);
  const params = checkParams(action);
  const intent = checkIntent(action);

  return {
    entity_resolved: entity.entity_resolved,
    missing_params: params.missing_params,
    intent_clear: intent.intent_clear,
    unresolved_intent_params: intent.unresolved_intent_params,
    needs_clarification:
      !entity.entity_resolved ||
      params.missing_params.length > 0 ||
      !intent.intent_clear,
  };
}

module.exports = { checkEntity, checkParams, checkIntent, runChecks };

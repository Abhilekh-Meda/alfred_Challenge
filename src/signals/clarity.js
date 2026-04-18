const { ACTION_META } = require("../schemas");

function fieldDetail(action, field) {
  const had_evidence = action[`${field}_evidence`] != null;
  const had_value = action[field] != null;
  return { resolved: had_evidence && had_value, had_evidence, had_value };
}

// Always returns true in this prototype. In production, this would verify that the
// extracted entity_id maps to a real object in the user's data (email, calendar event,
// task) — e.g. via semantic search or indexed lookup over the action space.
function checkEntityMatch(_action) {
  return true;
}

function claritySignals(action) {
  const meta = ACTION_META[action.type];

  const entity_resolved = !meta.requires_entity || (
    action.entity_id_evidence != null && action.entity_id != null
  );
  const entity_match = checkEntityMatch(action);

  const params_audit = Object.fromEntries(
    [...meta.required_params, ...meta.optional_params].map((p) => [p, fieldDetail(action, p)])
  );
  const missing_params = meta.required_params.filter((p) => !params_audit[p].resolved);

  const intent_audit = Object.fromEntries(
    meta.intent_params.map((p) => [p, fieldDetail(action, p)])
  );
  const intent_clear = meta.intent_params.every((p) => intent_audit[p].resolved);

  return {
    needs_clarification: !entity_resolved || !entity_match || missing_params.length > 0 || !intent_clear,
    entity_resolved,
    entity_match,
    missing_params,
    intent_clear,
    audit: {
      entity: meta.requires_entity
        ? { resolved: entity_resolved, had_evidence: action.entity_id_evidence != null, entity_match }
        : { resolved: true, had_evidence: null, entity_match: null },
      params: params_audit,
      intent: intent_audit,
    },
  };
}

module.exports = { claritySignals };

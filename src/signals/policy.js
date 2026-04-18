const { POLICIES, getPoliciesForType } = require("../policies");

function policySignals(action) {
  const applicablePolicies = getPoliciesForType(action.type);
  const violatedId = action.policy_violation ?? null;
  const violatedPolicy = violatedId
    ? POLICIES.find((p) => p.id === violatedId) ?? null
    : null;

  return {
    policy_violated: violatedPolicy != null,
    policy_id: violatedId,
    consequence: violatedPolicy?.consequence ?? null,
    audit: {
      applicable_policies: applicablePolicies.map((p) => p.id),
      violated_id: violatedId,
      consequence: violatedPolicy?.consequence ?? null,
      reasoning: action.policy_violation_reasoning ?? null,
      evidence: action.policy_violation_evidence ?? null,
    },
  };
}

module.exports = { policySignals };

const { ACTION_META } = require("../schemas");

const RISK_ORDER = { low: 0, medium: 1, high: 2 };

function riskSignals(action) {
  const meta = ACTION_META[action.type];
  const min_risk = meta.min_risk;

  // effective_risk is already floor-enforced in extractActionSchema,
  // but we re-enforce here as a defensive check in case action was constructed externally.
  const raw_effective = action.effective_risk ?? min_risk;
  const effective_risk =
    RISK_ORDER[raw_effective] >= RISK_ORDER[min_risk] ? raw_effective : min_risk;

  const risk_elevated = RISK_ORDER[effective_risk] > RISK_ORDER[min_risk];

  return {
    min_risk,
    effective_risk,
    risk_elevated,
    reversible: meta.reversible,
    affects_external: meta.affects_external,
    audit: {
      min_risk,
      raw_effective,
      effective_risk,
      risk_elevated,
      reasoning: action.effective_risk_reasoning ?? null,
      evidence: action.effective_risk_evidence ?? null,
    },
  };
}

module.exports = { riskSignals };

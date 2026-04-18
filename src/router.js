function route(signals) {
  const { clarity, risk, policy } = signals;

  if (policy.policy_violated) {
    return {
      outcome: "refuse",
      rationale: `Policy "${policy.policy_id}" prevents this action.${policy.audit.evidence ? ` Evidence: "${policy.audit.evidence}"` : ""}`,
    };
  }

  const hardClarityBlocked =
    !clarity.entity_resolved ||
    clarity.missing_params.length > 0;

  if (hardClarityBlocked) {
    const reasons = [];
    if (!clarity.entity_resolved) reasons.push("the target entity is unresolved");
    if (clarity.missing_params.length > 0)
      reasons.push(`missing required fields: ${clarity.missing_params.join(", ")}`);
    if (!clarity.intent_clear) reasons.push("intent is unclear");
    return {
      outcome: "ask_clarifying_question",
      rationale: `Cannot proceed — ${reasons.join("; ")}.`,
    };
  }

  if (risk.effective_risk === "high") {
    return {
      outcome: "confirm_before_executing",
      rationale: `High-risk action${risk.risk_elevated ? " (risk elevated by conversation context)" : ""}.`,
    };
  }

  if (risk.effective_risk === "medium" && (!risk.reversible || risk.affects_external)) {
    const reasons = [];
    if (!risk.reversible) reasons.push("irreversible");
    if (risk.affects_external) reasons.push("affects external parties");
    return {
      outcome: "confirm_before_executing",
      rationale: `Medium-risk action (${reasons.join(", ")}) — confirmation required.`,
    };
  }

  if (risk.effective_risk === "low" && !risk.affects_external && !risk.risk_elevated) {
    return {
      outcome: "execute_silently",
      rationale: "Low risk, internal action, no contextual concerns — no need to interrupt.",
    };
  }

  return {
    outcome: "execute_and_notify",
    rationale: "Action is within execution threshold but warrants notification — either external, risk was elevated by context, or medium risk.",
  };
}

module.exports = { route };

const POLICIES = [
  {
    id: "pending_hold",
    description:
      "If the conversation contains an explicit hold, pause, or 'wait for review' instruction that has not been clearly and explicitly rescinded, do not proceed with irreversible or external actions.",
    applies_to: null,
    consequence: "refuse",
  },
  {
    id: "no_implicit_delete",
    description:
      "Never permanently delete an email, event, or task unless the user explicitly stated intent to delete — not just to 'clean up', 'remove from view', or 'cancel'.",
    applies_to: ["delete_email", "delete_event", "delete_task"],
    consequence: "confirm_before_executing",
  },
  {
    id: "no_bulk_external_send",
    description:
      "Never send or forward an email to more than 5 recipients without explicit user confirmation.",
    applies_to: ["send_email", "forward_email"],
    consequence: "confirm_before_executing",
  },
  {
    id: "no_sensitive_forward",
    description:
      "Never forward an email that contains explicitly sensitive, confidential, or legally privileged content unless the user explicitly instructed it.",
    applies_to: ["forward_email"],
    consequence: "refuse",
  },
  {
    id: "no_large_event_change",
    description:
      "Never delete or reschedule a calendar event with 5 or more attendees without explicit user confirmation.",
    applies_to: ["delete_event", "reschedule_event"],
    consequence: "confirm_before_executing",
  },
];

function getPoliciesForType(type) {
  return POLICIES.filter((p) => p.applies_to === null || p.applies_to.includes(type));
}

module.exports = { POLICIES, getPoliciesForType };

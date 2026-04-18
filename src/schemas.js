const { z } = require("zod");

const ACTION_TYPES = [
  // email
  "send_email",
  "reply_email",
  "forward_email",
  "draft_email",
  "delete_email",
  "archive_email",
  // calendar
  "create_event",
  "update_event",
  "delete_event",
  "reschedule_event",
  "accept_invite",
  "decline_invite",
  // tasks & reminders
  "create_task",
  "complete_task",
  "delete_task",
  "update_task",
  "set_reminder",
];

// Stage 1 output — action type identification only
const ActionTypeSchema = z.object({
  type: z.enum(ACTION_TYPES),
});

// Stage 2 output — loose container for the extracted action
// strict per-type shape is built dynamically via buildActionSchema(type)
const ActionSchema = z.object({
  type: z.enum(ACTION_TYPES),
  params: z.record(z.string().nullable()),
  // null for creation actions (send_email, create_event, create_task, set_reminder, draft_email)
  // which target nothing pre-existing
  entity_id: z.string().nullable(),
  intent: z.record(z.string().nullable()),
});


const ActionMetaSchema = z.object({
  required_params: z.array(z.string()),
  optional_params: z.array(z.string()),
  intent_params: z.array(z.string()),
  risk_level: z.enum(["low", "medium", "high"]),
  reversible: z.boolean(),
  affects_external: z.boolean(),
  requires_entity: z.boolean(),
});

const ACTION_META = {
  // --- email ---
  send_email: {
    required_params: ["recipient", "subject", "body"],
    optional_params: ["cc", "bcc", "tone", "send_at"],
    intent_params: ["purpose", "recipient_relationship"],
    risk_level: "high",
    reversible: false,
    affects_external: true,
    requires_entity: false,
  },
  reply_email: {
    required_params: ["body"],
    optional_params: ["tone", "cc"],
    intent_params: ["purpose", "tone_rationale"],
    risk_level: "high",
    reversible: false,
    affects_external: true,
    requires_entity: true,
  },
  forward_email: {
    required_params: ["recipient"],
    optional_params: ["note", "cc"],
    intent_params: ["reason_for_forwarding", "recipient_context"],
    risk_level: "high",
    reversible: false,
    affects_external: true,
    requires_entity: true,
  },
  draft_email: {
    required_params: ["recipient", "subject", "intent"],
    optional_params: ["tone", "key_points", "cc"],
    intent_params: ["purpose", "key_message"],
    risk_level: "low",
    reversible: true,
    affects_external: false,
    requires_entity: false,
  },
  delete_email: {
    required_params: [],
    optional_params: [],
    intent_params: ["reason"],
    risk_level: "medium",
    reversible: false,
    affects_external: false,
    requires_entity: true,
  },
  archive_email: {
    required_params: [],
    optional_params: [],
    intent_params: ["reason"],
    risk_level: "low",
    reversible: true,
    affects_external: false,
    requires_entity: true,
  },

  // --- calendar ---
  create_event: {
    required_params: ["title", "start_time", "end_time"],
    optional_params: ["attendees", "location", "description", "recurrence"],
    intent_params: ["purpose", "attendee_context"],
    risk_level: "medium",
    reversible: true,
    affects_external: true,
    requires_entity: false,
  },
  update_event: {
    required_params: ["changes"],
    optional_params: ["notify_attendees"],
    intent_params: ["reason_for_change"],
    risk_level: "medium",
    reversible: true,
    affects_external: true,
    requires_entity: true,
  },
  delete_event: {
    required_params: [],
    optional_params: ["notify_attendees"],
    intent_params: ["reason"],
    risk_level: "high",
    reversible: false,
    affects_external: true,
    requires_entity: true,
  },
  reschedule_event: {
    required_params: ["new_time"],
    optional_params: ["notify_attendees", "reason"],
    intent_params: ["reason_for_change"],
    risk_level: "high",
    reversible: true,
    affects_external: true,
    requires_entity: true,
  },
  accept_invite: {
    required_params: [],
    optional_params: ["message"],
    intent_params: ["reason"],
    risk_level: "low",
    reversible: true,
    affects_external: true,
    requires_entity: true,
  },
  decline_invite: {
    required_params: [],
    optional_params: ["reason", "message"],
    intent_params: ["reason"],
    risk_level: "medium",
    reversible: false,
    affects_external: true,
    requires_entity: true,
  },

  // --- tasks & reminders ---
  create_task: {
    required_params: ["description"],
    optional_params: ["due_date", "priority", "project"],
    intent_params: ["purpose"],
    risk_level: "low",
    reversible: true,
    affects_external: false,
    requires_entity: false,
  },
  complete_task: {
    required_params: [],
    optional_params: [],
    intent_params: ["reason"],
    risk_level: "low",
    reversible: true,
    affects_external: false,
    requires_entity: true,
  },
  delete_task: {
    required_params: [],
    optional_params: [],
    intent_params: ["reason"],
    risk_level: "medium",
    reversible: false,
    affects_external: false,
    requires_entity: true,
  },
  update_task: {
    required_params: ["changes"],
    optional_params: [],
    intent_params: ["reason_for_change"],
    risk_level: "low",
    reversible: true,
    affects_external: false,
    requires_entity: true,
  },
  set_reminder: {
    required_params: ["description", "time"],
    optional_params: ["recurrence"],
    intent_params: ["purpose"],
    risk_level: "low",
    reversible: true,
    affects_external: false,
    requires_entity: false,
  },
};

function buildActionSchema(type) {
  const meta = ACTION_META[type];
  const allParams = [...meta.required_params, ...meta.optional_params];

  return z.object({
    type: z.literal(type),
    params: z.object(Object.fromEntries(allParams.map((p) => [p, z.string().nullable()]))),
    entity_id: meta.requires_entity ? z.string().nullable() : z.null(),
    intent: z.object(Object.fromEntries(meta.intent_params.map((p) => [p, z.string().nullable()]))),
  });
}

const SignalsSchema = z.object({
  base_risk: z.enum(["low", "medium", "high"]),
  context_risk_factors: z.array(z.string()),
  effective_risk: z.enum(["low", "medium", "high"]),
  intent_clear: z.boolean(),
  missing_params: z.array(z.string()),
  has_pending_hold: z.boolean(),
  affects_external: z.boolean(),
  is_reversible: z.boolean(),
});

const MessageSchema = z.object({
  role: z.enum(["user", "alfred"]),
  content: z.string(),
  timestamp: z.string().optional(),
});

const UserSchema = z.object({
  trust_level: z.enum(["new", "established", "trusted"]),
  preferences: z.array(z.string()).default([]),
});

const DecisionInputSchema = z.object({
  action_description: z.string(),
  conversation_history: z.array(MessageSchema),
  user: UserSchema,
});

const DecisionOutputSchema = z.object({
  thinking: z.string(),
  outcome: z.enum([
    "execute_silently",
    "execute_and_notify",
    "confirm_before_executing",
    "ask_clarifying_question",
    "refuse",
  ]),
  rationale: z.string(),
  message_to_user: z.string(),
});

module.exports = {
  ACTION_TYPES,
  ActionTypeSchema,
  ActionSchema,
  ActionMetaSchema,
  ACTION_META,
  buildActionSchema,
  SignalsSchema,
  DecisionInputSchema,
  DecisionOutputSchema,
};

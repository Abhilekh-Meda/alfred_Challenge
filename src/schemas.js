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

const ActionSchema = z.object({
  type: z.enum(ACTION_TYPES),
  description: z.string(),
  params: z.record(z.unknown()),
});

const ActionMetaSchema = z.object({
  required_params: z.array(z.string()),
  optional_params: z.array(z.string()),
  risk_level: z.enum(["low", "medium", "high"]),
  reversible: z.boolean(),
  affects_external: z.boolean(),
});

const ACTION_META = {
  // --- email ---
  send_email: {
    required_params: ["recipient", "subject", "body"],
    optional_params: ["cc", "bcc", "tone", "send_at"],
    risk_level: "high",
    reversible: false,
    affects_external: true,
  },
  reply_email: {
    required_params: ["original_message", "body"],
    optional_params: ["tone", "cc"],
    risk_level: "high",
    reversible: false,
    affects_external: true,
  },
  forward_email: {
    required_params: ["original_message", "recipient"],
    optional_params: ["note", "cc"],
    risk_level: "high",
    reversible: false,
    affects_external: true,
  },
  draft_email: {
    required_params: ["recipient", "subject", "intent"],
    optional_params: ["tone", "key_points", "cc"],
    risk_level: "low",
    reversible: true,
    affects_external: false,
  },
  delete_email: {
    required_params: ["message"],
    optional_params: [],
    risk_level: "medium",
    reversible: false,
    affects_external: false,
  },
  archive_email: {
    required_params: ["message"],
    optional_params: [],
    risk_level: "low",
    reversible: true,
    affects_external: false,
  },

  // --- calendar ---
  create_event: {
    required_params: ["title", "start_time", "end_time"],
    optional_params: ["attendees", "location", "description", "recurrence"],
    risk_level: "medium",
    reversible: true,
    affects_external: true,
  },
  update_event: {
    required_params: ["event", "changes"],
    optional_params: ["notify_attendees"],
    risk_level: "medium",
    reversible: true,
    affects_external: true,
  },
  delete_event: {
    required_params: ["event"],
    optional_params: ["notify_attendees"],
    risk_level: "high",
    reversible: false,
    affects_external: true,
  },
  reschedule_event: {
    required_params: ["event", "new_time"],
    optional_params: ["notify_attendees", "reason"],
    risk_level: "high",
    reversible: true,
    affects_external: true,
  },
  accept_invite: {
    required_params: ["invite"],
    optional_params: ["message"],
    risk_level: "low",
    reversible: true,
    affects_external: true,
  },
  decline_invite: {
    required_params: ["invite"],
    optional_params: ["reason", "message"],
    risk_level: "medium",
    reversible: false,
    affects_external: true,
  },

  // --- tasks & reminders ---
  create_task: {
    required_params: ["description"],
    optional_params: ["due_date", "priority", "project"],
    risk_level: "low",
    reversible: true,
    affects_external: false,
  },
  complete_task: {
    required_params: ["task"],
    optional_params: [],
    risk_level: "low",
    reversible: true,
    affects_external: false,
  },
  delete_task: {
    required_params: ["task"],
    optional_params: [],
    risk_level: "medium",
    reversible: false,
    affects_external: false,
  },
  update_task: {
    required_params: ["task", "changes"],
    optional_params: [],
    risk_level: "low",
    reversible: true,
    affects_external: false,
  },
  set_reminder: {
    required_params: ["description", "time"],
    optional_params: ["recurrence"],
    risk_level: "low",
    reversible: true,
    affects_external: false,
  },
};

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
  ActionSchema,
  ActionMetaSchema,
  ACTION_META,
  SignalsSchema,
  DecisionInputSchema,
  DecisionOutputSchema,
};

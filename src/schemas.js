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
  description: z.string(),
  required_params: z.array(z.string()),
  optional_params: z.array(z.string()),
  intent_params: z.array(z.string()),
  param_descriptions: z.record(z.string()).default({}),
  intent_descriptions: z.record(z.string()).default({}),
  risk_level: z.enum(["low", "medium", "high"]),
  reversible: z.boolean(),
  affects_external: z.boolean(),
  requires_entity: z.boolean(),
});

const ACTION_META = {
  // --- email ---
  send_email: {
    description: "Compose and send a new email to a recipient",
    required_params: ["recipient", "subject", "body"],
    optional_params: ["cc", "bcc", "tone", "send_at"],
    intent_params: ["purpose", "recipient_relationship"],
    param_descriptions: {
      recipient: "Email address or name of the person to send the email to",
      subject: "Subject line of the email",
      body: "Full body text of the email",
      cc: "Email addresses to CC on the message",
      bcc: "Email addresses to BCC on the message",
      tone: "Desired tone of the email, e.g. 'formal', 'friendly'",
      send_at: "Scheduled time to send the email if not immediate",
    },
    intent_descriptions: {
      purpose: "The goal or reason for sending this email",
      recipient_relationship: "Relationship context, e.g. 'external partner', 'colleague'",
    },
    risk_level: "high",
    reversible: false,
    affects_external: true,
    requires_entity: false,
  },
  reply_email: {
    description: "Send a reply to an existing email",
    required_params: ["body"],
    optional_params: ["tone", "cc"],
    intent_params: ["purpose", "tone_rationale"],
    param_descriptions: {
      body: "The reply text to send",
      tone: "Desired tone of the reply",
      cc: "Email addresses to CC on the reply",
    },
    intent_descriptions: {
      purpose: "The reason for sending this reply",
      tone_rationale: "Why a particular tone is appropriate given the context",
    },
    risk_level: "high",
    reversible: false,
    affects_external: true,
    requires_entity: true,
  },
  forward_email: {
    description: "Forward an existing email to another recipient",
    required_params: ["recipient"],
    optional_params: ["note", "cc"],
    intent_params: ["reason_for_forwarding", "recipient_context"],
    param_descriptions: {
      recipient: "Email address or name of the person to forward to",
      note: "Optional note to prepend to the forwarded email",
      cc: "Email addresses to CC",
    },
    intent_descriptions: {
      reason_for_forwarding: "Why this email is being forwarded",
      recipient_context: "Who the recipient is and why they are receiving this",
    },
    risk_level: "high",
    reversible: false,
    affects_external: true,
    requires_entity: true,
  },
  draft_email: {
    description: "Compose a draft email without sending it",
    required_params: ["recipient", "subject", "intent"],
    optional_params: ["tone", "key_points", "cc"],
    intent_params: ["purpose", "key_message"],
    param_descriptions: {
      recipient: "Email address or name of the intended recipient",
      subject: "Subject line for the draft",
      intent: "High-level intent or key message for the draft",
      tone: "Desired tone, e.g. 'professional', 'apologetic'",
      key_points: "Bullet points or notes the draft should address",
      cc: "Email addresses to CC",
    },
    intent_descriptions: {
      purpose: "The goal of drafting this email",
      key_message: "The core message or ask the email should convey",
    },
    risk_level: "low",
    reversible: true,
    affects_external: false,
    requires_entity: false,
  },
  delete_email: {
    description: "Permanently delete an existing email",
    required_params: [],
    optional_params: [],
    intent_params: ["reason"],
    param_descriptions: {},
    intent_descriptions: {
      reason: "Why the user wants to delete this email",
    },
    risk_level: "medium",
    reversible: false,
    affects_external: false,
    requires_entity: true,
  },
  archive_email: {
    description: "Archive an existing email to remove it from the inbox",
    required_params: [],
    optional_params: [],
    intent_params: ["reason"],
    param_descriptions: {},
    intent_descriptions: {
      reason: "Why the user wants to archive this email",
    },
    risk_level: "low",
    reversible: true,
    affects_external: false,
    requires_entity: true,
  },

  // --- calendar ---
  create_event: {
    description: "Create a new calendar event",
    required_params: ["title", "start_time", "end_time"],
    optional_params: ["attendees", "location", "description", "recurrence"],
    intent_params: ["purpose", "attendee_context"],
    param_descriptions: {
      title: "Title or name of the calendar event",
      start_time: "Start date and time of the event",
      end_time: "End date and time of the event",
      attendees: "Names or emails of people to invite",
      location: "Physical or virtual location of the event",
      description: "Description or agenda for the event",
      recurrence: "Recurrence rule, e.g. 'weekly on Mondays'",
    },
    intent_descriptions: {
      purpose: "The reason for creating this event",
      attendee_context: "Who the attendees are and why they are being invited",
    },
    risk_level: "medium",
    reversible: true,
    affects_external: true,
    requires_entity: false,
  },
  update_event: {
    description: "Modify the details of an existing calendar event",
    required_params: ["changes"],
    optional_params: ["notify_attendees"],
    intent_params: ["reason_for_change"],
    param_descriptions: {
      changes: "Description of what should be changed in the event",
      notify_attendees: "Whether to notify attendees of the change",
    },
    intent_descriptions: {
      reason_for_change: "Why this event needs to be updated",
    },
    risk_level: "medium",
    reversible: true,
    affects_external: true,
    requires_entity: true,
  },
  delete_event: {
    description: "Permanently delete an existing calendar event",
    required_params: [],
    optional_params: ["notify_attendees"],
    intent_params: ["reason"],
    param_descriptions: {
      notify_attendees: "Whether to notify attendees that the event is cancelled",
    },
    intent_descriptions: {
      reason: "Why this event is being deleted",
    },
    risk_level: "high",
    reversible: false,
    affects_external: true,
    requires_entity: true,
  },
  reschedule_event: {
    description: "Move an existing calendar event to a new time",
    required_params: ["new_time"],
    optional_params: ["notify_attendees", "reason"],
    intent_params: ["reason_for_change"],
    param_descriptions: {
      new_time: "The new date and time to move the event to",
      notify_attendees: "Whether to notify attendees of the reschedule",
      reason: "Reason for rescheduling, to share with attendees if needed",
    },
    intent_descriptions: {
      reason_for_change: "Why the event needs to be moved to a different time",
    },
    risk_level: "high",
    reversible: true,
    affects_external: true,
    requires_entity: true,
  },
  accept_invite: {
    description: "Accept a calendar invite from another person",
    required_params: [],
    optional_params: ["message"],
    intent_params: ["reason"],
    param_descriptions: {
      message: "Optional message to include with the acceptance",
    },
    intent_descriptions: {
      reason: "Why the user is accepting this invite",
    },
    risk_level: "low",
    reversible: true,
    affects_external: true,
    requires_entity: true,
  },
  decline_invite: {
    description: "Decline a calendar invite from another person",
    required_params: [],
    optional_params: ["reason", "message"],
    intent_params: ["reason"],
    param_descriptions: {
      reason: "Reason to share with the organizer for declining",
      message: "Optional message to send with the decline",
    },
    intent_descriptions: {
      reason: "Why the user is declining this invite",
    },
    risk_level: "medium",
    reversible: false,
    affects_external: true,
    requires_entity: true,
  },

  // --- tasks & reminders ---
  create_task: {
    description: "Create a new task or to-do item",
    required_params: ["description"],
    optional_params: ["due_date", "priority", "project"],
    intent_params: ["purpose"],
    param_descriptions: {
      description: "What the task is about",
      due_date: "When the task is due",
      priority: "Priority level, e.g. 'high', 'normal', 'low'",
      project: "Project or list the task belongs to",
    },
    intent_descriptions: {
      purpose: "Why this task is being created",
    },
    risk_level: "low",
    reversible: true,
    affects_external: false,
    requires_entity: false,
  },
  complete_task: {
    description: "Mark an existing task as completed",
    required_params: [],
    optional_params: [],
    intent_params: ["reason"],
    param_descriptions: {},
    intent_descriptions: {
      reason: "Why this task is being marked complete",
    },
    risk_level: "low",
    reversible: true,
    affects_external: false,
    requires_entity: true,
  },
  delete_task: {
    description: "Permanently delete an existing task",
    required_params: [],
    optional_params: [],
    intent_params: ["reason"],
    param_descriptions: {},
    intent_descriptions: {
      reason: "Why this task is being deleted rather than completed",
    },
    risk_level: "medium",
    reversible: false,
    affects_external: false,
    requires_entity: true,
  },
  update_task: {
    description: "Modify the details of an existing task",
    required_params: ["changes"],
    optional_params: [],
    intent_params: ["reason_for_change"],
    param_descriptions: {
      changes: "Description of what should be changed in the task",
    },
    intent_descriptions: {
      reason_for_change: "Why the task details need to be updated",
    },
    risk_level: "low",
    reversible: true,
    affects_external: false,
    requires_entity: true,
  },
  set_reminder: {
    description: "Set a reminder to notify the user at a specific time",
    required_params: ["description", "time"],
    optional_params: ["recurrence"],
    intent_params: ["purpose"],
    param_descriptions: {
      description: "What the reminder is for",
      time: "When the reminder should fire",
      recurrence: "Recurrence pattern if this reminder repeats",
    },
    intent_descriptions: {
      purpose: "Why the user wants this reminder",
    },
    risk_level: "low",
    reversible: true,
    affects_external: false,
    requires_entity: false,
  },
};

function buildActionSchema(type) {
  const meta = ACTION_META[type];
  const allParams = [...meta.required_params, ...meta.optional_params];
  const fields = {};

  fields.reasoning = z
    .string()
    .describe("Overall reasoning about the action and what could be extracted from the conversation");

  if (meta.requires_entity) {
    fields.entity_id_reasoning = z
      .string()
      .nullable()
      .describe("Your reasoning for why this entity has the value it does, or why it is null");
    fields.entity_id_evidence = z
      .string()
      .nullable()
      .describe("A verbatim quote from the conversation that identifies the entity. Set to null if no direct evidence exists. Do not paraphrase.");
    fields.entity_id = z
      .string()
      .nullable()
      .describe("A descriptive string reference to the entity from the conversation (e.g. 'email from Alice about Q1 report'). Set to null if evidence is null.");
  }

  for (const p of allParams) {
    const desc = meta.param_descriptions?.[p] ?? `The value of ${p}`;
    fields[`${p}_reasoning`] = z
      .string()
      .nullable()
      .describe("Your reasoning for why this field has the value it does, or why it is null");
    fields[`${p}_evidence`] = z
      .string()
      .nullable()
      .describe("A verbatim quote from the conversation that supports this value. Set to null if no direct evidence exists. Do not paraphrase.");
    fields[p] = z
      .string()
      .nullable()
      .describe(`${desc} Set to null if evidence is null.`);
  }

  for (const p of meta.intent_params) {
    const desc = meta.intent_descriptions?.[p] ?? `The value of ${p}`;
    fields[`${p}_reasoning`] = z
      .string()
      .nullable()
      .describe("Your reasoning for why this field has the value it does, or why it is null");
    fields[`${p}_evidence`] = z
      .string()
      .nullable()
      .describe("A verbatim quote from the conversation that supports this value. Set to null if no direct evidence exists. Do not paraphrase.");
    fields[p] = z
      .string()
      .nullable()
      .describe(`${desc} Set to null if evidence is null.`);
  }

  return z.object(fields);
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

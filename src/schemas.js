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

// TODO: define ActionMetaSchema and ACTION_META during signal computation implementation

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
  DecisionInputSchema,
  DecisionOutputSchema,
};

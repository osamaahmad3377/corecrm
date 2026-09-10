import { z } from "zod";

export const AUTOMATION_TRIGGERS = [
  "CLIENT_ONBOARDED",
  "INVITATION_REMINDER",
  "CLIENT_USER_ACTIVATED",
  "TICKET_CREATED",
  "TICKET_ASSIGNED",
  "TICKET_AWAITING_CLIENT",
  "TICKET_RESOLVED",
  "TICKET_NO_CLIENT_REPLY",
  "TICKET_STALE",
  "WEEKLY_CLIENT_DIGEST",
  "CLIENT_INACTIVE",
] as const;

export const AUTOMATION_AUDIENCES = [
  "TICKET_REQUESTER",
  "ORG_PRIMARY_CONTACT",
  "ORG_CLIENT_ADMINS",
  "ORG_CLIENT_USERS",
  "ASSIGNED_AGENT",
  "INVITED_PERSON",
] as const;

/** Which triggers are event-driven (immediate + delay) vs time-based (threshold). */
export const TIME_BASED_TRIGGERS = new Set([
  "INVITATION_REMINDER",
  "TICKET_NO_CLIENT_REPLY",
  "TICKET_STALE",
  "WEEKLY_CLIENT_DIGEST",
  "CLIENT_INACTIVE",
]);

export const automationRuleInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(400).optional().or(z.literal("")),
  emailTemplateId: z.string().uuid(),
  audience: z.enum(AUTOMATION_AUDIENCES),
  delayMinutes: z.coerce.number().int().min(0).max(60 * 24 * 30).default(0),
  thresholdDays: z.coerce.number().int().min(1).max(365).default(3),
  isActive: z.boolean().default(true),
});

export const createAutomationRuleSchema = automationRuleInputSchema.extend({
  trigger: z.enum(AUTOMATION_TRIGGERS),
});

export type AutomationRuleInput = z.infer<typeof automationRuleInputSchema>;

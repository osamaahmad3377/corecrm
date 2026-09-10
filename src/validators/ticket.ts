import { z } from "zod";
import { phoneSchema } from "./common";

export const ticketAttachmentRefSchema = z.object({
  fileId: z.string().uuid(),
});

/** Client-facing ticket creation (portal). */
export const createTicketSchema = z.object({
  subject: z.string().trim().min(4, "Give the ticket a clear subject").max(200),
  description: z
    .string()
    .trim()
    .min(10, "Please describe the problem in a little more detail")
    .max(20000),
  categoryId: z.string().uuid().optional().or(z.literal("")),
  subcategoryId: z.string().uuid().optional().or(z.literal("")),
  priorityKey: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  service: z.string().trim().max(120).optional().or(z.literal("")),
  assetId: z.string().uuid().optional().or(z.literal("")),
  location: z.string().trim().max(160).optional().or(z.literal("")),
  contactPhone: phoneSchema,
  preferredContactMethod: z
    .enum(["EMAIL", "PHONE", "PORTAL"])
    .optional()
    .or(z.literal("")),
  impact: z.enum(["LOW", "MEDIUM", "HIGH"]).optional().or(z.literal("")),
  urgency: z.enum(["LOW", "MEDIUM", "HIGH"]).optional().or(z.literal("")),
  /** Client's "needed by" date — a request, not a commitment. */
  requestedDueAt: z.string().optional().or(z.literal("")),
  attachments: z.array(ticketAttachmentRefSchema).max(10).default([]),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

/** Internal ticket creation — also picks organization + requester contact. */
export const createTicketInternalSchema = createTicketSchema.extend({
  organizationId: z.string().uuid(),
  requesterContactId: z.string().uuid(),
  assignedAgentId: z.string().uuid().optional().or(z.literal("")),
  assignedTeamId: z.string().uuid().optional().or(z.literal("")),
});

export const addMessageSchema = z.object({
  body: z.string().trim().min(1, "Message can't be empty").max(20000),
  messageType: z.enum(["PUBLIC_REPLY", "INTERNAL_NOTE"]).default("PUBLIC_REPLY"),
  attachments: z.array(ticketAttachmentRefSchema).max(10).default([]),
});

export type AddMessageInput = z.infer<typeof addMessageSchema>;

export const assignTicketSchema = z.object({
  assignedAgentId: z.string().uuid().nullable(),
  assignedTeamId: z.string().uuid().nullable().optional(),
});

export const changeStatusSchema = z.object({
  statusKey: z.enum([
    "NEW",
    "OPEN",
    "IN_PROGRESS",
    "WAITING_FOR_CLIENT",
    "WAITING_FOR_INTERNAL",
    "RESOLVED",
    "CLOSED",
    "CANCELLED",
  ]),
});

export const changePrioritySchema = z.object({
  priorityKey: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
});

export const dueDateSchema = z.object({
  /** ISO string, or null / "" to clear. */
  dueAt: z.string().nullable().optional(),
});

export const ticketListFilterSchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.string().optional(), // status key, "OPEN_ALL" or "CLOSED_ALL"
  priority: z.string().optional(),
  organizationId: z.string().uuid().optional(),
  assignedAgentId: z.string().optional(), // uuid or "me" or "unassigned"
  view: z
    .enum(["all", "my", "unassigned", "critical", "sla-breached", "closed"])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().default(25),
  sort: z
    .enum(["newest", "oldest", "updated", "priority"])
    .default("newest"),
});

export type TicketListFilter = z.infer<typeof ticketListFilterSchema>;

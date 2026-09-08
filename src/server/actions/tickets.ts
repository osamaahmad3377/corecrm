"use server";

import { redirect } from "next/navigation";
import { requireAuth, requirePermission } from "@/server/auth/context";
import { runAction, requestMeta, type ActionState } from "./_helpers";
import {
  addMessageSchema,
  assignTicketSchema,
  changePrioritySchema,
  changeStatusSchema,
  createTicketInternalSchema,
  createTicketSchema,
} from "@/validators/ticket";
import {
  addMessage,
  assignTicket,
  changePriority,
  changeStatus,
  createTicketFromPortal,
  createTicketInternal,
  setTicketDueDate,
} from "@/server/services/ticket";

export async function createPortalTicketAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  const ctx = await requireAuth();
  if (ctx.isInternal) return { ok: false, error: "Use the admin console." };

  const parsed = createTicketSchema.safeParse({
    subject: formData.get("subject"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId") || "",
    subcategoryId: formData.get("subcategoryId") || "",
    priorityKey: formData.get("priorityKey") || "MEDIUM",
    service: formData.get("service") || "",
    assetId: formData.get("assetId") || "",
    location: formData.get("location") || "",
    contactPhone: formData.get("contactPhone") || "",
    preferredContactMethod: formData.get("preferredContactMethod") || "",
    impact: formData.get("impact") || "",
    urgency: formData.get("urgency") || "",
    attachments: JSON.parse((formData.get("attachments") as string) || "[]"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please check the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const result = await runAction(async () => {
    const meta = await requestMeta();
    const ticket = await createTicketFromPortal({ ctx, input: parsed.data, meta });
    return { data: { id: ticket.id }, revalidate: ["/portal", "/portal/tickets"] };
  });

  if (result.ok && result.data) redirect(`/portal/tickets/${result.data.id}`);
  return result;
}

export async function createInternalTicketAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  const ctx = await requirePermission("ticket.create");

  const parsed = createTicketInternalSchema.safeParse({
    organizationId: formData.get("organizationId"),
    requesterContactId: formData.get("requesterContactId"),
    subject: formData.get("subject"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId") || "",
    subcategoryId: formData.get("subcategoryId") || "",
    priorityKey: formData.get("priorityKey") || "MEDIUM",
    service: formData.get("service") || "",
    assetId: formData.get("assetId") || "",
    location: formData.get("location") || "",
    contactPhone: formData.get("contactPhone") || "",
    preferredContactMethod: formData.get("preferredContactMethod") || "",
    impact: formData.get("impact") || "",
    urgency: formData.get("urgency") || "",
    assignedAgentId: formData.get("assignedAgentId") || "",
    assignedTeamId: formData.get("assignedTeamId") || "",
    attachments: JSON.parse((formData.get("attachments") as string) || "[]"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please check the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const result = await runAction(async () => {
    const meta = await requestMeta();
    const ticket = await createTicketInternal({
      ctx,
      organizationId: parsed.data.organizationId,
      requesterContactId: parsed.data.requesterContactId,
      input: parsed.data,
      meta,
    });
    return { data: { id: ticket.id }, revalidate: ["/admin/tickets", "/admin"] };
  });

  if (result.ok && result.data) redirect(`/admin/tickets/${result.data.id}`);
  return result;
}

export async function addTicketMessageAction(
  ticketId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth();
  const parsed = addMessageSchema.safeParse({
    body: formData.get("body"),
    messageType: formData.get("messageType") || "PUBLIC_REPLY",
    attachments: JSON.parse((formData.get("attachments") as string) || "[]"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Message invalid." };
  }
  return runAction(async () => {
    const ctx = await requireAuth();
    const meta = await requestMeta();
    await addMessage(ctx, ticketId, parsed.data, meta);
    return {
      revalidate: [
        `/admin/tickets/${ticketId}`,
        `/portal/tickets/${ticketId}`,
      ],
      message: "Sent",
    };
  });
}

export async function assignTicketAction(
  ticketId: string,
  input: { assignedAgentId: string | null; assignedTeamId?: string | null },
): Promise<ActionState> {
  await requirePermission("ticket.assign");
  const parsed = assignTicketSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid assignment." };
  return runAction(async () => {
    const ctx = await requireAuth();
    const meta = await requestMeta();
    await assignTicket(ctx, ticketId, parsed.data, meta);
    return { revalidate: [`/admin/tickets/${ticketId}`, "/admin/tickets"] };
  });
}

export async function changeStatusAction(
  ticketId: string,
  statusKey: string,
): Promise<ActionState> {
  await requireAuth();
  const parsed = changeStatusSchema.safeParse({ statusKey });
  if (!parsed.success) return { ok: false, error: "Invalid status." };
  return runAction(async () => {
    const ctx = await requireAuth();
    const meta = await requestMeta();
    await changeStatus(ctx, ticketId, parsed.data.statusKey, meta);
    return {
      revalidate: [
        `/admin/tickets/${ticketId}`,
        `/portal/tickets/${ticketId}`,
        "/admin/tickets",
        "/portal/tickets",
      ],
    };
  });
}

export async function changePriorityAction(
  ticketId: string,
  priorityKey: string,
): Promise<ActionState> {
  await requirePermission("ticket.changePriority");
  const parsed = changePrioritySchema.safeParse({ priorityKey });
  if (!parsed.success) return { ok: false, error: "Invalid priority." };
  return runAction(async () => {
    const ctx = await requireAuth();
    const meta = await requestMeta();
    await changePriority(ctx, ticketId, parsed.data.priorityKey, meta);
    return { revalidate: [`/admin/tickets/${ticketId}`, "/admin/tickets"] };
  });
}

export async function setTicketDueDateAction(
  ticketId: string,
  dueAtIso: string | null,
): Promise<ActionState> {
  const ctx = await requirePermission("ticket.setDueDate");
  return runAction(async () => {
    const meta = await requestMeta();
    await setTicketDueDate(ctx, ticketId, dueAtIso, meta);
    return {
      revalidate: [
        `/admin/tickets/${ticketId}`,
        `/employee/tasks/${ticketId}`,
        "/admin/tickets",
        "/employee/tasks",
      ],
    };
  });
}

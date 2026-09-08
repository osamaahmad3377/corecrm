"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { requirePermission } from "@/server/auth/context";
import { runAction, requestMeta, type ActionState } from "./_helpers";
import {
  disconnectEmailAccount,
  syncAccount,
  updateEmailAccount,
} from "@/server/services/email-account";
import {
  clearEmailHandled,
  convertEmailToTicket,
  markEmailHandled,
  sendSupportEmail,
} from "@/server/services/email-send";

const sendSchema = z.object({
  emailAccountId: z.string().uuid(),
  to: z.string().min(3),
  cc: z.string().optional(),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(50000),
  ticketId: z.string().uuid().optional().or(z.literal("")),
  inReplyToEmailMessageId: z.string().uuid().optional().or(z.literal("")),
});

export async function sendSupportEmailAction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const ctx = await requirePermission("email.send");
  const parsed = sendSchema.safeParse({
    emailAccountId: fd.get("emailAccountId"),
    to: fd.get("to"),
    cc: fd.get("cc") || "",
    subject: fd.get("subject"),
    body: fd.get("body"),
    ticketId: fd.get("ticketId") || "",
    inReplyToEmailMessageId: fd.get("inReplyToEmailMessageId") || "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  return runAction(async () => {
    const meta = await requestMeta();
    await sendSupportEmail({
      ctx,
      emailAccountId: parsed.data.emailAccountId,
      to: parsed.data.to.split(/[,;\s]+/).filter(Boolean),
      cc: parsed.data.cc
        ? parsed.data.cc.split(/[,;\s]+/).filter(Boolean)
        : undefined,
      subject: parsed.data.subject,
      body: parsed.data.body,
      ticketId: parsed.data.ticketId || undefined,
      inReplyToEmailMessageId: parsed.data.inReplyToEmailMessageId || undefined,
      meta,
    });
    return {
      message: "Email sent",
      revalidate: [
        "/admin/emails/inbox",
        parsed.data.ticketId ? `/admin/tickets/${parsed.data.ticketId}` : "/admin/emails",
      ],
    };
  });
}

export async function syncEmailAccountAction(id: string): Promise<ActionState> {
  await requirePermission("email.inbox.view");
  return runAction(async () => {
    const res = await syncAccount(id);
    return {
      message: `Synced — ${res.created} new message${res.created === 1 ? "" : "s"}`,
      revalidate: ["/admin/emails/inbox", "/admin/emails/accounts"],
    };
  });
}

export async function updateEmailAccountAction(
  id: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const ctx = await requirePermission("email.account.manage");
  return runAction(async () => {
    const meta = await requestMeta();
    await updateEmailAccount(
      ctx,
      id,
      {
        displayName: (fd.get("displayName") as string) || undefined,
        scope: (fd.get("scope") as "GLOBAL" | "ORGANIZATION" | "TEAM") || undefined,
        organizationId: (fd.get("organizationId") as string) || null,
        teamId: (fd.get("teamId") as string) || null,
        isActive: fd.get("isActive") === "on",
      },
      meta,
    );
    return { message: "Saved", revalidate: ["/admin/emails/accounts"] };
  });
}

export async function disconnectEmailAccountAction(
  id: string,
): Promise<ActionState> {
  const ctx = await requirePermission("email.account.manage");
  return runAction(async () => {
    const meta = await requestMeta();
    await disconnectEmailAccount(ctx, id, meta);
    return { revalidate: ["/admin/emails/accounts"] };
  });
}

export async function markEmailHandledAction(
  emailMessageId: string,
  status: "INFO" | "IGNORED",
): Promise<ActionState> {
  const ctx = await requirePermission("email.triage");
  return runAction(async () => {
    const meta = await requestMeta();
    await markEmailHandled(ctx, emailMessageId, status, meta);
    return {
      message: status === "INFO" ? "Marked as info" : "Ignored",
      revalidate: ["/admin/emails/inbox", "/admin/emails", "/admin"],
    };
  });
}

export async function clearEmailHandledAction(
  emailMessageId: string,
): Promise<ActionState> {
  const ctx = await requirePermission("email.triage");
  return runAction(async () => {
    await clearEmailHandled(ctx, emailMessageId);
    return { revalidate: ["/admin/emails/inbox", "/admin/emails"] };
  });
}

export async function convertEmailToTicketAction(
  emailMessageId: string,
): Promise<ActionState<{ ticketId: string }>> {
  const ctx = await requirePermission("email.convertToTicket");
  const result = await runAction(async () => {
    const meta = await requestMeta();
    const res = await convertEmailToTicket({ ctx, emailMessageId, meta });
    return { data: { ticketId: res.ticketId }, revalidate: ["/admin/emails/inbox"] };
  });
  if (result.ok && result.data) redirect(`/admin/tickets/${result.data.ticketId}`);
  return result;
}

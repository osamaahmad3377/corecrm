import "server-only";
import { prisma } from "@/server/db/client";
import { AuthContext, can } from "@/server/auth/rbac";
import { forbidden, notFound, validationError } from "@/lib/errors";
import { sanitizeMessageHtml, textToHtml, snippet } from "@/lib/sanitize";
import { getEmailProvider } from "@/server/providers/email/factory";
import { providerCtxFor } from "./email-account";
import { recordAudit } from "./audit";
import { ingestMessage } from "./email-ingest";

interface SendArgs {
  ctx: AuthContext;
  emailAccountId: string;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  ticketId?: string;
  inReplyToEmailMessageId?: string;
  meta?: { ipAddress?: string | null; userAgent?: string | null };
}

/** Send an email through a connected support mailbox and link it to a ticket. */
export async function sendSupportEmail(args: SendArgs) {
  if (!can(args.ctx, "email.send")) throw forbidden();

  const account = await prisma.emailAccount.findUnique({
    where: { id: args.emailAccountId },
  });
  if (!account || account.status !== "CONNECTED" || !account.isActive) {
    throw validationError("That mailbox is not connected.");
  }
  if (args.to.length === 0) throw validationError("Add at least one recipient.");

  let inReplyToProviderMessageId: string | undefined;
  if (args.inReplyToEmailMessageId) {
    const prev = await prisma.emailMessage.findUnique({
      where: { id: args.inReplyToEmailMessageId },
      select: { providerMessageId: true, emailAccountId: true },
    });
    if (prev && prev.emailAccountId === account.id) {
      inReplyToProviderMessageId = prev.providerMessageId;
    }
  }

  const bodyHtml = sanitizeMessageHtml(
    args.body.includes("<") ? args.body : textToHtml(args.body),
  );

  const provider = getEmailProvider(account.provider);
  const { ctx: pctx } = await providerCtxFor(account.id);

  const sent = await provider.sendMessage(pctx, {
    to: args.to,
    cc: args.cc,
    subject: args.subject,
    bodyHtml,
    inReplyToProviderMessageId,
  });

  // Persist the outbound message + link to ticket.
  await ingestMessage(account, {
    ...sent,
    providerThreadId: sent.providerThreadId || `manual-${Date.now()}`,
    direction: "OUTBOUND",
    from: { address: account.address },
    to: args.to.map((address) => ({ address })),
    subject: args.subject,
    bodyHtml,
    hasAttachments: false,
    sentAt: new Date(),
  });

  if (args.ticketId) {
    const email = await prisma.emailMessage.findFirst({
      where: { emailAccountId: account.id, providerMessageId: sent.providerMessageId },
      select: { id: true },
    });
    await prisma.$transaction([
      prisma.emailThread.updateMany({
        where: {
          emailAccountId: account.id,
          providerThreadId: sent.providerThreadId || undefined,
        },
        data: { ticketId: args.ticketId },
      }),
      prisma.ticketMessage.create({
        data: {
          ticketId: args.ticketId,
          authorUserId: args.ctx.userId,
          authorType: "AGENT",
          messageType: "PUBLIC_REPLY",
          body: bodyHtml,
          emailMessageId: email?.id ?? null,
        },
      }),
      prisma.ticketActivity.create({
        data: {
          ticketId: args.ticketId,
          actorUserId: args.ctx.userId,
          type: "EMAIL_LINKED",
          toValue: snippet(args.subject, 60),
        },
      }),
    ]);
  }

  await recordAudit({
    action: "EMAIL_SENT",
    entityType: "emailAccount",
    entityId: account.id,
    actorUserId: args.ctx.userId,
    ipAddress: args.meta?.ipAddress,
    userAgent: args.meta?.userAgent,
    metadata: { to: args.to, subject: args.subject, ticketId: args.ticketId },
  });

  return { ok: true };
}

/** Triage an inbound email that is not a support request. */
export async function markEmailHandled(
  ctx: AuthContext,
  emailMessageId: string,
  status: "INFO" | "IGNORED",
  meta?: { ipAddress?: string | null; userAgent?: string | null },
) {
  if (!can(ctx, "email.triage")) throw forbidden();
  const email = await prisma.emailMessage.findUnique({
    where: { id: emailMessageId },
    select: { id: true, ticketId: true, subject: true, emailAccount: { select: { address: true } } },
  });
  if (!email) throw notFound("Email not found");
  if (email.ticketId) {
    throw validationError("This email is already linked to a ticket");
  }
  await prisma.emailMessage.update({
    where: { id: emailMessageId },
    data: { handledStatus: status, handledById: ctx.userId, handledAt: new Date() },
  });
  await recordAudit({
    action: "EMAIL_RECEIVED",
    entityType: "emailMessage",
    entityId: emailMessageId,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    metadata: { triage: status, subject: email.subject, account: email.emailAccount.address },
  });
}

/** Undo a triage decision (returns the email to the queue). */
export async function clearEmailHandled(
  ctx: AuthContext,
  emailMessageId: string,
) {
  if (!can(ctx, "email.triage")) throw forbidden();
  await prisma.emailMessage.updateMany({
    where: { id: emailMessageId },
    data: { handledStatus: null, handledById: null, handledAt: null },
  });
}

interface ConvertArgs {
  ctx: AuthContext;
  emailMessageId: string;
  meta?: { ipAddress?: string | null; userAgent?: string | null };
}

/** Convert an inbound email into a new ticket. */
export async function convertEmailToTicket({ ctx, emailMessageId, meta }: ConvertArgs) {
  if (!can(ctx, "email.convertToTicket")) throw forbidden();

  const email = await prisma.emailMessage.findUnique({
    where: { id: emailMessageId },
    include: { emailThread: true, contact: true, emailAccount: true },
  });
  if (!email) throw notFound("Email not found");
  if (email.ticketId) {
    return { ticketId: email.ticketId, alreadyLinked: true };
  }

  let contact = email.contact;
  let organizationId = email.organizationId ?? email.emailAccount.organizationId;

  if (!contact) {
    // Try one more resolution pass.
    const found = await prisma.contact.findFirst({
      where: { email: email.fromAddress.toLowerCase() },
      include: { organization: { select: { id: true } } },
    });
    if (found) {
      contact = found;
      organizationId = found.organizationId;
    }
  }

  if (!contact || !organizationId) {
    throw validationError(
      "This sender isn't linked to a contact yet. Add them as a contact under an organization first.",
    );
  }

  const { createTicket } = await import("./ticket");
  const ticket = await createTicket({
    ctx,
    organizationId,
    requesterContactId: contact.id,
    requesterUserId: null,
    source: "EMAIL",
    input: {
      subject: email.subject ?? "(no subject)",
      description: email.bodyText ?? snippet(email.snippet ?? "", 4000),
      priorityKey: "MEDIUM",
      categoryId: "",
      subcategoryId: "",
      service: "",
      assetId: "",
      location: "",
      contactPhone: "",
      preferredContactMethod: "",
      impact: "",
      urgency: "",
      attachments: [],
    },
    meta,
    notifyClient: false,
  });

  await prisma.$transaction([
    prisma.emailMessage.update({
      where: { id: email.id },
      data: { ticketId: ticket.id, contactId: contact.id, organizationId },
    }),
    prisma.emailThread.update({
      where: { id: email.emailThreadId },
      data: { ticketId: ticket.id, contactId: contact.id, organizationId },
    }),
    prisma.ticketActivity.create({
      data: { ticketId: ticket.id, actorUserId: ctx.userId, type: "EMAIL_LINKED" },
    }),
  ]);

  await recordAudit({
    action: "EMAIL_CONVERTED_TO_TICKET",
    entityType: "ticket",
    entityId: ticket.id,
    actorUserId: ctx.userId,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    metadata: { emailMessageId, ticketNumber: ticket.ticketNumber },
  });

  return { ticketId: ticket.id, ticketNumber: ticket.ticketNumber };
}

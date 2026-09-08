import "server-only";
import type { EmailAccount } from "@prisma/client";
import { prisma } from "@/server/db/client";
import type { NormalizedMessage } from "@/server/providers/email/types";
import { sanitizeEmailHtml, textToHtml, snippet } from "@/lib/sanitize";
import { recordAudit } from "./audit";
import { logger } from "@/lib/logger";

const TICKET_NUMBER_RE = /\bTKT-\d{4}-\d{6}\b/;

/**
 * Persist one provider message idempotently and wire up its relationships:
 * thread → contact → organization → ticket. Safe to call repeatedly with the
 * same message (unique key on emailAccountId + providerMessageId).
 */
export async function ingestMessage(
  account: EmailAccount,
  m: NormalizedMessage,
): Promise<{ created: boolean; emailMessageId: string }> {
  // 1. Dedup.
  const existing = await prisma.emailMessage.findUnique({
    where: {
      emailAccountId_providerMessageId: {
        emailAccountId: account.id,
        providerMessageId: m.providerMessageId,
      },
    },
    select: { id: true },
  });
  if (existing) return { created: false, emailMessageId: existing.id };

  // 2. Resolve contact + organization from the counterparty address.
  const counterparty =
    m.direction === "INBOUND" ? m.from.address : m.to[0]?.address;
  let contactId: string | null = null;
  let organizationId: string | null = account.organizationId ?? null;

  if (counterparty) {
    const contact = await prisma.contact.findFirst({
      where: { email: counterparty.toLowerCase() },
      include: { organization: { select: { id: true, status: true } } },
      orderBy: { createdAt: "asc" },
    });
    if (contact && contact.organization.status === "ACTIVE") {
      contactId = contact.id;
      organizationId = contact.organizationId;
    }
  }

  // 3. Resolve or create the thread.
  const thread = await prisma.emailThread.upsert({
    where: {
      emailAccountId_providerThreadId: {
        emailAccountId: account.id,
        providerThreadId: m.providerThreadId || m.providerMessageId,
      },
    },
    create: {
      emailAccountId: account.id,
      providerThreadId: m.providerThreadId || m.providerMessageId,
      subject: m.subject,
      contactId,
      organizationId,
      lastMessageAt: m.receivedAt ?? m.sentAt ?? new Date(),
    },
    update: {
      lastMessageAt: m.receivedAt ?? m.sentAt ?? new Date(),
      ...(contactId ? { contactId } : {}),
      ...(organizationId ? { organizationId } : {}),
    },
  });

  // 4. Try to associate with an existing ticket.
  let ticketId = thread.ticketId;
  if (!ticketId) {
    // by ticket number in the subject
    const match = m.subject?.match(TICKET_NUMBER_RE);
    if (match) {
      const t = await prisma.ticket.findUnique({
        where: { ticketNumber: match[0] },
        select: { id: true, organizationId: true },
      });
      if (t && (!organizationId || t.organizationId === organizationId)) {
        ticketId = t.id;
      }
    }
  }
  if (!ticketId && (m.inReplyTo || m.references?.length)) {
    const refIds = [m.inReplyTo, ...(m.references ?? [])].filter(
      Boolean,
    ) as string[];
    const linked = await prisma.emailMessage.findFirst({
      where: {
        emailAccountId: account.id,
        internetMessageId: { in: refIds },
        ticketId: { not: null },
      },
      select: { ticketId: true },
    });
    if (linked?.ticketId) ticketId = linked.ticketId;
  }

  // 5. Store the message.
  const bodyHtml = m.bodyHtml
    ? sanitizeEmailHtml(m.bodyHtml)
    : m.bodyText
      ? textToHtml(m.bodyText)
      : "";

  const stored = await prisma.emailMessage.create({
    data: {
      emailThreadId: thread.id,
      emailAccountId: account.id,
      providerMessageId: m.providerMessageId,
      internetMessageId: m.internetMessageId,
      direction: m.direction,
      fromAddress: m.from.address,
      fromName: m.from.name,
      toAddresses: m.to.map((a) => a.address),
      ccAddresses: m.cc?.map((a) => a.address) ?? undefined,
      subject: m.subject,
      bodyHtml,
      bodyText: m.bodyText,
      snippet: m.snippet ?? snippet(m.bodyText ?? ""),
      inReplyTo: m.inReplyTo,
      references: m.references ?? undefined,
      receivedAt: m.receivedAt,
      sentAt: m.sentAt,
      hasAttachments: m.hasAttachments,
      ticketId,
      contactId,
      organizationId,
    },
  });

  // 6. If linked to a ticket, mirror inbound client emails into the conversation.
  if (ticketId) {
    if (thread.ticketId !== ticketId) {
      await prisma.emailThread.update({
        where: { id: thread.id },
        data: { ticketId },
      });
    }
    if (m.direction === "INBOUND") {
      await prisma.$transaction([
        prisma.ticketMessage.create({
          data: {
            ticketId,
            authorContactId: contactId,
            authorType: "CLIENT",
            messageType: "PUBLIC_REPLY",
            body: bodyHtml || `<p>${snippet(m.bodyText ?? "")}</p>`,
            emailMessageId: stored.id,
          },
        }),
        prisma.ticketActivity.create({
          data: { ticketId, type: "EMAIL_LINKED", toValue: stored.id },
        }),
      ]);
    }
    await recordAudit({
      action: "EMAIL_RECEIVED",
      entityType: "emailMessage",
      entityId: stored.id,
      metadata: { ticketId, account: account.address },
    });
  } else {
    logger.info("email.ingested_unlinked", {
      account: account.address,
      from: m.from.address,
    });
  }

  return { created: true, emailMessageId: stored.id };
}

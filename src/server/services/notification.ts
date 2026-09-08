import "server-only";
import type { NotificationType } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { logger } from "@/lib/logger";
import { sendTransactionalEmail } from "@/server/mailer";
import {
  appUrl,
  ticketAssignedEmail,
  ticketCreatedEmail,
  ticketReplyEmail,
  ticketResolvedEmail,
} from "@/server/email-templates";
import { snippet } from "@/lib/sanitize";

/**
 * Reusable notification service. Fans a domain event out to channels
 * (in-app + email today; SMS / push are future channels that plug in here
 * without touching callers).
 */

type Channel = "IN_APP" | "EMAIL";

interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  linkUrl?: string;
  channels?: Channel[];
  email?: { subject: string; html: string; text: string };
}

async function deliver(input: NotifyInput) {
  const channels = input.channels ?? ["IN_APP"];
  try {
    if (channels.includes("IN_APP")) {
      await prisma.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body,
          entityType: input.entityType,
          entityId: input.entityId,
          linkUrl: input.linkUrl,
          channels,
        },
      });
    }
    if (channels.includes("EMAIL") && input.email) {
      const user = await prisma.user.findUnique({
        where: { id: input.userId },
        select: { email: true, status: true },
      });
      if (user && user.status !== "DISABLED") {
        await sendTransactionalEmail({
          to: user.email,
          subject: input.email.subject,
          html: input.email.html,
          text: input.email.text,
        });
      }
    }
  } catch (e) {
    logger.error("notification.deliver_failed", { type: input.type, error: e });
  }
}

interface TicketRef {
  id: string;
  ticketNumber: string;
  subject: string;
}

function adminTicketUrl(id: string) {
  return `${appUrl()}/admin/tickets/${id}`;
}
function portalTicketUrl(id: string) {
  return `${appUrl()}/portal/tickets/${id}`;
}

export const notificationService = {
  async notifyTicketCreated(opts: {
    ticket: TicketRef;
    recipientUserIds: string[];
    requesterName: string;
  }) {
    await Promise.all(
      opts.recipientUserIds.map(async (userId) => {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true },
        });
        const tpl = ticketCreatedEmail({
          recipientName: user?.name ?? "there",
          ticketNumber: opts.ticket.ticketNumber,
          subject: opts.ticket.subject,
          url: adminTicketUrl(opts.ticket.id),
          forClient: false,
        });
        return deliver({
          userId,
          type: "TICKET_CREATED",
          title: `New ticket ${opts.ticket.ticketNumber}`,
          body: `${opts.requesterName}: ${opts.ticket.subject}`,
          entityType: "ticket",
          entityId: opts.ticket.id,
          linkUrl: `/admin/tickets/${opts.ticket.id}`,
          channels: ["IN_APP", "EMAIL"],
          email: tpl,
        });
      }),
    );
  },

  async notifyClientTicketCreated(opts: {
    ticket: TicketRef;
    clientUserId: string;
  }) {
    const user = await prisma.user.findUnique({
      where: { id: opts.clientUserId },
      select: { name: true },
    });
    const tpl = ticketCreatedEmail({
      recipientName: user?.name ?? "there",
      ticketNumber: opts.ticket.ticketNumber,
      subject: opts.ticket.subject,
      url: portalTicketUrl(opts.ticket.id),
      forClient: true,
    });
    await deliver({
      userId: opts.clientUserId,
      type: "TICKET_CREATED",
      title: `Ticket ${opts.ticket.ticketNumber} created`,
      body: opts.ticket.subject,
      entityType: "ticket",
      entityId: opts.ticket.id,
      linkUrl: `/portal/tickets/${opts.ticket.id}`,
      channels: ["IN_APP", "EMAIL"],
      email: tpl,
    });
  },

  async notifyTicketAssigned(opts: { ticket: TicketRef; agentUserId: string }) {
    const user = await prisma.user.findUnique({
      where: { id: opts.agentUserId },
      select: { name: true },
    });
    const tpl = ticketAssignedEmail({
      agentName: user?.name ?? "there",
      ticketNumber: opts.ticket.ticketNumber,
      subject: opts.ticket.subject,
      url: adminTicketUrl(opts.ticket.id),
    });
    await deliver({
      userId: opts.agentUserId,
      type: "TICKET_ASSIGNED",
      title: `Assigned: ${opts.ticket.ticketNumber}`,
      body: opts.ticket.subject,
      entityType: "ticket",
      entityId: opts.ticket.id,
      linkUrl: `/admin/tickets/${opts.ticket.id}`,
      channels: ["IN_APP", "EMAIL"],
      email: tpl,
    });
  },

  async notifyReply(opts: {
    ticket: TicketRef;
    recipientUserIds: string[];
    authorName: string;
    bodyHtml: string;
    audience: "CLIENT" | "AGENT";
  }) {
    const preview = snippet(opts.bodyHtml.replace(/<[^>]+>/g, " "), 240);
    await Promise.all(
      opts.recipientUserIds.map(async (userId) => {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true },
        });
        const isClient = opts.audience === "CLIENT";
        const tpl = ticketReplyEmail({
          recipientName: user?.name ?? "there",
          ticketNumber: opts.ticket.ticketNumber,
          subject: opts.ticket.subject,
          authorName: opts.authorName,
          preview,
          url: isClient
            ? portalTicketUrl(opts.ticket.id)
            : adminTicketUrl(opts.ticket.id),
        });
        return deliver({
          userId,
          type: isClient ? "TICKET_REPLY_AGENT" : "TICKET_REPLY_CLIENT",
          title: `Reply on ${opts.ticket.ticketNumber}`,
          body: `${opts.authorName}: ${preview}`,
          entityType: "ticket",
          entityId: opts.ticket.id,
          linkUrl: isClient
            ? `/portal/tickets/${opts.ticket.id}`
            : `/admin/tickets/${opts.ticket.id}`,
          channels: ["IN_APP", "EMAIL"],
          email: tpl,
        });
      }),
    );
  },

  async notifyStatusChanged(opts: {
    ticket: TicketRef;
    recipientUserIds: string[];
    toStatusLabel: string;
    forClient: boolean;
  }) {
    await Promise.all(
      opts.recipientUserIds.map((userId) =>
        deliver({
          userId,
          type: "TICKET_STATUS_CHANGED",
          title: `${opts.ticket.ticketNumber} · ${opts.toStatusLabel}`,
          body: opts.ticket.subject,
          entityType: "ticket",
          entityId: opts.ticket.id,
          linkUrl: opts.forClient
            ? `/portal/tickets/${opts.ticket.id}`
            : `/admin/tickets/${opts.ticket.id}`,
          channels: ["IN_APP"],
        }),
      ),
    );
  },

  async notifyResolved(opts: { ticket: TicketRef; clientUserId: string | null }) {
    if (!opts.clientUserId) return;
    const user = await prisma.user.findUnique({
      where: { id: opts.clientUserId },
      select: { name: true },
    });
    const tpl = ticketResolvedEmail({
      recipientName: user?.name ?? "there",
      ticketNumber: opts.ticket.ticketNumber,
      subject: opts.ticket.subject,
      url: portalTicketUrl(opts.ticket.id),
    });
    await deliver({
      userId: opts.clientUserId,
      type: "TICKET_RESOLVED",
      title: `Resolved: ${opts.ticket.ticketNumber}`,
      body: opts.ticket.subject,
      entityType: "ticket",
      entityId: opts.ticket.id,
      linkUrl: `/portal/tickets/${opts.ticket.id}`,
      channels: ["IN_APP", "EMAIL"],
      email: tpl,
    });
  },

  async notifySlaBreached(opts: {
    ticket: TicketRef;
    recipientUserIds: string[];
    kind: "response" | "resolution";
  }) {
    await Promise.all(
      opts.recipientUserIds.map((userId) =>
        deliver({
          userId,
          type: "TICKET_SLA_BREACHED",
          title: `SLA ${opts.kind} breached · ${opts.ticket.ticketNumber}`,
          body: opts.ticket.subject,
          entityType: "ticket",
          entityId: opts.ticket.id,
          linkUrl: `/admin/tickets/${opts.ticket.id}`,
          channels: ["IN_APP"],
        }),
      ),
    );
  },
};

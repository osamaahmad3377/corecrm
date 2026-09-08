import "server-only";
import { prisma } from "@/server/db/client";
import { AuthContext } from "@/server/auth/rbac";

/**
 * Decide whether `ctx` may download `fileId`. Files are reachable only through
 * an entity the user can already see:
 *  - internal users: any file
 *  - client users: files attached to their own organization's tickets, but only
 *    via a PUBLIC_REPLY message (or the ticket body) — never internal notes.
 */
export async function canAccessFile(
  ctx: AuthContext,
  fileId: string,
): Promise<boolean> {
  if (ctx.isInternal) {
    const exists = await prisma.file.count({ where: { id: fileId } });
    return exists > 0;
  }
  if (!ctx.organization) return false;
  const orgId = ctx.organization.id;

  const ticketAtt = await prisma.ticketAttachment.findFirst({
    where: {
      fileId,
      ticket: { organizationId: orgId },
      OR: [
        { ticketMessageId: null }, // ticket-body attachment
        { ticketMessage: { messageType: "PUBLIC_REPLY" } },
      ],
    },
    select: { id: true },
  });
  if (ticketAtt) return true;

  const emailAtt = await prisma.emailAttachment.findFirst({
    where: {
      fileId,
      emailMessage: {
        organizationId: orgId,
        ticket: { organizationId: orgId },
        direction: "OUTBOUND",
      },
    },
    select: { id: true },
  });
  return Boolean(emailAtt);
}

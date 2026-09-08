import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/server/db/client";
import { sweepSlaBreaches } from "@/server/services/sla";
import { notificationService } from "@/server/services/notification";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const header = req.headers.get("authorization");
  return (
    header === `Bearer ${env.CRON_SECRET}` ||
    req.nextUrl.searchParams.get("secret") === env.CRON_SECRET
  );
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });

  const { responseBreaches, resolutionBreaches } = await sweepSlaBreaches();

  const managers = await prisma.user.findMany({
    where: {
      isInternal: true,
      status: "ACTIVE",
      internalRole: { in: ["ADMIN", "SUPPORT_MANAGER", "SUPER_ADMIN"] },
    },
    select: { id: true },
  });
  const managerIds = managers.map((m) => m.id);

  for (const t of responseBreaches) {
    const recipients = new Set<string>(managerIds);
    if (t.assignedAgentId) recipients.add(t.assignedAgentId);
    t.assignedTeam?.members.forEach((m) => recipients.add(m.userId));
    await notificationService.notifySlaBreached({
      ticket: { id: t.id, ticketNumber: t.ticketNumber, subject: t.subject },
      recipientUserIds: [...recipients],
      kind: "response",
    });
    await prisma.ticketActivity.create({
      data: { ticketId: t.id, type: "SLA_RESPONSE_BREACHED" },
    });
  }
  for (const t of resolutionBreaches) {
    const recipients = new Set<string>(managerIds);
    if (t.assignedAgentId) recipients.add(t.assignedAgentId);
    t.assignedTeam?.members.forEach((m) => recipients.add(m.userId));
    await notificationService.notifySlaBreached({
      ticket: { id: t.id, ticketNumber: t.ticketNumber, subject: t.subject },
      recipientUserIds: [...recipients],
      kind: "resolution",
    });
    await prisma.ticketActivity.create({
      data: { ticketId: t.id, type: "SLA_RESOLUTION_BREACHED" },
    });
  }

  logger.info("cron.sla_check", {
    response: responseBreaches.length,
    resolution: resolutionBreaches.length,
  });
  return Response.json({
    ok: true,
    responseBreaches: responseBreaches.length,
    resolutionBreaches: resolutionBreaches.length,
  });
}

export const POST = GET;

import "server-only";
import { prisma } from "@/server/db/client";
import { OPEN_STATUS_KEYS } from "@/lib/constants";

/**
 * Platform-wide analytics for the internal dashboard / reports:
 * clients, employees, groups, active vs closed tickets, and the request
 * breakdown (portal-created tickets vs email-originated tickets vs emails that
 * were triaged as "just info").
 */
export async function platformStats() {
  const [
    clients,
    activeClients,
    employees,
    activeEmployees,
    groups,
    activeGroups,
    activeTickets,
    closedTickets,
    resolvedTickets,
    contacts,
  ] = await Promise.all([
    prisma.organization.count(),
    prisma.organization.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { isInternal: true } }),
    prisma.user.count({ where: { isInternal: true, status: "ACTIVE" } }),
    prisma.team.count(),
    prisma.team.count({ where: { status: "ACTIVE" } }),
    prisma.ticket.count({ where: { status: { key: { in: OPEN_STATUS_KEYS } } } }),
    prisma.ticket.count({ where: { status: { key: "CLOSED" } } }),
    prisma.ticket.count({ where: { status: { key: "RESOLVED" } } }),
    prisma.contact.count(),
  ]);

  // Request-channel breakdown.
  const [portalTickets, emailTickets, internalTickets, emailInfo, emailIgnored, emailUnhandled] =
    await Promise.all([
      prisma.ticket.count({ where: { source: "PORTAL" } }),
      prisma.ticket.count({ where: { source: "EMAIL" } }),
      prisma.ticket.count({ where: { source: "INTERNAL" } }),
      prisma.emailMessage.count({
        where: { direction: "INBOUND", handledStatus: "INFO" },
      }),
      prisma.emailMessage.count({
        where: { direction: "INBOUND", handledStatus: "IGNORED" },
      }),
      prisma.emailMessage.count({
        where: { direction: "INBOUND", ticketId: null, handledStatus: null },
      }),
    ]);

  return {
    clients,
    activeClients,
    employees,
    activeEmployees,
    groups,
    activeGroups,
    activeTickets,
    closedTickets,
    resolvedTickets,
    contacts,
    channelBreakdown: {
      portalTickets,
      emailTickets,
      internalTickets,
      emailInfo,
      emailIgnored,
      emailUnhandled,
    },
  };
}

/** Per-client KPI rows for the "Client KPI segregation" report. */
export async function clientKpiRows() {
  const orgs = await prisma.organization.findMany({
    orderBy: { name: "asc" },
    include: {
      accountManager: { select: { name: true } },
      _count: { select: { userLinks: true } },
      tickets: { select: { id: true, closedAt: true, status: { select: { key: true } } } },
      contacts: {
        where: { isPrimary: true },
        select: { firstName: true, lastName: true },
        take: 1,
      },
    },
  });

  return orgs.map((o) => {
    const total = o.tickets.length;
    const closed = o.tickets.filter(
      (t) => t.status.key === "CLOSED" || t.status.key === "RESOLVED",
    ).length;
    const primary = o.contacts[0];
    return {
      id: o.id,
      clientName: primary
        ? `${primary.firstName} ${primary.lastName}`
        : "—",
      organization: o.name,
      onboardingDate: o.onboardingDate,
      totalTickets: total,
      closedTickets: closed,
      openTickets: total - closed,
      users: o._count.userLinks,
      website: o.website,
      sharepointUrl: o.sharepointUrl,
      accountManager: o.accountManager?.name ?? null,
      status: o.status,
    };
  });
}

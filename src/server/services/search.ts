import "server-only";
import { prisma } from "@/server/db/client";
import { AuthContext } from "@/server/auth/rbac";

export async function globalSearch(ctx: AuthContext, q: string) {
  const query = q.trim();
  if (query.length < 2) {
    return { tickets: [], organizations: [], contacts: [], assets: [] };
  }
  const like = { contains: query, mode: "insensitive" as const };

  if (!ctx.isInternal) {
    if (!ctx.organization) {
      return { tickets: [], organizations: [], contacts: [], assets: [] };
    }
    const tickets = await prisma.ticket.findMany({
      where: {
        organizationId: ctx.organization.id,
        OR: [{ ticketNumber: like }, { subject: like }],
      },
      select: { id: true, ticketNumber: true, subject: true },
      take: 8,
      orderBy: { createdAt: "desc" },
    });
    return { tickets, organizations: [], contacts: [], assets: [] };
  }

  const [tickets, organizations, contacts, assets] = await Promise.all([
    prisma.ticket.findMany({
      where: { OR: [{ ticketNumber: like }, { subject: like }] },
      select: { id: true, ticketNumber: true, subject: true },
      take: 8,
      orderBy: { createdAt: "desc" },
    }),
    prisma.organization.findMany({
      where: { OR: [{ name: like }, { legalName: like }] },
      select: { id: true, name: true },
      take: 6,
    }),
    prisma.contact.findMany({
      where: {
        OR: [{ firstName: like }, { lastName: like }, { email: like }],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        organizationId: true,
      },
      take: 6,
    }),
    prisma.asset.findMany({
      where: { OR: [{ name: like }, { hostname: like }, { serialNumber: like }] },
      select: { id: true, name: true, organizationId: true },
      take: 6,
    }),
  ]);

  return {
    tickets,
    organizations,
    contacts: contacts.map((c) => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      email: c.email,
      organizationId: c.organizationId,
    })),
    assets,
  };
}

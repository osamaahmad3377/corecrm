import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/context";
import { prisma } from "@/server/db/client";
import { getPriorities } from "@/server/services/lookups";
import { assignableAgents } from "@/server/services/user";
import { PageHeader } from "@/components/page-header";
import { NewTicketForm } from "@/components/tickets/new-ticket-form";

export const metadata: Metadata = { title: "New ticket" };

export default async function AdminNewTicketPage() {
  await requirePermission("ticket.create");

  const [organizations, categories, priorities, agents, contacts] =
    await Promise.all([
      prisma.organization.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.ticketCategory.findMany({
        where: { isActive: true },
        orderBy: { order: "asc" },
        select: { id: true, name: true, parentId: true },
      }),
      getPriorities(),
      assignableAgents(),
      prisma.contact.findMany({
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          organizationId: true,
        },
        orderBy: { lastName: "asc" },
      }),
    ]);

  const contactsByOrg: Record<
    string,
    { id: string; name: string; email: string }[]
  > = {};
  for (const c of contacts) {
    (contactsByOrg[c.organizationId] ??= []).push({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      email: c.email,
    });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Create ticket"
        description="Log a ticket on behalf of a client."
      />
      <NewTicketForm
        mode="internal"
        organizations={organizations}
        categories={categories}
        priorities={priorities.map((p) => ({ key: p.key, label: p.label }))}
        agents={agents.map((a) => ({ id: a.id, name: a.name }))}
        contactsByOrg={contactsByOrg}
        assets={[]}
      />
    </div>
  );
}

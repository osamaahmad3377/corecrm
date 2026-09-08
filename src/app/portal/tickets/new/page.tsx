import type { Metadata } from "next";
import { requirePortalAuth } from "@/server/auth/context";
import { prisma } from "@/server/db/client";
import { getPriorities } from "@/server/services/lookups";
import { organizationAssets } from "@/server/services/asset";
import { PageHeader } from "@/components/page-header";
import { NewTicketForm } from "@/components/tickets/new-ticket-form";

export const metadata: Metadata = { title: "Create ticket" };

export default async function NewPortalTicketPage() {
  const ctx = await requirePortalAuth();
  const orgId = ctx.organization!.id;

  const [categories, priorities, assets] = await Promise.all([
    prisma.ticketCategory.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
      select: { id: true, name: true, parentId: true },
    }),
    getPriorities(),
    organizationAssets(orgId),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Create a support ticket"
        description="Tell us what's happening and we'll get on it."
      />
      <NewTicketForm
        mode="portal"
        categories={categories}
        priorities={priorities.map((p) => ({ key: p.key, label: p.label }))}
        assets={assets}
      />
    </div>
  );
}

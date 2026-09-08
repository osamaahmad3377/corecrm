import type { Metadata } from "next";
import Link from "next/link";
import { requireInternal } from "@/server/auth/context";
import { listTickets } from "@/server/services/ticket";
import { getStatuses, getPriorities } from "@/server/services/lookups";
import { prisma } from "@/server/db/client";
import { ticketListFilterSchema } from "@/validators/ticket";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { TicketTable } from "@/components/tickets/ticket-table";
import { TicketFilters } from "@/components/tickets/ticket-filters";
import { DataPagination } from "@/components/data-pagination";
import { Plus } from "lucide-react";

export const metadata: Metadata = { title: "Tickets" };

const VIEW_TITLES: Record<string, string> = {
  my: "My tickets",
  unassigned: "Unassigned tickets",
  critical: "Critical tickets",
  "sla-breached": "SLA breached",
};

export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireInternal();
  const sp = await searchParams;
  const filter = ticketListFilterSchema.parse(sp);

  const [result, statuses, priorities, organizations] = await Promise.all([
    listTickets(ctx, filter),
    getStatuses(),
    getPriorities(),
    prisma.organization.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <>
      <PageHeader
        title={filter.view ? VIEW_TITLES[filter.view] ?? "Tickets" : "Tickets"}
        description={`${result.total} ticket${result.total === 1 ? "" : "s"}`}
        actions={
          <Button asChild>
            <Link href="/admin/tickets/new">
              <Plus className="size-4" /> New ticket
            </Link>
          </Button>
        }
      />

      <TicketFilters
        statuses={statuses.map((s) => ({ key: s.key, label: s.label }))}
        priorities={priorities.map((p) => ({ key: p.key, label: p.label }))}
        organizations={organizations}
        showOrg
      />

      <TicketTable rows={result.items} basePath="/admin/tickets" showOrg />

      <DataPagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        totalPages={result.totalPages}
      />
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { requireAuth } from "@/server/auth/context";
import { listTickets } from "@/server/services/ticket";
import { getStatuses, getPriorities } from "@/server/services/lookups";
import { ticketListFilterSchema } from "@/validators/ticket";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { TicketTable } from "@/components/tickets/ticket-table";
import { TicketFilters } from "@/components/tickets/ticket-filters";
import { DataPagination } from "@/components/data-pagination";
import { Plus } from "lucide-react";

export const metadata: Metadata = { title: "My tickets" };

export default async function PortalTicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireAuth();
  const sp = await searchParams;
  const filter = ticketListFilterSchema.parse(sp);

  const [result, statuses, priorities] = await Promise.all([
    listTickets(ctx, filter),
    getStatuses(),
    getPriorities(),
  ]);

  return (
    <>
      <PageHeader
        title="My tickets"
        description={`${result.total} ticket${result.total === 1 ? "" : "s"}`}
        actions={
          <Button asChild>
            <Link href="/portal/tickets/new">
              <Plus className="size-4" /> Create ticket
            </Link>
          </Button>
        }
      />

      <TicketFilters
        statuses={statuses.map((s) => ({ key: s.key, label: s.label }))}
        priorities={priorities.map((p) => ({ key: p.key, label: p.label }))}
      />

      <TicketTable rows={result.items} basePath="/portal/tickets" showOrg={false} />

      <DataPagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        totalPages={result.totalPages}
      />
    </>
  );
}

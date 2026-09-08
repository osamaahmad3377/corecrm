import type { Metadata } from "next";
import { requireInternal } from "@/server/auth/context";
import { listMyTasks } from "@/server/services/ticket";
import { getStatuses, getPriorities } from "@/server/services/lookups";
import { ticketListFilterSchema } from "@/validators/ticket";
import { PageHeader } from "@/components/page-header";
import { TicketTable } from "@/components/tickets/ticket-table";
import { TicketFilters } from "@/components/tickets/ticket-filters";
import { DataPagination } from "@/components/data-pagination";

export const metadata: Metadata = { title: "My tasks" };

export default async function EmployeeTasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireInternal();
  const sp = await searchParams;
  const filter = ticketListFilterSchema.parse(sp);

  const [result, statuses, priorities] = await Promise.all([
    listMyTasks(ctx, filter),
    getStatuses(),
    getPriorities(),
  ]);

  return (
    <>
      <PageHeader
        title="My tasks"
        description={`${result.total} ticket${result.total === 1 ? "" : "s"} assigned to you or your team`}
      />
      <TicketFilters
        statuses={statuses.map((s) => ({ key: s.key, label: s.label }))}
        priorities={priorities.map((p) => ({ key: p.key, label: p.label }))}
      />
      <TicketTable rows={result.items} basePath="/employee/tasks" showOrg />
      <DataPagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        totalPages={result.totalPages}
      />
    </>
  );
}

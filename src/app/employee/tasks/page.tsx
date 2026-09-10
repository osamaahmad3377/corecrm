import type { Metadata } from "next";
import Link from "next/link";
import { requireInternal } from "@/server/auth/context";
import { listMyTasks, myTeamIds } from "@/server/services/ticket";
import { getStatuses, getPriorities } from "@/server/services/lookups";
import { ticketListFilterSchema } from "@/validators/ticket";
import { PageHeader } from "@/components/page-header";
import { TicketTable } from "@/components/tickets/ticket-table";
import { TicketFilters } from "@/components/tickets/ticket-filters";
import { DataPagination } from "@/components/data-pagination";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My tasks" };

export default async function EmployeeTasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireInternal();
  const sp = await searchParams;
  const filter = ticketListFilterSchema.parse(sp);

  const [result, statuses, priorities, teamIds] = await Promise.all([
    listMyTasks(ctx, filter),
    getStatuses(),
    getPriorities(),
    myTeamIds(ctx),
  ]);

  const scope = sp.assignedAgentId ?? "all";
  const tabs: { key: string; label: string; param?: string }[] = [
    { key: "all", label: "All my tickets" },
    { key: "me", label: "Assigned to me", param: "me" },
  ];
  if (teamIds.length) {
    tabs.push({ key: "unassigned", label: "Team queue", param: "unassigned" });
  }

  return (
    <>
      <PageHeader
        title="My tasks"
        description={`${result.total} ticket${result.total === 1 ? "" : "s"}${
          teamIds.length ? " assigned to you or your team" : " assigned to you"
        }`}
      />

      <div className="mb-3 flex flex-wrap gap-1">
        {tabs.map((t) => {
          const params = new URLSearchParams();
          if (sp.q) params.set("q", sp.q);
          if (t.param) params.set("assignedAgentId", t.param);
          return (
            <Link
              key={t.key}
              href={`/employee/tasks${params.toString() ? `?${params}` : ""}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                scope === t.key
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

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

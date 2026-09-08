import type { Metadata } from "next";
import Link from "next/link";
import { requireInternal } from "@/server/auth/context";
import { employeeDashboardStats, listMyTasks } from "@/server/services/ticket";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, PriorityBadge } from "@/components/badges";
import { EmptyState } from "@/components/states";
import { formatRelative } from "@/lib/format";
import { Inbox, Clock, AlertTriangle, CalendarClock, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = { title: "My work" };

export default async function EmployeeDashboard() {
  const ctx = await requireInternal();
  const [stats, recent] = await Promise.all([
    employeeDashboardStats(ctx),
    listMyTasks(ctx, { page: 1, pageSize: 25, sort: "updated" } as never),
  ]);

  return (
    <>
      <PageHeader
        title={`Hi ${ctx.name.split(" ")[0]}`}
        description="Your assigned tickets and team queue."
        actions={
          <Button asChild>
            <Link href="/employee/tasks">Open my tasks</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Open tasks" value={stats.openCount} icon={Inbox} href="/employee/tasks" />
        <StatCard
          label="Awaiting my reply"
          value={stats.awaitingResponse}
          tone={stats.awaitingResponse ? "warning" : "default"}
          icon={Clock}
        />
        <StatCard
          label="Overdue"
          value={stats.overdue}
          tone={stats.overdue ? "destructive" : "default"}
          icon={AlertTriangle}
          href="/employee/tasks?view=sla-breached"
        />
        <StatCard
          label="Due today"
          value={stats.dueToday}
          tone={stats.dueToday ? "warning" : "default"}
          icon={CalendarClock}
        />
        <StatCard label="Resolved today" value={stats.resolvedToday} tone="success" icon={CheckCircle2} />
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-sm">Recently updated</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/employee/tasks">View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recent.items.length === 0 ? (
            <EmptyState title="Nothing assigned to you yet" />
          ) : (
            <ul className="divide-y">
              {recent.items.slice(0, 10).map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/employee/tasks/${t.id}`}
                    className="flex items-center gap-3 py-2.5 hover:bg-accent/40"
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {t.ticketNumber}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {t.subject}
                    </span>
                    <span className="hidden text-xs text-muted-foreground sm:block">
                      {t.organization?.name}
                    </span>
                    <PriorityBadge priorityKey={t.priority.key} label={t.priority.label} />
                    <StatusBadge statusKey={t.status.key} label={t.status.label} />
                    <span className="hidden w-20 shrink-0 text-right text-xs text-muted-foreground md:block">
                      {formatRelative(t.updatedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

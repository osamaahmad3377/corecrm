import type { Metadata } from "next";
import Link from "next/link";
import { requireInternal } from "@/server/auth/context";
import {
  internalDashboardStats,
  ticketChartData,
  listTickets,
} from "@/server/services/ticket";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DonutChart, CategoryBarChart, TrendChart } from "@/components/charts";
import { StatusBadge, PriorityBadge } from "@/components/badges";
import { EmptyState } from "@/components/states";
import { formatRelative } from "@/lib/format";
import {
  AlertTriangle,
  Clock,
  Inbox,
  UserCheck,
  CheckCircle2,
  Plus,
} from "lucide-react";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  const ctx = await requireInternal();
  const [stats, charts, recent] = await Promise.all([
    internalDashboardStats(ctx),
    ticketChartData(),
    listTickets(ctx, {
      view: "all",
      page: 1,
      pageSize: 25,
      sort: "newest",
    } as never),
  ]);

  const recentTickets = recent.items.slice(0, 8);

  return (
    <>
      <PageHeader
        title={`Welcome back, ${ctx.name.split(" ")[0]}`}
        description="Here's what's happening across support right now."
        actions={
          <Button asChild>
            <Link href="/admin/tickets/new">
              <Plus className="size-4" /> New ticket
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Open tickets"
          value={stats.openCount}
          icon={Inbox}
          href="/admin/tickets?status=OPEN_ALL"
        />
        <StatCard
          label="Critical open"
          value={stats.criticalOpen}
          tone={stats.criticalOpen > 0 ? "destructive" : "default"}
          icon={AlertTriangle}
          href="/admin/tickets?view=critical"
        />
        <StatCard
          label="Awaiting response"
          value={stats.awaitingResponse}
          tone={stats.awaitingResponse > 0 ? "warning" : "default"}
          icon={Clock}
        />
        <StatCard
          label="Overdue (SLA)"
          value={stats.overdue}
          tone={stats.overdue > 0 ? "destructive" : "default"}
          icon={AlertTriangle}
          href="/admin/tickets?view=sla-breached"
        />
        <StatCard
          label="Assigned to me"
          value={stats.assignedToMe}
          icon={UserCheck}
          href="/admin/tickets?view=my"
        />
        <StatCard label="Created today" value={stats.createdToday} icon={Plus} />
        <StatCard
          label="Resolved today"
          value={stats.resolvedToday}
          tone="success"
          icon={CheckCircle2}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tickets by status</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart data={charts.byStatus} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tickets by priority</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart data={charts.byPriority} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Top organizations</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryBarChart data={charts.byOrg} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-sm">Recent tickets</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/tickets">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentTickets.length === 0 ? (
              <EmptyState title="No tickets yet" />
            ) : (
              <ul className="divide-y">
                {recentTickets.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/admin/tickets/${t.id}`}
                      className="flex items-center gap-3 py-2.5 hover:bg-accent/40"
                    >
                      <span className="font-mono text-xs text-muted-foreground">
                        {t.ticketNumber}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {t.subject}
                      </span>
                      <span className="hidden sm:block">
                        <PriorityBadge
                          priorityKey={t.priority.key}
                          label={t.priority.label}
                        />
                      </span>
                      <StatusBadge
                        statusKey={t.status.key}
                        label={t.status.label}
                      />
                      <span className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground md:block">
                        {formatRelative(t.createdAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tickets over time (14d)</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart data={charts.overTime} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

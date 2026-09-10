import type { Metadata } from "next";
import Link from "next/link";
import { requireInternal } from "@/server/auth/context";
import {
  deadlineAlerts,
  employeeChartData,
  employeeDashboardStats,
  listMyTasks,
  myTeamIds,
} from "@/server/services/ticket";
import { prisma } from "@/server/db/client";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, PriorityBadge, OrganizationBadge } from "@/components/badges";
import { EmptyState } from "@/components/states";
import { DonutChart, DualTrendChart } from "@/components/charts";
import { DeadlineAlerts } from "@/components/tickets/deadline-alerts";
import { DeadlineBadge } from "@/components/tickets/deadline-badge";
import { formatRelative, formatDateTime } from "@/lib/format";
import {
  Inbox,
  UserCheck,
  Users,
  Clock,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Archive,
} from "lucide-react";

export const metadata: Metadata = { title: "My work" };

export default async function EmployeeDashboard() {
  const ctx = await requireInternal();
  const teamIds = await myTeamIds(ctx);

  const [stats, charts, recent, teamQueue, teams, deadlines] = await Promise.all([
    employeeDashboardStats(ctx),
    employeeChartData(ctx),
    listMyTasks(ctx, { page: 1, pageSize: 25, sort: "updated" } as never),
    teamIds.length
      ? prisma.ticket.findMany({
          where: {
            assignedTeamId: { in: teamIds },
            assignedAgentId: null,
            status: { key: { in: ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_INTERNAL", "WAITING_FOR_CLIENT"] } },
          },
          orderBy: { createdAt: "desc" },
          take: 6,
          include: {
            organization: { select: { name: true } },
            status: true,
            priority: true,
            assignedTeam: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    teamIds.length
      ? prisma.team.findMany({
          where: { id: { in: teamIds } },
          select: { name: true },
        })
      : Promise.resolve([]),
    deadlineAlerts(ctx, { warnHours: 24 }),
  ]);

  const recentTickets = recent.items.slice(0, 10);

  return (
    <>
      <PageHeader
        title={`Hi ${ctx.name.split(" ")[0]}`}
        description={
          teams.length
            ? `Your tickets and the ${teams.map((t) => t.name).join(", ")} queue.`
            : "Your assigned tickets."
        }
        actions={
          <Button asChild>
            <Link href="/employee/tasks">View all tasks</Link>
          </Button>
        }
      />

      {/* 0 — Deadline alerts (overdue / approaching) */}
      <DeadlineAlerts
        overdue={deadlines.overdue}
        dueSoon={deadlines.dueSoon}
        basePath="/employee/tasks"
        timezone={ctx.timezone}
      />

      {/* 1 — Recent tickets, front and centre */}
      <Card className="mb-6">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-sm">Recent tickets</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/employee/tasks">Open my tasks</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentTickets.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Nothing assigned to you yet"
              description="Tickets assigned to you or your team will show up here."
            />
          ) : (
            <ul className="divide-y">
              {recentTickets.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/employee/tasks/${t.id}`}
                    className="flex items-center gap-3 py-2.5 hover:bg-accent/40"
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {t.ticketNumber}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {t.subject}
                    </span>
                    <span className="hidden md:block">
                      <OrganizationBadge name={t.organization?.name ?? "—"} />
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
                    <span className="hidden shrink-0 text-right text-xs text-muted-foreground lg:block">
                      {t.dueAt ? (
                        <DeadlineBadge
                          dueAt={t.dueAt}
                          terminal={t.status.isTerminal}
                          timezone={ctx.timezone}
                        />
                      ) : (
                        formatRelative(t.updatedAt)
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 2 — Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <StatCard
          label="My open tickets"
          value={stats.assignedToMe}
          icon={UserCheck}
          href="/employee/tasks?assignedAgentId=me"
        />
        <StatCard
          label="Team queue"
          value={stats.teamQueue}
          tone={stats.teamQueue > 0 ? "warning" : "default"}
          icon={Users}
        />
        <StatCard
          label="Awaiting my reply"
          value={stats.awaitingResponse}
          tone={stats.awaitingResponse > 0 ? "warning" : "default"}
          icon={Clock}
        />
        <StatCard
          label="Overdue"
          value={stats.overdue}
          tone={stats.overdue > 0 ? "destructive" : "default"}
          icon={AlertTriangle}
          href="/employee/tasks?view=sla-breached"
        />
        <StatCard
          label="Due today"
          value={stats.dueToday}
          tone={stats.dueToday > 0 ? "warning" : "default"}
          icon={CalendarClock}
        />
        <StatCard
          label="Resolved today"
          value={stats.resolvedToday}
          tone="success"
          icon={CheckCircle2}
        />
        <StatCard
          label="Closed & resolved"
          value={stats.closedTotal}
          icon={Archive}
          href="/employee/tasks?view=closed"
        />
      </div>

      {/* 3 — Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">My tickets by status</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart data={charts.byStatus} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Open by priority</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart data={charts.byPriority} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Assigned vs resolved (14 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DualTrendChart data={charts.trend} />
          </CardContent>
        </Card>
      </div>

      {/* 4 — Team queue (unassigned) */}
      {teamIds.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-sm">
              Team queue — unassigned ({stats.teamQueue})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {teamQueue.length === 0 ? (
              <EmptyState title="Team queue is clear" />
            ) : (
              <ul className="divide-y">
                {teamQueue.map((t) => (
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
                      <PriorityBadge
                        priorityKey={t.priority.key}
                        label={t.priority.label}
                      />
                      <StatusBadge
                        statusKey={t.status.key}
                        label={t.status.label}
                      />
                      <span className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground sm:block">
                        {formatDateTime(t.createdAt, ctx.timezone)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}

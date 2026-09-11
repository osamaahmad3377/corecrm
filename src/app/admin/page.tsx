import type { Metadata } from "next";
import Link from "next/link";
import { requireInternal } from "@/server/auth/context";
import {
  deadlineAlerts,
  internalDashboardStats,
  ticketChartData,
  listTickets,
} from "@/server/services/ticket";
import { platformStats } from "@/server/services/analytics";
import { DeadlineAlerts } from "@/components/tickets/deadline-alerts";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
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
  Building2,
  Users,
  Mail,
  MonitorSmartphone,
} from "lucide-react";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  const ctx = await requireInternal();
  const [stats, charts, recent, platform, deadlines] = await Promise.all([
    internalDashboardStats(ctx),
    ticketChartData(),
    listTickets(ctx, {
      view: "all",
      page: 1,
      pageSize: 25,
      sort: "newest",
    } as never),
    platformStats(),
    deadlineAlerts(ctx, { orgWide: true, warnHours: 24 }),
  ]);
  const cb = platform.channelBreakdown;

  const recentTickets = recent.items.slice(0, 8);
  const hasDeadlines =
    deadlines.overdue.length > 0 || deadlines.dueSoon.length > 0;

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

      {/* The numbers that decide whether today needs intervention. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
          label="Overdue (SLA)"
          value={stats.overdue}
          tone={stats.overdue > 0 ? "destructive" : "default"}
          icon={AlertTriangle}
          href="/admin/tickets?view=sla-breached"
        />
        <StatCard
          label="Awaiting response"
          value={stats.awaitingResponse}
          tone={stats.awaitingResponse > 0 ? "warning" : "default"}
          icon={Clock}
        />
        <StatCard
          label="Assigned to me"
          value={stats.assignedToMe}
          icon={UserCheck}
          href="/admin/tickets?view=my"
        />
      </div>

      {/* Deadlines beside the recent queue. With nothing to flag, the deadline
          card renders nothing, so recent tickets takes the full width. */}
      <Section
        title="Active work"
        description="What is in flight and what is running out of time."
      >
        <div className={`grid gap-4 ${hasDeadlines ? "lg:grid-cols-2" : ""}`}>
          <DeadlineAlerts
            overdue={deadlines.overdue}
            dueSoon={deadlines.dueSoon}
            basePath="/admin/tickets"
            timezone={ctx.timezone}
            className=""
          />
          <Card>
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
                        <span className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground xl:block">
                          {formatRelative(t.createdAt)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section
        title="Trends"
        description="How the queue is distributed and where it is heading."
      >
        <div className="grid gap-4 lg:grid-cols-3">
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

        {/* Today's counts read as the latest point on this chart, so they
            belong in its header rather than as cards of their own. */}
        <Card className="mt-4">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm">Tickets over time (14d)</CardTitle>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="font-medium">Today</span>
              <span className="flex items-center gap-1">
                <Plus className="size-3.5" />
                <span className="font-semibold tabular-nums text-foreground">
                  {stats.createdToday}
                </span>
                created
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="size-3.5" />
                <span className="font-semibold tabular-nums text-success">
                  {stats.resolvedToday}
                </span>
                resolved
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <TrendChart data={charts.overTime} />
          </CardContent>
        </Card>
      </Section>

      <Section
        title="How requests reached us"
        description="Emails that aren't a support request are marked info or ignored in the inbox and don't create tickets."
      >
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Breakdown
            icon={MonitorSmartphone}
            label="Portal tickets"
            value={cb.portalTickets}
          />
          <Breakdown
            icon={Mail}
            label="Email → ticket"
            value={cb.emailTickets}
          />
          <Breakdown
            icon={Plus}
            label="Logged by staff"
            value={cb.internalTickets}
          />
          <Breakdown
            icon={Mail}
            label="Email — info only"
            value={cb.emailInfo}
          />
          <Breakdown
            icon={Mail}
            label="Email — ignored"
            value={cb.emailIgnored}
          />
          <Breakdown
            icon={AlertTriangle}
            label="Email — needs triage"
            value={cb.emailUnhandled}
            tone={cb.emailUnhandled > 0 ? "warning" : undefined}
          />
        </div>
      </Section>

      {/* Account totals — reference figures rather than daily working numbers,
          so they sit below the operational queues. */}
      <Section
        title="Account overview"
        description="Totals across the whole system."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="Clients"
            value={platform.clients}
            hint={`${platform.activeClients} active`}
            icon={Building2}
            href="/admin/organizations"
          />
          <StatCard
            label="Employees"
            value={platform.employees}
            hint={`${platform.activeEmployees} active`}
            icon={Users}
            href="/admin/team"
          />
          <StatCard
            label="Groups"
            value={platform.groups}
            hint={`${platform.activeGroups} active`}
            icon={Users}
            href="/admin/team"
          />
          <StatCard
            label="Active tickets"
            value={platform.activeTickets}
            icon={Inbox}
            href="/admin/tickets?status=OPEN_ALL"
          />
          <StatCard
            label="Closed tickets"
            value={platform.closedTickets}
            icon={CheckCircle2}
            href="/admin/tickets?status=CLOSED"
          />
        </div>
      </Section>
    </>
  );
}

function Breakdown({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone?: "warning";
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p
        className={`mt-1 text-xl font-semibold tabular-nums ${tone === "warning" ? "text-warning-foreground" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

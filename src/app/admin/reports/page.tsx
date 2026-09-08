import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/server/auth/context";
import { ticketChartData, internalDashboardStats } from "@/server/services/ticket";
import { clientKpiRows, platformStats } from "@/server/services/analytics";
import { prisma } from "@/server/db/client";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DonutChart, CategoryBarChart, TrendChart } from "@/components/charts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToneBadge } from "@/components/badges";
import { formatDate, formatDuration } from "@/lib/format";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const ctx = await requirePermission("reports.view");
  const [charts, stats, resolved, platform, kpis] = await Promise.all([
    ticketChartData(),
    internalDashboardStats(ctx),
    prisma.ticket.findMany({
      where: { resolvedAt: { not: null } },
      select: { createdAt: true, resolvedAt: true, firstResponseAt: true },
      take: 500,
      orderBy: { resolvedAt: "desc" },
    }),
    platformStats(),
    clientKpiRows(),
  ]);

  const avg = (nums: number[]) =>
    nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;

  const resolutionMins = resolved
    .map((t) => (t.resolvedAt!.getTime() - t.createdAt.getTime()) / 60000)
    .filter((n) => n > 0);
  const responseMins = resolved
    .filter((t) => t.firstResponseAt)
    .map((t) => (t.firstResponseAt!.getTime() - t.createdAt.getTime()) / 60000)
    .filter((n) => n >= 0);

  const avgResolution = avg(resolutionMins);
  const avgResponse = avg(responseMins);

  return (
    <>
      <PageHeader
        title="Reports"
        description="Support performance across all organizations."
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Clients" value={platform.clients} />
        <StatCard label="Employees" value={platform.employees} />
        <StatCard label="Groups" value={platform.groups} />
        <StatCard label="Active tickets" value={platform.activeTickets} tone="primary" />
        <StatCard label="Closed tickets" value={platform.closedTickets} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Avg first response"
          value={avgResponse ? formatDuration(avgResponse) : "—"}
        />
        <StatCard
          label="Avg resolution"
          value={avgResolution ? formatDuration(avgResolution) : "—"}
        />
        <StatCard label="Resolved (sample)" value={resolved.length} tone="success" />
        <StatCard
          label="SLA breached (open)"
          value={stats.overdue}
          tone={stats.overdue ? "destructive" : "default"}
        />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-sm">Client KPIs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Onboarded</TableHead>
                  <TableHead className="text-right">Raised</TableHead>
                  <TableHead className="text-right">Closed</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                  <TableHead>Links</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kpis.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium">{k.clientName}</TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/organizations/${k.id}`}
                        className="text-primary hover:underline"
                      >
                        {k.organization}
                      </Link>
                      {k.status === "DISABLED" && (
                        <ToneBadge tone="neutral" className="ml-2">
                          Disabled
                        </ToneBadge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(k.onboardingDate, ctx.timezone)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {k.totalTickets}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {k.closedTickets}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {k.openTickets}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {k.users}
                    </TableCell>
                    <TableCell className="space-x-2 text-xs">
                      {k.website && (
                        <a
                          href={k.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          Website
                        </a>
                      )}
                      {k.sharepointUrl && (
                        <a
                          href={k.sharepointUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          SharePoint
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
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
            <CardTitle className="text-sm">Tickets by organization</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryBarChart data={charts.byOrg} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tickets over time (14 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart data={charts.overTime} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

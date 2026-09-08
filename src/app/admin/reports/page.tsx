import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/context";
import { ticketChartData, internalDashboardStats } from "@/server/services/ticket";
import { prisma } from "@/server/db/client";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DonutChart, CategoryBarChart, TrendChart } from "@/components/charts";
import { formatDuration } from "@/lib/format";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const ctx = await requirePermission("reports.view");
  const [charts, stats, resolved] = await Promise.all([
    ticketChartData(),
    internalDashboardStats(ctx),
    prisma.ticket.findMany({
      where: { resolvedAt: { not: null } },
      select: { createdAt: true, resolvedAt: true, firstResponseAt: true },
      take: 500,
      orderBy: { resolvedAt: "desc" },
    }),
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

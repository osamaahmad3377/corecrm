import type { Metadata } from "next";
import Link from "next/link";
import { requirePortalAuth } from "@/server/auth/context";
import { clientDashboardStats, listTickets } from "@/server/services/ticket";
import { prisma } from "@/server/db/client";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, PriorityBadge } from "@/components/badges";
import { EmptyState } from "@/components/states";
import { ActivityTimeline } from "@/components/tickets/activity-timeline";
import { formatRelative } from "@/lib/format";
import { Plus, Inbox, Clock, CheckCircle2, Archive } from "lucide-react";

export const metadata: Metadata = { title: "Dashboard" };

export default async function PortalDashboard() {
  const ctx = await requirePortalAuth();
  const [stats, recent, activity] = await Promise.all([
    clientDashboardStats(ctx),
    listTickets(ctx, { page: 1, pageSize: 25, sort: "newest" } as never),
    prisma.ticketActivity.findMany({
      where: {
        ticket: { organizationId: ctx.organization!.id },
        type: { in: ["CREATED", "PUBLIC_REPLY", "RESOLVED", "CLOSED", "REOPENED", "STATUS_CHANGED"] },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { actor: { select: { id: true, name: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader
        title={`Hi ${ctx.name.split(" ")[0]}`}
        description="Track your support requests and talk to our team."
        actions={
          <Button asChild>
            <Link href="/portal/tickets/new">
              <Plus className="size-4" /> Create ticket
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Open"
          value={stats.open}
          icon={Inbox}
          href="/portal/tickets?status=OPEN_ALL"
        />
        <StatCard label="Pending" value={stats.pending} icon={Clock} tone="warning" />
        <StatCard
          label="Resolved"
          value={stats.resolved}
          icon={CheckCircle2}
          tone="success"
          href="/portal/tickets?status=RESOLVED"
        />
        <StatCard
          label="Closed"
          value={stats.closed}
          icon={Archive}
          href="/portal/tickets?status=CLOSED"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-sm">Recent tickets</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/portal/tickets">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recent.items.length === 0 ? (
              <EmptyState
                title="No tickets yet"
                description="Create your first support ticket and our team will get back to you."
                action={
                  <Button asChild size="sm">
                    <Link href="/portal/tickets/new">Create ticket</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y">
                {recent.items.slice(0, 8).map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/portal/tickets/${t.id}`}
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
                      <span className="hidden w-20 shrink-0 text-right text-xs text-muted-foreground sm:block">
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
            <CardTitle className="text-sm">Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityTimeline activities={activity} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

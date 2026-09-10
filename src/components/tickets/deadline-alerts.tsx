import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PriorityBadge, UserAvatar } from "@/components/badges";
import { DeadlineBadge } from "./deadline-badge";
import { AlarmClock, AlertTriangle } from "lucide-react";

interface Row {
  id: string;
  ticketNumber: string;
  subject: string;
  dueAt: Date | string | null;
  organization?: { id: string; name: string } | null;
  priority: { key: string; label: string };
  assignedAgent?: { id: string; name: string; image: string | null } | null;
}

/**
 * Dashboard alert card for tickets whose deadline is overdue or approaching.
 * Renders nothing when there's nothing to flag.
 */
export function DeadlineAlerts({
  overdue,
  dueSoon,
  basePath,
  timezone = "UTC",
  showOrg = true,
}: {
  overdue: Row[];
  dueSoon: Row[];
  basePath: string;
  timezone?: string;
  showOrg?: boolean;
}) {
  if (overdue.length === 0 && dueSoon.length === 0) return null;

  return (
    <Card
      className={
        overdue.length > 0
          ? "mb-6 border-destructive/40 bg-destructive/5"
          : "mb-6 border-warning/40 bg-warning/5"
      }
    >
      <CardHeader className="flex-row items-center gap-2">
        {overdue.length > 0 ? (
          <AlertTriangle className="size-4 text-destructive" />
        ) : (
          <AlarmClock className="size-4 text-warning-foreground" />
        )}
        <CardTitle className="text-sm">
          Deadlines need attention
          <span className="ml-2 font-normal text-muted-foreground">
            {overdue.length} overdue · {dueSoon.length} due soon
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {[...overdue, ...dueSoon].slice(0, 8).map((t) => (
            <li key={t.id}>
              <Link
                href={`${basePath}/${t.id}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 hover:bg-accent/40"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {t.ticketNumber}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {t.subject}
                </span>
                {showOrg && t.organization && (
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {t.organization.name}
                  </span>
                )}
                <PriorityBadge
                  priorityKey={t.priority.key}
                  label={t.priority.label}
                />
                {t.assignedAgent && (
                  <span className="hidden md:inline">
                    <UserAvatar
                      name={t.assignedAgent.name}
                      image={t.assignedAgent.image}
                      className="size-5"
                    />
                  </span>
                )}
                <DeadlineBadge dueAt={t.dueAt} timezone={timezone} />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

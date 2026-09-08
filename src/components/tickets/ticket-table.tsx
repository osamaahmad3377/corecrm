import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge, PriorityBadge, UserAvatar } from "@/components/badges";
import { EmptyState } from "@/components/states";
import { formatRelative } from "@/lib/format";
import { Ticket } from "lucide-react";

interface Row {
  id: string;
  ticketNumber: string;
  subject: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  status: { key: string; label: string };
  priority: { key: string; label: string };
  organization?: { id: string; name: string } | null;
  requester?: { firstName: string; lastName: string } | null;
  assignedAgent?: { id: string; name: string; image: string | null } | null;
  responseBreached?: boolean;
  resolutionBreached?: boolean;
}

export function TicketTable({
  rows,
  basePath,
  showOrg = true,
}: {
  rows: Row[];
  basePath: string;
  showOrg?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Ticket}
        title="No tickets match"
        description="Try adjusting your filters or search."
      />
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[130px]">Ticket</TableHead>
              <TableHead>Subject</TableHead>
              {showOrg && <TableHead>Organization</TableHead>}
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead className="text-right">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id} className="cursor-pointer">
                <TableCell className="font-mono text-xs">
                  <Link href={`${basePath}/${t.id}`} className="block">
                    {t.ticketNumber}
                  </Link>
                </TableCell>
                <TableCell className="max-w-[320px]">
                  <Link href={`${basePath}/${t.id}`} className="block truncate">
                    {t.subject}
                    {(t.responseBreached || t.resolutionBreached) && (
                      <span className="ml-2 rounded bg-destructive/10 px-1 text-[10px] font-medium text-destructive">
                        SLA
                      </span>
                    )}
                  </Link>
                </TableCell>
                {showOrg && (
                  <TableCell className="text-sm text-muted-foreground">
                    {t.organization?.name ?? "—"}
                  </TableCell>
                )}
                <TableCell>
                  <PriorityBadge
                    priorityKey={t.priority.key}
                    label={t.priority.label}
                  />
                </TableCell>
                <TableCell>
                  <StatusBadge statusKey={t.status.key} label={t.status.label} />
                </TableCell>
                <TableCell>
                  {t.assignedAgent ? (
                    <span className="flex items-center gap-1.5 text-sm">
                      <UserAvatar
                        name={t.assignedAgent.name}
                        image={t.assignedAgent.image}
                        className="size-5"
                      />
                      <span className="hidden lg:inline">
                        {t.assignedAgent.name}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Unassigned
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  {formatRelative(t.updatedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <ul className="space-y-2 md:hidden">
        {rows.map((t) => (
          <li key={t.id}>
            <Link
              href={`${basePath}/${t.id}`}
              className="block rounded-lg border p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {t.ticketNumber}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatRelative(t.updatedAt)}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm font-medium">{t.subject}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <PriorityBadge
                  priorityKey={t.priority.key}
                  label={t.priority.label}
                />
                <StatusBadge statusKey={t.status.key} label={t.status.label} />
                {showOrg && t.organization && (
                  <span className="text-xs text-muted-foreground">
                    · {t.organization.name}
                  </span>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

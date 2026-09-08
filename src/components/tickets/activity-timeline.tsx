import { formatRelative } from "@/lib/format";
import {
  Circle,
  UserPlus,
  ArrowRightLeft,
  Flag,
  MessageSquare,
  Lock,
  Paperclip,
  CheckCircle2,
  RotateCcw,
  XCircle,
  Mail,
  AlertTriangle,
} from "lucide-react";

interface Activity {
  id: string;
  type: string;
  fromValue: string | null;
  toValue: string | null;
  createdAt: Date | string;
  actor?: { id: string; name: string } | null;
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  CREATED: Circle,
  STATUS_CHANGED: ArrowRightLeft,
  PRIORITY_CHANGED: Flag,
  CATEGORY_CHANGED: Flag,
  ASSIGNED: UserPlus,
  TEAM_ASSIGNED: UserPlus,
  REASSIGNED: ArrowRightLeft,
  UNASSIGNED: UserPlus,
  PUBLIC_REPLY: MessageSquare,
  INTERNAL_NOTE: Lock,
  ATTACHMENT_ADDED: Paperclip,
  RESOLVED: CheckCircle2,
  REOPENED: RotateCcw,
  CLOSED: XCircle,
  EMAIL_LINKED: Mail,
  SLA_RESPONSE_BREACHED: AlertTriangle,
  SLA_RESOLUTION_BREACHED: AlertTriangle,
};

function label(a: Activity): string {
  const who = a.actor?.name ?? "System";
  switch (a.type) {
    case "CREATED":
      return `${who} created the ticket`;
    case "STATUS_CHANGED":
      return `${who} changed status ${a.fromValue ?? "?"} → ${a.toValue ?? "?"}`;
    case "PRIORITY_CHANGED":
      return `${who} changed priority ${a.fromValue ?? "?"} → ${a.toValue ?? "?"}`;
    case "ASSIGNED":
      return `${who} assigned the ticket`;
    case "REASSIGNED":
      return `${who} reassigned the ticket`;
    case "UNASSIGNED":
      return `${who} unassigned the ticket`;
    case "TEAM_ASSIGNED":
      return `${who} assigned a team`;
    case "PUBLIC_REPLY":
      return `${who} replied`;
    case "INTERNAL_NOTE":
      return `${who} added an internal note`;
    case "ATTACHMENT_ADDED":
      return `${who} added ${a.toValue ?? ""} attachment(s)`;
    case "RESOLVED":
      return `${who} marked the ticket resolved`;
    case "REOPENED":
      return `${who} reopened the ticket`;
    case "CLOSED":
      return `${who} closed the ticket`;
    case "EMAIL_LINKED":
      return `An email was linked to this ticket`;
    case "SLA_RESPONSE_BREACHED":
      return `Response SLA breached`;
    case "SLA_RESOLUTION_BREACHED":
      return `Resolution SLA breached`;
    default:
      return `${who}: ${a.type}`;
  }
}

export function ActivityTimeline({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
    );
  }
  return (
    <ol className="space-y-3">
      {activities.map((a) => {
        const Icon = ICONS[a.type] ?? Circle;
        return (
          <li key={a.id} className="flex gap-3 text-sm">
            <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border bg-muted">
              <Icon className="size-3" />
            </div>
            <div className="min-w-0">
              <p className="leading-snug">{label(a)}</p>
              <p className="text-xs text-muted-foreground">
                {formatRelative(a.createdAt)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

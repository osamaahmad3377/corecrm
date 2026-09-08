import type { SlaView } from "@/server/services/sla";
import { cn } from "@/lib/utils";
import { formatDateTime, formatDuration } from "@/lib/format";
import { CheckCircle2, AlertTriangle, Clock } from "lucide-react";

export function SlaPanel({
  sla,
  timezone,
}: {
  sla: SlaView;
  timezone: string;
}) {
  if (!sla.policyName && !sla.responseDueAt && !sla.resolutionDueAt) {
    return (
      <p className="text-sm text-muted-foreground">
        No SLA policy applies to this ticket.
      </p>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      {sla.policyName && (
        <p className="text-xs text-muted-foreground">
          Policy: <span className="font-medium">{sla.policyName}</span>
        </p>
      )}
      <SlaRow
        label="First response"
        dueAt={sla.responseDueAt}
        met={sla.responseMet}
        breached={sla.responseBreached}
        remainingMs={sla.responseRemainingMs}
        timezone={timezone}
      />
      <SlaRow
        label="Resolution"
        dueAt={sla.resolutionDueAt}
        met={sla.resolutionMet}
        breached={sla.resolutionBreached}
        remainingMs={sla.resolutionRemainingMs}
        timezone={timezone}
      />
    </div>
  );
}

function SlaRow({
  label,
  dueAt,
  met,
  breached,
  remainingMs,
  timezone,
}: {
  label: string;
  dueAt: Date | null;
  met: boolean | null;
  breached: boolean;
  remainingMs: number | null;
  timezone: string;
}) {
  if (!dueAt) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">—</span>
      </div>
    );
  }

  let state: "met" | "breached" | "pending";
  let text: string;
  if (met) {
    state = "met";
    text = "Met";
  } else if (breached) {
    state = "breached";
    text = "Breached";
  } else {
    state = "pending";
    text =
      remainingMs != null && remainingMs > 0
        ? `${formatDuration(remainingMs / 60000)} left`
        : "Due now";
  }

  const Icon =
    state === "met" ? CheckCircle2 : state === "breached" ? AlertTriangle : Clock;

  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-xs font-medium",
          state === "met" && "text-success",
          state === "breached" && "text-destructive",
          state === "pending" && "text-foreground",
        )}
        title={formatDateTime(dueAt, timezone)}
      >
        <Icon className="size-3.5" />
        {text}
      </span>
    </div>
  );
}

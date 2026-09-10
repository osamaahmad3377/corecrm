import { cn } from "@/lib/utils";
import { deadlineStatus, formatDateTime } from "@/lib/format";
import { AlarmClock, AlertTriangle, Clock } from "lucide-react";
import {
  toneBadgeClass,
  type Tone,
} from "@/lib/design-tokens";

/**
 * Inline deadline indicator: neutral when far off, amber when the deadline is
 * approaching (default: within 24h), red when overdue. Hidden once the ticket
 * is in a terminal state (or shown muted).
 */
export function DeadlineBadge({
  dueAt,
  terminal = false,
  timezone = "UTC",
  warnHours = 24,
  className,
}: {
  dueAt: Date | string | null | undefined;
  terminal?: boolean;
  timezone?: string;
  warnHours?: number;
  className?: string;
}) {
  if (!dueAt) return null;
  const s = deadlineStatus(dueAt, { terminal, warnHours });
  const tone: Tone =
    s.tone === "destructive"
      ? "destructive"
      : s.tone === "warning"
        ? "warning"
        : "neutral";
  const Icon =
    s.tone === "destructive"
      ? AlertTriangle
      : s.tone === "warning"
        ? AlarmClock
        : Clock;

  return (
    <span
      title={formatDateTime(dueAt, timezone)}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium",
        toneBadgeClass[tone],
        className,
      )}
    >
      <Icon className="size-3" />
      {s.label}
    </span>
  );
}

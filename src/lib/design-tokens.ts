/**
 * Visual tokens for domain concepts (ticket status, priority, tags).
 * Components read from here instead of hard-coding colour classes, so the
 * palette can be retuned in one place.
 *
 * Values are Tailwind utility strings built on the semantic CSS variables
 * defined in globals.css.
 */

export type Tone =
  | "neutral"
  | "info"
  | "primary"
  | "success"
  | "warning"
  | "destructive";

export const toneBadgeClass: Record<Tone, string> = {
  neutral:
    "bg-muted text-muted-foreground border-transparent",
  info: "bg-info/10 text-info border-info/20",
  primary: "bg-primary/10 text-primary border-primary/20",
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/15 text-warning-foreground border-warning/30",
  destructive:
    "bg-destructive/10 text-destructive border-destructive/20",
};

export const toneDotClass: Record<Tone, string> = {
  neutral: "bg-muted-foreground/50",
  info: "bg-info",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
};

/** Map a ticket status key → tone. */
export function statusTone(key: string): Tone {
  switch (key) {
    case "NEW":
      return "info";
    case "OPEN":
      return "primary";
    case "IN_PROGRESS":
      return "primary";
    case "WAITING_FOR_CLIENT":
      return "warning";
    case "WAITING_FOR_INTERNAL":
      return "warning";
    case "RESOLVED":
      return "success";
    case "CLOSED":
      return "neutral";
    case "CANCELLED":
      return "neutral";
    default:
      return "neutral";
  }
}

/** Map a ticket priority key → tone. */
export function priorityTone(key: string): Tone {
  switch (key) {
    case "LOW":
      return "neutral";
    case "MEDIUM":
      return "info";
    case "HIGH":
      return "warning";
    case "CRITICAL":
      return "destructive";
    default:
      return "neutral";
  }
}

export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

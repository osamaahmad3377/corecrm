import { formatDistanceToNowStrict } from "date-fns";

/**
 * All timestamps are stored in UTC. These helpers render them in a given IANA
 * timezone (the viewing user's `timezone`, defaulting to UTC).
 */

export function formatDateTime(
  date: Date | string | number,
  timeZone = "UTC",
): string {
  const d = new Date(date);
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(d);
}

export function formatDate(
  date: Date | string | number,
  timeZone = "UTC",
): string {
  const d = new Date(date);
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone,
  }).format(d);
}

export function formatRelative(date: Date | string | number): string {
  return formatDistanceToNowStrict(new Date(date), { addSuffix: true });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours % 1 === 0 ? hours : hours.toFixed(1)}h`;
  const days = hours / 24;
  return `${days % 1 === 0 ? days : days.toFixed(1)}d`;
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** e.g. "John Smith" from first/last. */
export function fullName(first: string, last: string): string {
  return `${first} ${last}`.trim();
}

export const COMMON_TIMEZONES = [
  "UTC",
  "Australia/Sydney",
  "Australia/Perth",
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
];

/* Minimal structured logger. Technical detail stays server-side. */

type Level = "debug" | "info" | "warn" | "error";

const QUIET = process.env.VITEST === "true" || process.env.NODE_ENV === "test";

function log(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (QUIET && level !== "error") return;
  const entry = {
    t: new Date().toISOString(),
    level,
    msg,
    ...(meta ?? {}),
  };
  const line = JSON.stringify(entry, (_k, v) =>
    v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v,
  );
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (m: string, meta?: Record<string, unknown>) =>
    process.env.NODE_ENV !== "production" && log("debug", m, meta),
  info: (m: string, meta?: Record<string, unknown>) => log("info", m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => log("warn", m, meta),
  error: (m: string, meta?: Record<string, unknown>) => log("error", m, meta),
};

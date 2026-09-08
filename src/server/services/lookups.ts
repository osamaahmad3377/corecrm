import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { notFound } from "@/lib/errors";

/** Cached ticket configuration lookups (statuses / priorities). */

let statusCache: Awaited<ReturnType<typeof loadStatuses>> | null = null;
let priorityCache: Awaited<ReturnType<typeof loadPriorities>> | null = null;

async function loadStatuses() {
  return prisma.ticketStatus.findMany({ orderBy: { order: "asc" } });
}
async function loadPriorities() {
  return prisma.ticketPriority.findMany({ orderBy: { order: "asc" } });
}

export async function getStatuses() {
  if (!statusCache) statusCache = await loadStatuses();
  return statusCache;
}
export async function getPriorities() {
  if (!priorityCache) priorityCache = await loadPriorities();
  return priorityCache;
}
export function clearLookupCache() {
  statusCache = null;
  priorityCache = null;
}

export async function statusByKey(key: string) {
  const s = (await getStatuses()).find((x) => x.key === key);
  if (!s) throw notFound(`Unknown status: ${key}`);
  return s;
}
export async function priorityByKey(key: string) {
  const p = (await getPriorities()).find((x) => x.key === key);
  if (!p) throw notFound(`Unknown priority: ${key}`);
  return p;
}
export async function defaultStatus() {
  const list = await getStatuses();
  return list.find((x) => x.isDefault) ?? list[0];
}
export async function defaultPriority() {
  const list = await getPriorities();
  return list.find((x) => x.isDefault) ?? list[0];
}

/** Transaction-scoped variants (no cache — used during writes). */
export async function statusByKeyTx(tx: Prisma.TransactionClient, key: string) {
  const s = await tx.ticketStatus.findUnique({ where: { key } });
  if (!s) throw notFound(`Unknown status: ${key}`);
  return s;
}
export async function priorityByKeyTx(
  tx: Prisma.TransactionClient,
  key: string,
) {
  const p = await tx.ticketPriority.findUnique({ where: { key } });
  if (!p) throw notFound(`Unknown priority: ${key}`);
  return p;
}

import "server-only";
import type { Prisma } from "@prisma/client";
import { TICKET_NUMBER_PREFIX } from "@/lib/constants";

/**
 * Generate the next human-readable ticket number: `TKT-YYYY-NNNNNN`.
 * Uses a per-year row in `Counter` incremented atomically inside the caller's
 * transaction, so numbers are gap-free and unique even under concurrency.
 *
 * The ticket's real identity is its UUID `id`; this string is for humans.
 */
export async function nextTicketNumber(
  tx: Prisma.TransactionClient,
  now: Date = new Date(),
): Promise<string> {
  const year = now.getUTCFullYear();
  const counterId = `ticket:${year}`;

  const counter = await tx.counter.upsert({
    where: { id: counterId },
    create: { id: counterId, value: 1 },
    update: { value: { increment: 1 } },
  });

  const seq = String(counter.value).padStart(6, "0");
  return `${TICKET_NUMBER_PREFIX}-${year}-${seq}`;
}

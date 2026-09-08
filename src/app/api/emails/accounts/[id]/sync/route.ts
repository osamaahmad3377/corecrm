import { NextRequest } from "next/server";
import { handle, ok } from "@/lib/api";
import { requirePermission } from "@/server/auth/context";
import { syncAccount } from "@/server/services/email-account";
import { enforceRateLimit, rateLimiters } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const ctx = await requirePermission("email.inbox.view");
    const { id } = await params;
    await enforceRateLimit(rateLimiters.api(), `sync:${ctx.userId}`);
    const result = await syncAccount(id);
    return ok(result);
  });
}

import { NextRequest } from "next/server";
import { handle, ok } from "@/lib/api";
import { requireAuth } from "@/server/auth/context";
import { prisma } from "@/server/db/client";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const ctx = await requireAuth();
    const sp = req.nextUrl.searchParams;

    const unread = await prisma.notification.count({
      where: { userId: ctx.userId, readAt: null },
    });

    if (sp.get("countOnly")) return ok({ unread });

    const limit = Math.min(50, Number(sp.get("limit") ?? 15));
    const items = await prisma.notification.findMany({
      where: { userId: ctx.userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return ok({ items, unread });
  });
}

/** Mark notifications read: all, or a single id via ?id=. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const ctx = await requireAuth();
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      await prisma.notification.updateMany({
        where: { id, userId: ctx.userId },
        data: { readAt: new Date() },
      });
    } else {
      await prisma.notification.updateMany({
        where: { userId: ctx.userId, readAt: null },
        data: { readAt: new Date() },
      });
    }
    return ok({ ok: true });
  });
}

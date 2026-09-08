import { NextRequest } from "next/server";
import { handle, ok } from "@/lib/api";
import { requireAuth } from "@/server/auth/context";
import { globalSearch } from "@/server/services/search";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const ctx = await requireAuth();
    const q = req.nextUrl.searchParams.get("q") ?? "";
    const results = await globalSearch(ctx, q);
    return ok(results);
  });
}

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/context";
import { beginConnect } from "@/server/services/email-account";
import { AppError, toAppError } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const ctx = await requirePermission("email.account.manage");
    const { provider } = await params;
    const kind = provider.toUpperCase();
    if (kind !== "MICROSOFT" && kind !== "GOOGLE") {
      throw new AppError("VALIDATION", "Unknown provider");
    }
    const url = await beginConnect(ctx, kind);
    return NextResponse.redirect(url);
  } catch (e) {
    const err = toAppError(e);
    return NextResponse.redirect(
      new URL(
        `/admin/emails/accounts?error=${encodeURIComponent(err.publicMessage)}`,
        process.env.APP_URL ?? "http://localhost:3000",
      ),
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requirePermission, requestMeta } from "@/server/auth/context";
import { completeConnect } from "@/server/services/email-account";
import { AppError, toAppError } from "@/lib/errors";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const base = env.APP_URL.replace(/\/$/, "");
  try {
    const ctx = await requirePermission("email.account.manage");
    const { provider } = await params;
    const kind = provider.toUpperCase();
    if (kind !== "MICROSOFT" && kind !== "GOOGLE") {
      throw new AppError("VALIDATION", "Unknown provider");
    }

    const sp = req.nextUrl.searchParams;
    const error = sp.get("error");
    if (error) {
      return NextResponse.redirect(
        `${base}/admin/emails/accounts?error=${encodeURIComponent(error)}`,
      );
    }
    const code = sp.get("code");
    const state = sp.get("state");
    if (!code || !state) throw new AppError("VALIDATION", "Missing code/state");

    const meta = await requestMeta();
    const account = await completeConnect(ctx, kind, code, state, meta);
    return NextResponse.redirect(
      `${base}/admin/emails/accounts?connected=${encodeURIComponent(account.address)}`,
    );
  } catch (e) {
    const err = toAppError(e);
    return NextResponse.redirect(
      `${base}/admin/emails/accounts?error=${encodeURIComponent(err.publicMessage)}`,
    );
  }
}

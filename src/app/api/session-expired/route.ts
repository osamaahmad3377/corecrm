import { NextResponse } from "next/server";
import { signOut } from "@/server/auth";

/**
 * Recovery path for a session token that outlived its user row — most often
 * after a local `prisma migrate reset`, which drops and recreates every user.
 *
 * The token is self-contained, so middleware still considers the request signed
 * in; only a database lookup reveals otherwise. Server Components cannot clear
 * cookies, so `requireAuth` sends the browser here instead: this handler drops
 * the session and hands the user to the login page, which breaks the redirect
 * loop that would otherwise bounce them between the app and /login.
 *
 * It lives under /api so the middleware matcher never intercepts it.
 */
export async function GET(req: Request) {
  await signOut({ redirect: false });
  return NextResponse.redirect(new URL("/login?expired=1", req.url));
}

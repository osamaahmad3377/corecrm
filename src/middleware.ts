import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/server/auth/config";
import { IMPERSONATION_COOKIE } from "@/server/auth/impersonation-constants";

const { auth } = NextAuth(authConfig);

type SessionUser = {
  isInternal?: boolean;
  internalRole?: string | null;
};

/** Where a signed-in user belongs by default. */
function homeFor(user: SessionUser | undefined): string {
  if (!user?.isInternal) return "/portal";
  return user.internalRole === "SUPPORT_AGENT" ? "/employee" : "/admin";
}

/**
 * Coarse routing guard. Fine-grained authorization always happens server-side in
 * services / route handlers; this only keeps unauthenticated users out of the
 * app shells and routes people to the right area.
 *
 * - Clients        → /portal
 * - Support Agents  → /employee
 * - Managers+       → /admin  (may also visit /employee)
 * - Managers+ with an active "view as client" cookie may enter /portal
 */
export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth?.user;
  const user = req.auth?.user as SessionUser | undefined;
  const path = nextUrl.pathname;

  const isAuthPage =
    path === "/login" ||
    path === "/forgot-password" ||
    path === "/reset-password" ||
    path.startsWith("/invite");

  const isProtected =
    path.startsWith("/admin") ||
    path.startsWith("/portal") ||
    path.startsWith("/employee");

  if (isProtected && !isLoggedIn) {
    const url = new URL("/login", nextUrl);
    url.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && (isAuthPage || path === "/")) {
    return NextResponse.redirect(new URL(homeFor(user), nextUrl));
  }

  if (!isLoggedIn) return NextResponse.next();

  const impersonating = req.cookies.has(IMPERSONATION_COOKIE);

  // /admin — internal only, and Support Agents are sent to their own portal.
  if (path.startsWith("/admin")) {
    if (!user?.isInternal) return NextResponse.redirect(new URL("/portal", nextUrl));
    if (user.internalRole === "SUPPORT_AGENT") {
      // Preserve deep links to a specific ticket.
      const m = path.match(/^\/admin\/tickets\/([0-9a-f-]{36})$/);
      if (m) {
        return NextResponse.redirect(new URL(`/employee/tasks/${m[1]}`, nextUrl));
      }
      return NextResponse.redirect(new URL("/employee", nextUrl));
    }
  }

  // /employee — any internal user.
  if (path.startsWith("/employee") && !user?.isInternal) {
    return NextResponse.redirect(new URL("/portal", nextUrl));
  }

  // /portal — clients, or internal staff actively "viewing as client".
  if (path.startsWith("/portal") && user?.isInternal && !impersonating) {
    return NextResponse.redirect(new URL(homeFor(user), nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};

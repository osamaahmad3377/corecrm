import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/server/auth/config";

const { auth } = NextAuth(authConfig);

/**
 * Coarse routing guard. Fine-grained authorization always happens server-side in
 * services / route handlers; this only keeps unauthenticated users out of the
 * app shells and routes people to the right area.
 */
export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth?.user;
  const user = req.auth?.user;

  const path = nextUrl.pathname;
  const isAuthPage =
    path === "/login" ||
    path === "/forgot-password" ||
    path === "/reset-password" ||
    path.startsWith("/invite");

  const isProtected =
    path.startsWith("/admin") || path.startsWith("/portal");

  if (isProtected && !isLoggedIn) {
    const url = new URL("/login", nextUrl);
    url.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && (path === "/login" || path === "/")) {
    return NextResponse.redirect(
      new URL(user?.isInternal ? "/admin" : "/portal", nextUrl),
    );
  }

  // Keep clients out of /admin and staff out of /portal.
  if (isLoggedIn && path.startsWith("/admin") && !user?.isInternal) {
    return NextResponse.redirect(new URL("/portal", nextUrl));
  }
  if (isLoggedIn && path.startsWith("/portal") && user?.isInternal) {
    return NextResponse.redirect(new URL("/admin", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};

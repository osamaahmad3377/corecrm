import { redirect } from "next/navigation";
import { getAuthContext } from "@/server/auth/context";
import { prisma } from "@/server/db/client";
import { Shell } from "@/components/app-shell/shell";
import { portalNav } from "@/components/app-shell/nav-config";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (ctx.isInternal) redirect("/admin");
  if (!ctx.organization) {
    // A client user with no organization link can't use the portal.
    redirect("/login?error=no-organization");
  }

  const nav = portalNav.filter((item) => {
    if (item.href === "/portal/users") {
      return ctx.organization!.role === "CLIENT_ADMIN";
    }
    return true;
  });

  const unread = await prisma.notification.count({
    where: { userId: ctx.userId, readAt: null },
  });

  return (
    <Shell
      nav={nav}
      scope="portal"
      profileHref="/portal/profile"
      unreadCount={unread}
      user={{ name: ctx.name, email: ctx.email }}
    >
      {children}
    </Shell>
  );
}

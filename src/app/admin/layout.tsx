import { redirect } from "next/navigation";
import { getAuthContext } from "@/server/auth/context";
import { prisma } from "@/server/db/client";
import { Shell } from "@/components/app-shell/shell";
import { adminNav } from "@/components/app-shell/nav-config";
import { can, hasInternalRank } from "@/server/auth/rbac";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!ctx.isInternal) redirect("/portal");

  const unread = await prisma.notification.count({
    where: { userId: ctx.userId, readAt: null },
  });

  // Hide nav entries the role can't open.
  const canSettings = hasInternalRank(ctx, "SUPPORT_MANAGER");
  const canEmailAccounts = can(ctx, "email.account.manage");
  const nav = adminNav
    .filter((item) => {
      if (item.href === "/admin/team" || item.href === "/admin/settings") {
        return canSettings;
      }
      if (item.href === "/admin/reports") return can(ctx, "reports.view");
      if (item.href === "/admin/emails") return can(ctx, "email.inbox.view");
      return true;
    })
    .map((item) =>
      item.href === "/admin/emails" && !canEmailAccounts
        ? {
            ...item,
            children: item.children?.filter(
              (c) => c.href !== "/admin/emails/accounts",
            ),
          }
        : item,
    );

  return (
    <Shell
      nav={nav}
      scope="admin"
      profileHref="/admin/settings/profile"
      unreadCount={unread}
      user={{ name: ctx.name, email: ctx.email }}
    >
      {children}
    </Shell>
  );
}

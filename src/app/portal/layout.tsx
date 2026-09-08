import { redirect } from "next/navigation";
import { requirePortalAuth } from "@/server/auth/context";
import { prisma } from "@/server/db/client";
import { Shell } from "@/components/app-shell/shell";
import { portalNav } from "@/components/app-shell/nav-config";
import { ImpersonationBanner } from "@/components/app-shell/impersonation-banner";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let ctx;
  try {
    ctx = await requirePortalAuth();
  } catch {
    redirect("/login");
  }
  if (!ctx.organization) redirect("/login?error=no-organization");

  const nav = portalNav.filter((item) => {
    if (item.href === "/portal/users") {
      return ctx.organization!.role === "CLIENT_ADMIN";
    }
    return true;
  });

  const org = await prisma.organization.findUnique({
    where: { id: ctx.organization.id },
    select: { name: true },
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
      banner={
        ctx.viewingAsClient ? (
          <ImpersonationBanner organizationName={org?.name ?? "client"} />
        ) : null
      }
    >
      {children}
    </Shell>
  );
}

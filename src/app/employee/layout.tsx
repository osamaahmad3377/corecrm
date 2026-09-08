import { redirect } from "next/navigation";
import { getAuthContext } from "@/server/auth/context";
import { prisma } from "@/server/db/client";
import { Shell } from "@/components/app-shell/shell";
import { employeeNav } from "@/components/app-shell/nav-config";

export default async function EmployeeLayout({
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

  return (
    <Shell
      nav={employeeNav}
      scope="employee"
      profileHref="/employee/profile"
      unreadCount={unread}
      user={{ name: ctx.name, email: ctx.email }}
    >
      {children}
    </Shell>
  );
}

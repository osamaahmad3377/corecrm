import type { Metadata } from "next";
import Link from "next/link";
import { requireInternal } from "@/server/auth/context";
import { prisma } from "@/server/db/client";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states";
import { MarkAllReadButton } from "@/components/notifications-mark-all";
import { formatRelative } from "@/lib/format";
import { Bell } from "lucide-react";

export const metadata: Metadata = { title: "Notifications" };

export default async function EmployeeNotificationsPage() {
  const ctx = await requireInternal();
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: ctx.userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.notification.count({ where: { userId: ctx.userId, readAt: null } }),
  ]);

  // Rewrite admin ticket links to the employee task route.
  const link = (url: string | null) =>
    url?.replace(/^\/admin\/tickets\//, "/employee/tasks/") ?? "#";

  return (
    <>
      <PageHeader
        title="Notifications"
        description={unread > 0 ? `${unread} unread` : "You're all caught up"}
        actions={unread > 0 && <MarkAllReadButton />}
      />
      {items.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications yet" />
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((n) => (
            <li key={n.id}>
              <Link
                href={link(n.linkUrl)}
                className="flex items-start gap-3 px-4 py-3 hover:bg-accent/40"
              >
                {!n.readAt && (
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                )}
                <div className={n.readAt ? "opacity-70" : ""}>
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="text-sm text-muted-foreground">{n.body}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatRelative(n.createdAt)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

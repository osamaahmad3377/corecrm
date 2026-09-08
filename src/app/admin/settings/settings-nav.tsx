"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ALL = [
  { label: "General", href: "/admin/settings", adminOnly: true },
  { label: "Categories", href: "/admin/settings/categories" },
  { label: "Priorities", href: "/admin/settings/priorities" },
  { label: "SLA", href: "/admin/settings/sla" },
  { label: "Security", href: "/admin/settings/security", adminOnly: true },
  { label: "Profile", href: "/admin/settings/profile" },
];

export function SettingsNav({
  canManageGeneral,
}: {
  canManageGeneral: boolean;
}) {
  const pathname = usePathname();
  const items = ALL.filter((i) => !i.adminOnly || canManageGeneral);
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
            pathname === item.href
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

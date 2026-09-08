"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav-config";
import { NAV_ICONS } from "./icon-map";

function isActive(
  item: NavItem,
  pathname: string,
  search: string,
): boolean {
  if (item.exact) return pathname === item.href;
  const [base] = item.href.split("?");
  if (item.href.includes("?")) {
    return pathname + "?" + search === item.href.replace(/^[^?]*/, pathname);
  }
  return pathname === base || pathname.startsWith(base + "/");
}

export function SidebarNav({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  return (
    <nav className="flex flex-col gap-0.5 px-2 py-2">
      {items.map((item) => {
        const active = isActive(item, pathname, search);
        const Icon = NAV_ICONS[item.icon];
        const showChildren =
          item.children &&
          (pathname === item.href.split("?")[0] ||
            pathname.startsWith(item.href.split("?")[0] + "/"));
        return (
          <div key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {item.label}
            </Link>
            {showChildren && item.children && (
              <div className="mb-1 ml-4 mt-0.5 flex flex-col gap-0.5 border-l pl-3">
                {item.children.map((child) => {
                  const childActive =
                    pathname + (search ? "?" + search : "") ===
                      child.href ||
                    (child.href === pathname && !search);
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={onNavigate}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-[13px] transition-colors",
                        childActive
                          ? "font-medium text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:text-sidebar-foreground",
                      )}
                    >
                      {child.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

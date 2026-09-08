"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Search } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Brand } from "@/components/brand";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";
import { CommandMenu } from "./command-menu";
import { NotificationsBell } from "./notifications-bell";
import type { NavItem } from "./nav-config";

export function Shell({
  nav,
  user,
  profileHref,
  scope,
  unreadCount,
  banner,
  homeHref,
  children,
}: {
  nav: NavItem[];
  user: { name: string; email: string; image?: string | null };
  profileHref: string;
  scope: "admin" | "portal" | "employee";
  unreadCount: number;
  banner?: React.ReactNode;
  homeHref?: string;
  children: React.ReactNode;
}) {
  const home =
    homeHref ??
    (scope === "admin" ? "/admin" : scope === "employee" ? "/employee" : "/portal");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  return (
    <div className="min-h-svh bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar lg:flex">
        <div className="flex h-14 items-center border-b px-4">
          <Link href={home}>
            <Brand />
          </Link>
        </div>
        <ScrollArea className="flex-1">
          <SidebarNav items={nav} />
        </ScrollArea>
      </aside>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-14 items-center border-b px-4">
            <Brand />
          </div>
          <ScrollArea className="h-[calc(100svh-3.5rem)]">
            <SidebarNav items={nav} onNavigate={() => setMobileOpen(false)} />
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Main column */}
      <div className="lg:pl-64">
        {banner}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </Button>

          <button
            onClick={() => setCmdOpen(true)}
            className="flex h-9 flex-1 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted sm:max-w-xs"
          >
            <Search className="size-4" />
            <span>Search…</span>
            <kbd className="ml-auto hidden rounded border bg-background px-1.5 text-[10px] sm:inline">
              ⌘K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <NotificationsBell
              scope={scope}
              initialUnread={unreadCount}
            />
            <UserMenu
              name={user.name}
              email={user.email}
              image={user.image}
              profileHref={profileHref}
            />
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>

      <CommandMenu open={cmdOpen} onOpenChange={setCmdOpen} scope={scope} />
    </div>
  );
}

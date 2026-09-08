"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatRelative } from "@/lib/format";

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  linkUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationsBell({
  scope,
  initialUnread,
}: {
  scope: "admin" | "portal" | "employee";
  initialUnread: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=10");
      if (res.ok) {
        const data = await res.json();
        setItems(data.items);
        setUnread(data.unread);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) load();
  }, [open]);

  useEffect(() => {
    const t = setInterval(async () => {
      const res = await fetch("/api/notifications?countOnly=1");
      if (res.ok) {
        const data = await res.json();
        setUnread(data.unread);
      }
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  async function markAllRead() {
    await fetch("/api/notifications", { method: "POST" });
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    router.refresh();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Notifications"
        >
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          {unread > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-primary hover:underline"
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {loading && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          )}
          {!loading && items.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              You&apos;re all caught up.
            </p>
          )}
          {items.map((n) => (
            <Link
              key={n.id}
              href={n.linkUrl ?? "#"}
              onClick={() => setOpen(false)}
              className="block border-b px-3 py-2.5 last:border-0 hover:bg-accent/50"
            >
              <div className="flex items-start gap-2">
                {!n.readAt && (
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                )}
                <div className={n.readAt ? "opacity-70" : ""}>
                  <p className="text-sm font-medium leading-tight">{n.title}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {n.body}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {formatRelative(n.createdAt)}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
        <div className="border-t px-3 py-2 text-center">
          <Link
            href={scope === "portal" ? "/portal/notifications" : scope === "employee" ? "/employee" : "/admin"}
            onClick={() => setOpen(false)}
            className="text-xs text-primary hover:underline"
          >
            View all
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

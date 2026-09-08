"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Building2, Ticket, Contact, HardDrive, Loader2 } from "lucide-react";

interface SearchResult {
  tickets: { id: string; ticketNumber: string; subject: string }[];
  organizations: { id: string; name: string }[];
  contacts: { id: string; name: string; email: string; organizationId: string }[];
  assets: { id: string; name: string; organizationId: string }[];
}

export function CommandMenu({
  open,
  onOpenChange,
  scope,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scope: "admin" | "portal" | "employee";
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(query)}`,
          { signal: ctrl.signal },
        );
        if (res.ok) setResults(await res.json());
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [query, open]);

  function go(href: string) {
    onOpenChange(false);
    setQuery("");
    router.push(href);
  }

  const ticketHref = (id: string) =>
    scope === "portal"
      ? `/portal/tickets/${id}`
      : scope === "employee"
        ? `/employee/tasks/${id}`
        : `/admin/tickets/${id}`;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search tickets, organizations, contacts…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {loading && (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Searching…
          </div>
        )}
        {!loading && query.length >= 2 && (
          <CommandEmpty>No results found.</CommandEmpty>
        )}
        {results && results.tickets.length > 0 && (
          <CommandGroup heading="Tickets">
            {results.tickets.map((t) => (
              <CommandItem
                key={t.id}
                value={`ticket-${t.id}-${t.ticketNumber}-${t.subject}`}
                onSelect={() => go(ticketHref(t.id))}
              >
                <Ticket className="size-4" />
                <span className="font-mono text-xs text-muted-foreground">
                  {t.ticketNumber}
                </span>
                <span className="truncate">{t.subject}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {scope === "admin" && results && results.organizations.length > 0 && (
          <CommandGroup heading="Organizations">
            {results.organizations.map((o) => (
              <CommandItem
                key={o.id}
                value={`org-${o.id}-${o.name}`}
                onSelect={() => go(`/admin/organizations/${o.id}`)}
              >
                <Building2 className="size-4" />
                {o.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {scope === "admin" && results && results.contacts.length > 0 && (
          <CommandGroup heading="Contacts">
            {results.contacts.map((c) => (
              <CommandItem
                key={c.id}
                value={`contact-${c.id}-${c.name}-${c.email}`}
                onSelect={() =>
                  go(`/admin/organizations/${c.organizationId}?tab=contacts`)
                }
              >
                <Contact className="size-4" />
                <span>{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.email}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {scope === "admin" && results && results.assets.length > 0 && (
          <CommandGroup heading="Assets">
            {results.assets.map((a) => (
              <CommandItem
                key={a.id}
                value={`asset-${a.id}-${a.name}`}
                onSelect={() =>
                  go(`/admin/organizations/${a.organizationId}?tab=assets`)
                }
              >
                <HardDrive className="size-4" />
                {a.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}

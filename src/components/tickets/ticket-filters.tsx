"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchInput } from "@/components/search-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface Option {
  key: string;
  label: string;
}

export function TicketFilters({
  statuses,
  priorities,
  organizations,
  showOrg,
}: {
  statuses: Option[];
  priorities: Option[];
  organizations?: { id: string; name: string }[];
  showOrg?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function set(key: string, value: string) {
    const sp = new URLSearchParams(params.toString());
    if (value && value !== "all") sp.set(key, value);
    else sp.delete(key);
    sp.set("page", "1");
    router.push(`${pathname}?${sp.toString()}`);
  }

  const hasFilters =
    params.get("q") ||
    params.get("status") ||
    params.get("priority") ||
    params.get("organizationId") ||
    params.get("view");

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <SearchInput placeholder="Search by number, subject, requester…" />

      <Select
        value={params.get("status") ?? "all"}
        onValueChange={(v) => set("status", v)}
      >
        <SelectTrigger size="sm" className="h-9 w-[150px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="OPEN_ALL">Open (any)</SelectItem>
          {statuses.map((s) => (
            <SelectItem key={s.key} value={s.key}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={params.get("priority") ?? "all"}
        onValueChange={(v) => set("priority", v)}
      >
        <SelectTrigger size="sm" className="h-9 w-[140px]">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All priorities</SelectItem>
          {priorities.map((p) => (
            <SelectItem key={p.key} value={p.key}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showOrg && organizations && (
        <Select
          value={params.get("organizationId") ?? "all"}
          onValueChange={(v) => set("organizationId", v)}
        >
          <SelectTrigger size="sm" className="h-9 w-[180px]">
            <SelectValue placeholder="Organization" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All organizations</SelectItem>
            {organizations.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select
        value={params.get("sort") ?? "newest"}
        onValueChange={(v) => set("sort", v)}
      >
        <SelectTrigger size="sm" className="h-9 w-[130px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">Newest</SelectItem>
          <SelectItem value="oldest">Oldest</SelectItem>
          <SelectItem value="updated">Recently updated</SelectItem>
          <SelectItem value="priority">Priority</SelectItem>
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(pathname)}
        >
          Clear
        </Button>
      )}
    </div>
  );
}

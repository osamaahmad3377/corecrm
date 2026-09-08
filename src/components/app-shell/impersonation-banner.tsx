"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { exitImpersonationAction } from "@/server/actions/impersonation";

export function ImpersonationBanner({
  organizationName,
}: {
  organizationName: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 bg-warning/15 px-4 py-2 text-sm text-warning-foreground">
      <span className="flex items-center gap-2">
        <Eye className="size-4" />
        Viewing the client portal as <strong>{organizationName}</strong>
      </span>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            await exitImpersonationAction();
            router.push("/admin/organizations");
            router.refresh();
          })
        }
        className="rounded-md border border-warning-foreground/30 px-2 py-1 text-xs font-medium hover:bg-warning/25 disabled:opacity-50"
      >
        {pending ? "Exiting…" : "Exit client view"}
      </button>
    </div>
  );
}

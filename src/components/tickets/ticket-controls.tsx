"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  assignTicketAction,
  changePriorityAction,
  changeStatusAction,
} from "@/server/actions/tickets";
import { toast } from "sonner";

interface Option {
  key: string;
  label: string;
}

export function StatusControl({
  ticketId,
  current,
  options,
}: {
  ticketId: string;
  current: string;
  options: Option[];
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Select
      value={current}
      disabled={pending}
      onValueChange={(v) =>
        start(async () => {
          const res = await changeStatusAction(ticketId, v);
          if (!res.ok) toast.error(res.error);
          else router.refresh();
        })
      }
    >
      <SelectTrigger size="sm" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.key} value={o.key}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PriorityControl({
  ticketId,
  current,
  options,
}: {
  ticketId: string;
  current: string;
  options: Option[];
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Select
      value={current}
      disabled={pending}
      onValueChange={(v) =>
        start(async () => {
          const res = await changePriorityAction(ticketId, v);
          if (!res.ok) toast.error(res.error);
          else router.refresh();
        })
      }
    >
      <SelectTrigger size="sm" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.key} value={o.key}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AssigneeControl({
  ticketId,
  current,
  agents,
  teams,
  currentTeam,
}: {
  ticketId: string;
  current: string | null;
  agents: { id: string; name: string }[];
  teams: { id: string; name: string }[];
  currentTeam: string | null;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function assign(agentId: string | null, teamId: string | null) {
    start(async () => {
      const res = await assignTicketAction(ticketId, {
        assignedAgentId: agentId,
        assignedTeamId: teamId,
      });
      if (!res.ok) toast.error(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Select
        value={current ?? "unassigned"}
        disabled={pending}
        onValueChange={(v) =>
          assign(v === "unassigned" ? null : v, currentTeam)
        }
      >
        <SelectTrigger size="sm" className="w-full">
          <SelectValue placeholder="Assign agent" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unassigned">Unassigned</SelectItem>
          {agents.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {teams.length > 0 && (
        <Select
          value={currentTeam ?? "none"}
          disabled={pending}
          onValueChange={(v) => assign(current, v === "none" ? null : v)}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="Assign team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No team</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export function ClientTicketActions({
  ticketId,
  statusKey,
}: {
  ticketId: string;
  statusKey: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  if (statusKey !== "RESOLVED") return null;

  function set(status: string) {
    start(async () => {
      const res = await changeStatusAction(ticketId, status);
      if (!res.ok) toast.error(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        disabled={pending}
        onClick={() => set("OPEN")}
        className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
      >
        Reopen ticket
      </button>
      <button
        disabled={pending}
        onClick={() => set("CLOSED")}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        Confirm & close
      </button>
    </div>
  );
}

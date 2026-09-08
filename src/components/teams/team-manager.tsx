"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToneBadge } from "@/components/badges";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/states";
import type { ActionState } from "@/server/actions/_helpers";
import {
  addTeamMemberAction,
  createTeamAction,
  deleteTeamAction,
  removeTeamMemberAction,
  updateTeamAction,
} from "@/server/actions/teams";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X } from "lucide-react";

interface Member {
  id: string;
  userId: string;
  user: { id: string; name: string; email: string; status: string };
}
interface Team {
  id: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "INACTIVE";
  members: Member[];
  _count: { tickets: number };
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

function TeamDialog({
  team,
  trigger,
}: {
  team?: Team;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const editing = Boolean(team);
  const action = editing
    ? updateTeamAction.bind(null, team!.id)
    : createTeamAction;
  const [state, formAction] = useActionState<ActionState, FormData>(action, {
    ok: false,
  } as ActionState);

  useEffect(() => {
    if (state.ok) {
      toast.success(state.message ?? "Saved");
      setOpen(false);
    } else if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit team" : "Create team"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="t-name">Name</Label>
            <Input id="t-name" name="name" required defaultValue={team?.name} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="t-desc">Description</Label>
            <Textarea
              id="t-desc"
              name="description"
              rows={2}
              defaultValue={team?.description ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select name="status" defaultValue={team?.status ?? "ACTIVE"}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end">
            <Submit label={editing ? "Save team" : "Create team"} />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MemberManager({
  team,
  staff,
}: {
  team: Team;
  staff: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const memberIds = new Set(team.members.map((m) => m.userId));
  const available = staff.filter((s) => !memberIds.has(s.id));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {team.members.length === 0 && (
          <span className="text-xs text-muted-foreground">No members yet</span>
        )}
        {team.members.map((m) => (
          <span
            key={m.id}
            className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs"
          >
            {m.user.name}
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await removeTeamMemberAction(team.id, m.userId);
                  if (!res.ok) toast.error(res.error);
                  else router.refresh();
                })
              }
              aria-label={`Remove ${m.user.name}`}
            >
              <X className="size-3 text-muted-foreground hover:text-foreground" />
            </button>
          </span>
        ))}
      </div>
      {available.length > 0 && (
        <Select
          disabled={pending}
          onValueChange={(userId) =>
            start(async () => {
              const res = await addTeamMemberAction(team.id, userId);
              if (!res.ok) toast.error(res.error);
              else router.refresh();
            })
          }
        >
          <SelectTrigger size="sm" className="h-8 w-[220px]">
            <SelectValue placeholder="Add member…" />
          </SelectTrigger>
          <SelectContent>
            {available.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export function TeamManager({
  teams,
  staff,
  canManage,
}: {
  teams: Team[];
  staff: { id: string; name: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-sm">Support teams ({teams.length})</CardTitle>
        {canManage && (
          <TeamDialog
            trigger={
              <Button size="sm">
                <Plus className="size-4" /> New team
              </Button>
            }
          />
        )}
      </CardHeader>
      <CardContent>
        {teams.length === 0 ? (
          <EmptyState title="No teams yet" description="Create a team and assign staff to it." />
        ) : (
          <ul className="divide-y">
            {teams.map((team) => (
              <li key={team.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {team.name}
                      <ToneBadge
                        tone={team.status === "ACTIVE" ? "success" : "neutral"}
                      >
                        {team.status === "ACTIVE" ? "Active" : "Inactive"}
                      </ToneBadge>
                    </p>
                    {team.description && (
                      <p className="text-xs text-muted-foreground">
                        {team.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {team._count.tickets} ticket
                      {team._count.tickets === 1 ? "" : "s"}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <TeamDialog
                        team={team}
                        trigger={
                          <Button variant="ghost" size="icon" className="size-8">
                            <Pencil className="size-3.5" />
                          </Button>
                        }
                      />
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="icon" className="size-8">
                            <Trash2 className="size-3.5 text-muted-foreground" />
                          </Button>
                        }
                        title="Delete this team?"
                        description="Teams assigned to tickets can't be deleted — set them inactive instead."
                        destructive
                        confirmLabel="Delete"
                        onConfirm={async () => {
                          const res = await deleteTeamAction(team.id);
                          if (res.ok) {
                            router.refresh();
                            return { ok: true };
                          }
                          return { ok: false, error: res.error };
                        }}
                      />
                    </div>
                  )}
                </div>
                {canManage && (
                  <div className="mt-2">
                    <MemberManager team={team} staff={staff} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

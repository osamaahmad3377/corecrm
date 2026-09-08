"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { updateEmailAccountAction } from "@/server/actions/emails";
import type { ActionState } from "@/server/actions/_helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

export function AccountSettingsForm({
  account,
  organizations,
  teams,
}: {
  account: {
    id: string;
    displayName: string;
    scope: "GLOBAL" | "ORGANIZATION" | "TEAM";
    organizationId: string | null;
    teamId: string | null;
    isActive: boolean;
  };
  organizations: { id: string; name: string }[];
  teams: { id: string; name: string }[];
}) {
  const action = updateEmailAccountAction.bind(null, account.id);
  const [state, formAction] = useActionState<ActionState, FormData>(action, {
    ok: false,
  } as ActionState);
  const [scope, setScope] = useState(account.scope);

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
    else if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`dn-${account.id}`}>Display name</Label>
        <Input
          id={`dn-${account.id}`}
          name="displayName"
          defaultValue={account.displayName}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Routing scope</Label>
        <Select
          name="scope"
          value={scope}
          onValueChange={(v) => setScope(v as typeof scope)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GLOBAL">Global support</SelectItem>
            <SelectItem value="ORGANIZATION">Specific organization</SelectItem>
            <SelectItem value="TEAM">Specific team</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {scope === "ORGANIZATION" && (
        <div className="space-y-1.5">
          <Label>Organization</Label>
          <Select
            name="organizationId"
            defaultValue={account.organizationId ?? undefined}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {organizations.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {scope === "TEAM" && (
        <div className="space-y-1.5">
          <Label>Team</Label>
          <Select name="teamId" defaultValue={account.teamId ?? undefined}>
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <Checkbox name="isActive" defaultChecked={account.isActive} />
        Active — include in sync and let agents send from it
      </label>
      <div className="sm:col-span-2">
        <Save />
      </div>
    </form>
  );
}

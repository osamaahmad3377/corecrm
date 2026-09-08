"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { updateGeneralSettingsAction } from "@/server/actions/settings";
import type { ActionState } from "@/server/actions/_helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COMMON_TIMEZONES } from "@/lib/format";
import { toast } from "sonner";

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save settings"}
    </Button>
  );
}

export function GeneralSettingsForm({
  settings,
  priorities,
}: {
  settings: {
    companyName: string;
    supportEmail: string;
    defaultTimezone: string;
    defaultPriorityKey: string;
  };
  priorities: { key: string; label: string }[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    updateGeneralSettingsAction,
    { ok: false } as ActionState,
  );
  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
    else if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="max-w-lg space-y-4">
      <div className="space-y-2">
        <Label htmlFor="companyName">Company name</Label>
        <Input
          id="companyName"
          name="companyName"
          defaultValue={settings.companyName}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="supportEmail">Support email (display)</Label>
        <Input
          id="supportEmail"
          name="supportEmail"
          type="email"
          defaultValue={settings.supportEmail}
          placeholder="support@company.com"
        />
      </div>
      <div className="space-y-2">
        <Label>Default timezone</Label>
        <Select name="defaultTimezone" defaultValue={settings.defaultTimezone}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMMON_TIMEZONES.map((tz) => (
              <SelectItem key={tz} value={tz}>
                {tz}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Default ticket priority</Label>
        <Select
          name="defaultPriorityKey"
          defaultValue={settings.defaultPriorityKey}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {priorities.map((p) => (
              <SelectItem key={p.key} value={p.key}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Save />
    </form>
  );
}

"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import {
  changePasswordAction,
  updateProfileAction,
} from "@/server/actions/users";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { COMMON_TIMEZONES } from "@/lib/format";
import { toast } from "sonner";

function Save({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function ProfileForm({
  name,
  email,
  timezone,
}: {
  name: string;
  email: string;
  timezone: string;
}) {
  const [pState, pAction] = useActionState<ActionState, FormData>(
    updateProfileAction,
    { ok: false } as ActionState,
  );
  const [pwState, pwAction] = useActionState<ActionState, FormData>(
    changePasswordAction,
    { ok: false } as ActionState,
  );

  useEffect(() => {
    if (pState.ok && pState.message) toast.success(pState.message);
    else if (pState.error) toast.error(pState.error);
  }, [pState]);
  useEffect(() => {
    if (pwState.ok && pwState.message) toast.success(pwState.message);
    else if (pwState.error) toast.error(pwState.error);
  }, [pwState]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={pAction} className="max-w-md space-y-4">
            <div className="space-y-2">
              <Label htmlFor="p-name">Name</Label>
              <Input id="p-name" name="name" defaultValue={name} required />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={email} disabled />
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select name="timezone" defaultValue={timezone}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set([timezone, ...COMMON_TIMEZONES])].map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Save label="Save profile" />
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={pwAction} className="max-w-md space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cp-current">Current password</Label>
              <Input
                id="cp-current"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cp-new">New password</Label>
              <Input
                id="cp-new"
                name="password"
                type="password"
                autoComplete="new-password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cp-confirm">Confirm new password</Label>
              <Input
                id="cp-confirm"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
              />
            </div>
            <Save label="Change password" />
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { onboardOrganizationAction } from "@/server/actions/organizations";
import type { ActionState } from "@/server/actions/_helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating…" : "Create organization"}
    </Button>
  );
}

export function OnboardForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(
    onboardOrganizationAction,
    { ok: false } as ActionState,
  );

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
    else if (!state.ok && state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Organization information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field name="name" label="Name of organisation" required />
          <Field name="legalName" label="Legal name" />
          <Field name="mainEmail" label="Org email" type="email" required />
          <Field name="mainPhone" label="Contact number" required />
          <Field name="businessHours" label="Business hours" placeholder="e.g. Mon–Fri 9:00–17:00 AEST" />
          <Field name="location" label="Location" placeholder="e.g. Newcastle, NSW" />
          <Field
            name="onboardingDate"
            label="Onboarding date"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
          <Field name="industry" label="Industry" />
          <Field name="website" label="Website link (optional)" placeholder="https://" />
          <Field name="sharepointUrl" label="SharePoint link (optional)" placeholder="https://" />
          <Field name="addressLine1" label="Address" className="sm:col-span-2" />
          <Field name="city" label="City" />
          <Field name="state" label="State / Region" />
          <Field name="country" label="Country" />
          <Field name="postalCode" label="Postal code" />
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={3} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Primary contact</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field name="pc_firstName" label="First name" required />
          <Field name="pc_lastName" label="Last name" required />
          <Field name="pc_email" label="Email" type="email" required />
          <Field name="pc_phone" label="Phone" />
          <Field name="pc_position" label="Position" className="sm:col-span-2" />
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Checkbox name="inviteClientAdmin" defaultChecked />
            Send a client portal invitation to this contact (as Client Admin)
          </label>
        </CardContent>
      </Card>

      <SubmitButton />
    </form>
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
  placeholder,
  className,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
  defaultValue?: string;
}) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label htmlFor={name}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <Input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
      />
    </div>
  );
}

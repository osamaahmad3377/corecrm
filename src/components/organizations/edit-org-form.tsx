"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { updateOrganizationAction } from "@/server/actions/organizations";
import type { ActionState } from "@/server/actions/_helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface Org {
  id: string;
  name: string;
  legalName: string | null;
  website: string | null;
  industry: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  mainPhone: string | null;
  mainEmail: string | null;
  notes: string | null;
}

export function EditOrgForm({ org }: { org: Org }) {
  const action = updateOrganizationAction.bind(null, org.id);
  const [state, formAction] = useActionState<ActionState, FormData>(action, {
    ok: false,
  } as ActionState);

  useEffect(() => {
    if (state.ok) toast.success("Saved");
    else if (state.error) toast.error(state.error);
  }, [state]);

  const F = ({
    name,
    label,
    type = "text",
    className,
    defaultValue,
  }: {
    name: string;
    label: string;
    type?: string;
    className?: string;
    defaultValue?: string | null;
  }) => (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label htmlFor={`e-${name}`}>{label}</Label>
      <Input
        id={`e-${name}`}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
      />
    </div>
  );

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <F name="name" label="Organization name" defaultValue={org.name} />
      <F name="legalName" label="Legal name" defaultValue={org.legalName} />
      <F name="website" label="Website" defaultValue={org.website} />
      <F name="industry" label="Industry" defaultValue={org.industry} />
      <F
        name="addressLine1"
        label="Address"
        className="sm:col-span-2"
        defaultValue={org.addressLine1}
      />
      <F name="city" label="City" defaultValue={org.city} />
      <F name="state" label="State / Region" defaultValue={org.state} />
      <F name="country" label="Country" defaultValue={org.country} />
      <F name="postalCode" label="Postal code" defaultValue={org.postalCode} />
      <F name="mainPhone" label="Main phone" defaultValue={org.mainPhone} />
      <F
        name="mainEmail"
        label="Main email"
        type="email"
        defaultValue={org.mainEmail}
      />
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="e-notes">Notes</Label>
        <Textarea
          id="e-notes"
          name="notes"
          rows={3}
          defaultValue={org.notes ?? ""}
        />
      </div>
      <div className="sm:col-span-2">
        <SaveButton />
      </div>
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}

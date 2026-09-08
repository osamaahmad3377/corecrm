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
  sharepointUrl: string | null;
  industry: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  location: string | null;
  businessHours: string | null;
  mainPhone: string | null;
  mainEmail: string | null;
  onboardingDate: string | Date;
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
      <F name="name" label="Name of organisation" defaultValue={org.name} />
      <F name="legalName" label="Legal name" defaultValue={org.legalName} />
      <F name="mainEmail" label="Org email" type="email" defaultValue={org.mainEmail} />
      <F name="mainPhone" label="Contact number" defaultValue={org.mainPhone} />
      <F name="businessHours" label="Business hours" defaultValue={org.businessHours} />
      <F name="location" label="Location" defaultValue={org.location} />
      <F
        name="onboardingDate"
        label="Onboarding date"
        type="date"
        defaultValue={new Date(org.onboardingDate).toISOString().slice(0, 10)}
      />
      <F name="industry" label="Industry" defaultValue={org.industry} />
      <F name="website" label="Website link" defaultValue={org.website} />
      <F name="sharepointUrl" label="SharePoint link" defaultValue={org.sharepointUrl} />
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

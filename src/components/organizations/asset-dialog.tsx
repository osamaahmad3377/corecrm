"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createAssetAction, updateAssetAction } from "@/server/actions/assets";
import type { ActionState } from "@/server/actions/_helpers";
import { toast } from "sonner";

const TYPES = [
  "LAPTOP",
  "DESKTOP",
  "SERVER",
  "PRINTER",
  "ROUTER",
  "FIREWALL",
  "MOBILE",
  "M365_TENANT",
  "WEBSITE",
  "DOMAIN",
  "SOFTWARE",
  "OTHER",
];

interface AssetData {
  id: string;
  name: string;
  assetType: string;
  serialNumber: string | null;
  model: string | null;
  manufacturer: string | null;
  ipAddress: string | null;
  hostname: string | null;
  notes: string | null;
}

function Submit({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : editing ? "Save asset" : "Add asset"}
    </Button>
  );
}

export function AssetDialog({
  organizationId,
  asset,
  trigger,
}: {
  organizationId: string;
  asset?: AssetData;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const editing = Boolean(asset);
  const action = editing
    ? updateAssetAction.bind(null, asset!.id, organizationId)
    : createAssetAction.bind(null, organizationId);
  const [state, formAction] = useActionState<ActionState, FormData>(action, {
    ok: false,
  } as ActionState);

  useEffect(() => {
    if (state.ok) {
      toast.success(state.message ?? "Saved");
      setOpen(false);
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit asset" : "Add asset"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="a-name">Name</Label>
            <Input id="a-name" name="name" required defaultValue={asset?.name} />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select name="assetType" defaultValue={asset?.assetType ?? "LAPTOP"}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="a-serial">Serial number</Label>
            <Input
              id="a-serial"
              name="serialNumber"
              defaultValue={asset?.serialNumber ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="a-model">Model</Label>
            <Input id="a-model" name="model" defaultValue={asset?.model ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="a-manu">Manufacturer</Label>
            <Input
              id="a-manu"
              name="manufacturer"
              defaultValue={asset?.manufacturer ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="a-ip">IP address</Label>
            <Input
              id="a-ip"
              name="ipAddress"
              defaultValue={asset?.ipAddress ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="a-host">Hostname</Label>
            <Input
              id="a-host"
              name="hostname"
              defaultValue={asset?.hostname ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="a-purchase">Purchase date</Label>
            <Input id="a-purchase" name="purchaseDate" type="date" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="a-warranty">Warranty expiry</Label>
            <Input id="a-warranty" name="warrantyExpiry" type="date" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="a-notes">Notes</Label>
            <Textarea
              id="a-notes"
              name="notes"
              rows={2}
              defaultValue={asset?.notes ?? ""}
            />
          </div>
          <div className="flex justify-end sm:col-span-2">
            <Submit editing={editing} />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use server";

import { requirePermission } from "@/server/auth/context";
import { runAction, requestMeta, type ActionState } from "./_helpers";
import { assetInputSchema } from "@/validators/asset";
import { createAsset, deleteAsset, updateAsset } from "@/server/services/asset";

function readAsset(fd: FormData) {
  return assetInputSchema.safeParse({
    name: fd.get("name") ?? "",
    assetType: fd.get("assetType") ?? "OTHER",
    serialNumber: fd.get("serialNumber") ?? "",
    model: fd.get("model") ?? "",
    manufacturer: fd.get("manufacturer") ?? "",
    ipAddress: fd.get("ipAddress") ?? "",
    hostname: fd.get("hostname") ?? "",
    purchaseDate: fd.get("purchaseDate") ?? "",
    warrantyExpiry: fd.get("warrantyExpiry") ?? "",
    assignedUserId: fd.get("assignedUserId") ?? "",
    notes: fd.get("notes") ?? "",
  });
}

export async function createAssetAction(
  organizationId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const ctx = await requirePermission("asset.manage");
  const parsed = readAsset(fd);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  return runAction(async () => {
    const meta = await requestMeta();
    await createAsset(ctx, organizationId, parsed.data, meta);
    return {
      message: "Asset added",
      revalidate: [`/admin/organizations/${organizationId}`, "/admin/assets"],
    };
  });
}

export async function updateAssetAction(
  id: string,
  organizationId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const ctx = await requirePermission("asset.manage");
  const parsed = readAsset(fd);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  return runAction(async () => {
    const meta = await requestMeta();
    await updateAsset(ctx, id, parsed.data, meta);
    return {
      message: "Saved",
      revalidate: [`/admin/organizations/${organizationId}`, "/admin/assets"],
    };
  });
}

export async function deleteAssetAction(
  id: string,
  organizationId: string,
): Promise<ActionState> {
  const ctx = await requirePermission("asset.manage");
  return runAction(async () => {
    const meta = await requestMeta();
    await deleteAsset(ctx, id, meta);
    return {
      revalidate: [`/admin/organizations/${organizationId}`, "/admin/assets"],
    };
  });
}

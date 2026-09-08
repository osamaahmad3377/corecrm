"use server";

import { redirect } from "next/navigation";
import { requirePermission } from "@/server/auth/context";
import { runAction, requestMeta, type ActionState } from "./_helpers";
import {
  onboardOrganizationSchema,
  organizationInputSchema,
} from "@/validators/organization";
import {
  deleteOrganization,
  onboardOrganization,
  setOrganizationStatus,
  updateOrganization,
} from "@/server/services/organization";

function readOrgFields(fd: FormData) {
  return {
    name: fd.get("name") ?? "",
    legalName: fd.get("legalName") ?? "",
    website: fd.get("website") ?? "",
    sharepointUrl: fd.get("sharepointUrl") ?? "",
    industry: fd.get("industry") ?? "",
    addressLine1: fd.get("addressLine1") ?? "",
    addressLine2: fd.get("addressLine2") ?? "",
    city: fd.get("city") ?? "",
    state: fd.get("state") ?? "",
    country: fd.get("country") ?? "",
    postalCode: fd.get("postalCode") ?? "",
    location: fd.get("location") ?? "",
    businessHours: fd.get("businessHours") ?? "",
    mainPhone: fd.get("mainPhone") ?? "",
    mainEmail: fd.get("mainEmail") ?? "",
    accountManagerId: fd.get("accountManagerId") ?? "",
    onboardingDate: fd.get("onboardingDate") ?? "",
    notes: fd.get("notes") ?? "",
  };
}

export async function onboardOrganizationAction(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState<{ id: string }>> {
  const ctx = await requirePermission("org.create");

  const parsed = onboardOrganizationSchema.safeParse({
    organization: readOrgFields(fd),
    primaryContact: {
      firstName: fd.get("pc_firstName") ?? "",
      lastName: fd.get("pc_lastName") ?? "",
      email: fd.get("pc_email") ?? "",
      phone: fd.get("pc_phone") ?? "",
      position: fd.get("pc_position") ?? "",
    },
    inviteClientAdmin: fd.get("inviteClientAdmin") === "on",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please check the form.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const result = await runAction(async () => {
    const meta = await requestMeta();
    const { organization, acceptUrl } = await onboardOrganization({
      ctx,
      organization: parsed.data.organization,
      primaryContact: parsed.data.primaryContact,
      inviteClientAdmin: parsed.data.inviteClientAdmin,
      meta,
    });
    return {
      data: { id: organization.id },
      message: acceptUrl
        ? `Organization created. Invitation link: ${acceptUrl}`
        : "Organization created.",
      revalidate: ["/admin/organizations"],
    };
  });

  if (result.ok && result.data) {
    redirect(`/admin/organizations/${result.data.id}`);
  }
  return result;
}

export async function updateOrganizationAction(
  id: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const ctx = await requirePermission("org.update");
  const parsed = organizationInputSchema.safeParse(readOrgFields(fd));
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please check the form.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  return runAction(async () => {
    const meta = await requestMeta();
    await updateOrganization(ctx, id, parsed.data, meta);
    return {
      message: "Saved",
      revalidate: [`/admin/organizations/${id}`, "/admin/organizations"],
    };
  });
}

export async function setOrganizationStatusAction(
  id: string,
  status: "ACTIVE" | "DISABLED",
): Promise<ActionState> {
  const ctx = await requirePermission("org.disable");
  return runAction(async () => {
    const meta = await requestMeta();
    await setOrganizationStatus(ctx, id, status, meta);
    return {
      revalidate: [`/admin/organizations/${id}`, "/admin/organizations"],
    };
  });
}

export async function deleteOrganizationAction(
  id: string,
  confirmName: string,
): Promise<ActionState> {
  const ctx = await requirePermission("org.delete");
  const result = await runAction(async () => {
    const meta = await requestMeta();
    await deleteOrganization(ctx, id, confirmName, meta);
    return { revalidate: ["/admin/organizations", "/admin"] };
  });
  if (result.ok) redirect("/admin/organizations");
  return result;
}

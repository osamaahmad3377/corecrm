import type { Metadata } from "next";
import { guardPage, requirePermission } from "@/server/auth/context";
import { PageHeader } from "@/components/page-header";
import { OnboardForm } from "@/components/organizations/onboard-form";

export const metadata: Metadata = { title: "Onboard organization" };

export default async function NewOrganizationPage() {
  await guardPage(() => requirePermission("org.create"));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Onboard a client organization"
        description="Create the organization, add its primary contact, and optionally send a portal invitation."
      />
      <OnboardForm />
    </div>
  );
}

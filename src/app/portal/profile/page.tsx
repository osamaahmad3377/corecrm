import type { Metadata } from "next";
import { requireAuth } from "@/server/auth/context";
import { PageHeader } from "@/components/page-header";
import { ProfileForm } from "@/components/settings/profile-form";

export const metadata: Metadata = { title: "Profile" };

export default async function PortalProfilePage() {
  const ctx = await requireAuth();
  return (
    <div className="max-w-2xl">
      <PageHeader title="Profile" description="Manage your account details." />
      <ProfileForm name={ctx.name} email={ctx.email} timezone={ctx.timezone} />
    </div>
  );
}

import { requireInternal } from "@/server/auth/context";
import { PageHeader } from "@/components/page-header";
import { ProfileForm } from "@/components/settings/profile-form";

export default async function EmployeeProfilePage() {
  const ctx = await requireInternal();
  return (
    <div className="max-w-2xl">
      <PageHeader title="Profile" description="Manage your account details." />
      <ProfileForm name={ctx.name} email={ctx.email} timezone={ctx.timezone} />
    </div>
  );
}

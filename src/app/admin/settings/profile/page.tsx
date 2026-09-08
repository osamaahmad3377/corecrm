import { requireAuth } from "@/server/auth/context";
import { ProfileForm } from "@/components/settings/profile-form";

export default async function AdminProfileSettingsPage() {
  const ctx = await requireAuth();
  return (
    <ProfileForm name={ctx.name} email={ctx.email} timezone={ctx.timezone} />
  );
}

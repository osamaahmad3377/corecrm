import { guardPage, requireInternal } from "@/server/auth/context";
import { can } from "@/server/auth/rbac";
import { PageHeader } from "@/components/page-header";
import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await guardPage(() => requireInternal("SUPPORT_MANAGER"));
  const canManageGeneral = can(ctx, "internal.settings.manage");

  return (
    <>
      <PageHeader
        title="Settings"
        description="Configure the helpdesk, ticket workflow and security."
      />
      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <SettingsNav canManageGeneral={canManageGeneral} />
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}

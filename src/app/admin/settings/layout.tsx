import { requireInternal } from "@/server/auth/context";
import { PageHeader } from "@/components/page-header";
import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireInternal("SUPPORT_MANAGER");
  return (
    <>
      <PageHeader
        title="Settings"
        description="Configure the helpdesk, ticket workflow and security."
      />
      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <SettingsNav />
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}

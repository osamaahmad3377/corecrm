import { redirect } from "next/navigation";
import { guardPage, requireInternal } from "@/server/auth/context";
import { can } from "@/server/auth/rbac";

/** The Email tab in Settings routes to the full mailbox management screen. */
export default async function EmailSettingsRedirect() {
  const ctx = await guardPage(() => requireInternal("SUPPORT_MANAGER"));
  if (!can(ctx, "email.account.manage")) redirect("/admin/settings/sla");
  redirect("/admin/emails/accounts");
}

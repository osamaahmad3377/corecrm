import { redirect } from "next/navigation";
import { getAuthContext } from "@/server/auth/context";

export default async function RootPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  redirect(ctx.isInternal ? "/admin" : "/portal");
}

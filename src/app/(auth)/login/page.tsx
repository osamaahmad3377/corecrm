import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-5 space-y-1">
          <h2 className="text-lg font-semibold">Sign in to your account</h2>
          <p className="text-sm text-muted-foreground">
            Use the email address your invitation was sent to.
          </p>
        </div>
        <LoginForm callbackUrl={callbackUrl} />
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link
            href="/forgot-password"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Forgot your password?
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

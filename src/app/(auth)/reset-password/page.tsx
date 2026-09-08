import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { SimpleAuthForm } from "@/components/auth-simple-form";
import { resetPasswordAction } from "../actions";

export const metadata: Metadata = { title: "Set a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-6 text-center">
          <h2 className="text-lg font-semibold">Invalid link</h2>
          <p className="text-sm text-muted-foreground">
            This password reset link is missing or malformed.
          </p>
          <Link
            href="/forgot-password"
            className="text-sm font-medium underline underline-offset-4"
          >
            Request a new link
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-5 space-y-1">
          <h2 className="text-lg font-semibold">Set a new password</h2>
          <p className="text-sm text-muted-foreground">
            Choose a strong password of at least 10 characters.
          </p>
        </div>
        <SimpleAuthForm
          action={resetPasswordAction}
          submitLabel="Update password"
          hidden={{ token }}
          fields={[
            {
              name: "password",
              label: "New password",
              type: "password",
              autoComplete: "new-password",
              required: true,
            },
            {
              name: "confirmPassword",
              label: "Confirm password",
              type: "password",
              autoComplete: "new-password",
              required: true,
            },
          ]}
        />
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link
            href="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

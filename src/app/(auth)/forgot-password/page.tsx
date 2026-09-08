import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { SimpleAuthForm } from "@/components/auth-simple-form";
import { forgotPasswordAction } from "../actions";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-5 space-y-1">
          <h2 className="text-lg font-semibold">Reset your password</h2>
          <p className="text-sm text-muted-foreground">
            Enter your email and we&apos;ll send you a reset link.
          </p>
        </div>
        <SimpleAuthForm
          action={forgotPasswordAction}
          submitLabel="Send reset link"
          fields={[
            {
              name: "email",
              label: "Email",
              type: "email",
              autoComplete: "email",
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

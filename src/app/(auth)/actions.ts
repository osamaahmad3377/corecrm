"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { signIn } from "@/server/auth";
import { loginSchema, forgotPasswordSchema, resetPasswordSchema } from "@/validators/auth";
import { acceptInvitationSchema } from "@/validators/auth";
import { requestPasswordReset, resetPassword } from "@/server/services/user";
import { acceptInvitation } from "@/server/services/invitation";
import { enforceRateLimit, rateLimiters } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

type ActionResult = { ok: boolean; error?: string; message?: string };

async function clientKey(prefix: string) {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown";
  return `${prefix}:${ip}`;
}

export async function loginAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email and password." };
  }

  try {
    await enforceRateLimit(rateLimiters.auth(), await clientKey("login"));
  } catch {
    return {
      ok: false,
      error: "Too many attempts. Please wait a minute and try again.",
    };
  }

  const callbackUrl =
    (formData.get("callbackUrl") as string | null) || undefined;

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/",
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, error: "Incorrect email or password." };
    }
    throw error; // NEXT_REDIRECT and anything unexpected
  }
}

export async function forgotPasswordAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { ok: false, error: "Enter a valid email." };

  try {
    await enforceRateLimit(
      rateLimiters.passwordReset(),
      await clientKey("forgot"),
    );
    await requestPasswordReset(parsed.data.email);
  } catch (e) {
    logger.warn("forgot_password.error", { error: e });
  }
  return {
    ok: true,
    message:
      "If an account exists for that email, we've sent a link to reset the password.",
  };
}

export async function resetPasswordAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }
  try {
    await resetPassword(parsed.data.token, parsed.data.password);
    return { ok: true, message: "Password updated. You can sign in now." };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof AppError ? e.publicMessage : "Could not reset the password.",
    };
  }
}

export async function acceptInvitationAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = acceptInvitationSchema.safeParse({
    token: formData.get("token"),
    name: formData.get("name"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    timezone: formData.get("timezone") || "UTC",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }

  try {
    await enforceRateLimit(
      rateLimiters.invitationAccept(),
      await clientKey("invite"),
    );
  } catch {
    return { ok: false, error: "Too many attempts. Please wait and try again." };
  }

  try {
    await acceptInvitation({
      token: parsed.data.token,
      name: parsed.data.name,
      password: parsed.data.password,
      timezone: parsed.data.timezone,
    });
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof AppError
          ? e.publicMessage
          : "We couldn't complete your account setup.",
    };
  }

  // Sign the new user in and send them to the right place.
  try {
    await signIn("credentials", {
      email: (formData.get("email") as string) ?? "",
      password: parsed.data.password,
      redirectTo: "/",
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: true, message: "Account created. Please sign in." };
    }
    throw error;
  }
}

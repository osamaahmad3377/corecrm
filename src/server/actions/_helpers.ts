import "server-only";
import { revalidatePath } from "next/cache";
import { AppError, toAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { requestMeta } from "@/server/auth/context";

export interface ActionState<T = unknown> {
  ok: boolean;
  data?: T;
  message?: string;
  error?: string;
  code?: string;
  fieldErrors?: Record<string, string[]>;
}

export async function runAction<T>(
  fn: () => Promise<{ data?: T; message?: string; revalidate?: string[] }>,
): Promise<ActionState<T>> {
  try {
    const res = await fn();
    res.revalidate?.forEach((p) => revalidatePath(p));
    return { ok: true, data: res.data, message: res.message };
  } catch (e) {
    const err = e instanceof AppError ? e : toAppError(e);
    if (err.code === "INTERNAL") {
      logger.error("action.failed", { error: e });
    }
    return {
      ok: false,
      error: err.publicMessage,
      code: err.code,
      fieldErrors:
        err.code === "VALIDATION" &&
        err.details &&
        typeof err.details === "object" &&
        "fieldErrors" in (err.details as Record<string, unknown>)
          ? ((err.details as { fieldErrors: Record<string, string[]> })
              .fieldErrors)
          : undefined,
    };
  }
}

export { requestMeta };

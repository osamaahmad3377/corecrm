import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, toAppError } from "./errors";
import { logger } from "./logger";

/** Consistent success/error envelopes for route handlers. */

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(error: AppError) {
  return NextResponse.json(
    {
      error: {
        code: error.code,
        message: error.publicMessage,
        ...(error.details ? { details: error.details } : {}),
      },
    },
    { status: error.status },
  );
}

/** Wrap a route handler body; translates thrown errors into safe responses. */
export async function handle(
  fn: () => Promise<Response>,
): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ZodError) {
      return fail(
        new AppError("VALIDATION", "Some fields were invalid.", {
          details: e.flatten(),
        }),
      );
    }
    const appErr = toAppError(e);
    if (appErr.code === "INTERNAL") {
      logger.error("api.unhandled", { error: e });
    }
    return fail(appErr);
  }
}

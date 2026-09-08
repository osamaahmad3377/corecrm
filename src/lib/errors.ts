/**
 * Application error taxonomy. Route handlers and server actions translate these
 * into friendly, non-leaking responses; the underlying `cause` is logged
 * server-side only.
 */

export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "INTERNAL";

const STATUS: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PROVIDER_ERROR: 502,
  INTERNAL: 500,
};

const FRIENDLY: Record<AppErrorCode, string> = {
  UNAUTHENTICATED: "Please sign in to continue.",
  FORBIDDEN: "You do not have access to this resource.",
  NOT_FOUND: "We couldn't find what you were looking for.",
  VALIDATION: "Some of the information provided was invalid.",
  CONFLICT: "That action conflicts with the current state.",
  RATE_LIMITED: "Too many requests. Please slow down and try again shortly.",
  PROVIDER_ERROR: "An external service failed to respond. Please try again.",
  INTERNAL: "Something went wrong on our side. Please try again.",
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(
    code: AppErrorCode,
    message?: string,
    opts?: { details?: unknown; cause?: unknown; expose?: boolean },
  ) {
    super(message ?? FRIENDLY[code]);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = opts?.details;
    this.cause = opts?.cause;
    // Validation / not-found / forbidden messages are safe to show; internal
    // ones are replaced with the generic friendly text.
    this.expose = opts?.expose ?? code !== "INTERNAL";
  }

  get publicMessage() {
    return this.expose ? this.message : FRIENDLY[this.code];
  }
}

export const unauthorized = (m?: string) => new AppError("UNAUTHENTICATED", m);
export const forbidden = (m?: string) => new AppError("FORBIDDEN", m);
export const notFound = (m?: string) => new AppError("NOT_FOUND", m);
export const conflict = (m?: string) => new AppError("CONFLICT", m);
export const validationError = (m?: string, details?: unknown) =>
  new AppError("VALIDATION", m, { details });

export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  return new AppError("INTERNAL", undefined, { cause: e });
}

import bcrypt from "bcryptjs";

const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!hash) {
    // Still run a hash to keep timing roughly constant for unknown users.
    await bcrypt.hash(plain, ROUNDS);
    return false;
  }
  return bcrypt.compare(plain, hash);
}

/** Basic strength check used at password-set time (invitation / reset). */
export function passwordIssues(pw: string): string[] {
  const issues: string[] = [];
  if (pw.length < 10) issues.push("Use at least 10 characters.");
  if (!/[a-z]/.test(pw)) issues.push("Include a lowercase letter.");
  if (!/[A-Z]/.test(pw)) issues.push("Include an uppercase letter.");
  if (!/[0-9]/.test(pw)) issues.push("Include a number.");
  return issues;
}

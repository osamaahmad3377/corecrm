import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  timingSafeEqual,
} from "crypto";
import { env } from "./env";

/**
 * AES-256-GCM authenticated encryption for data at rest (OAuth tokens).
 * Payload format (base64):  [ 12-byte IV | 16-byte auth tag | ciphertext ]
 */

function key(): Buffer {
  const raw = Buffer.from(env.ENCRYPTION_KEY, "base64");
  if (raw.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY must decode to exactly 32 bytes (base64). Generate one with: openssl rand -base64 32",
    );
  }
  return raw;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
    "utf8",
  );
}

/** SHA-256 hex digest — used for opaque token lookup (invitations, resets). */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** URL-safe random token for invitations / password resets. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

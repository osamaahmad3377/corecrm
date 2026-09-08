import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";

// Provide a valid key before importing the crypto module (it reads env on load).
beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("crypto", () => {
  it("round-trips AES-256-GCM", async () => {
    const { encrypt, decrypt } = await import("@/lib/crypto");
    const secret = "refresh-token-value-" + Math.random();
    const enc = encrypt(secret);
    expect(enc).not.toContain(secret);
    expect(decrypt(enc)).toBe(secret);
  });

  it("tampered ciphertext fails to decrypt", async () => {
    const { encrypt, decrypt } = await import("@/lib/crypto");
    const enc = encrypt("hello");
    const buf = Buffer.from(enc, "base64");
    buf[buf.length - 1] ^= 0xff;
    expect(() => decrypt(buf.toString("base64"))).toThrow();
  });

  it("sha256 is stable", async () => {
    const { sha256 } = await import("@/lib/crypto");
    expect(sha256("abc")).toBe(sha256("abc"));
    expect(sha256("abc")).not.toBe(sha256("abd"));
  });
});

describe("SLA view", () => {
  it("marks response breached when past due with no first response", async () => {
    const { buildSlaView } = await import("@/server/services/sla");
    const now = new Date("2026-01-01T12:00:00Z");
    const view = buildSlaView(
      {
        slaPolicyId: "p",
        responseDueAt: new Date("2026-01-01T11:00:00Z"),
        resolutionDueAt: new Date("2026-01-02T11:00:00Z"),
        firstResponseAt: null,
        resolvedAt: null,
        responseBreached: false,
        resolutionBreached: false,
      },
      "Standard",
      now,
    );
    expect(view.responseBreached).toBe(true);
    expect(view.resolutionBreached).toBe(false);
    expect(view.responseMet).toBe(false);
  });

  it("marks response met when answered before due", async () => {
    const { buildSlaView } = await import("@/server/services/sla");
    const view = buildSlaView(
      {
        slaPolicyId: "p",
        responseDueAt: new Date("2026-01-01T11:00:00Z"),
        resolutionDueAt: new Date("2026-01-02T11:00:00Z"),
        firstResponseAt: new Date("2026-01-01T10:30:00Z"),
        resolvedAt: null,
        responseBreached: false,
        resolutionBreached: false,
      },
      "Standard",
      new Date("2026-01-01T12:00:00Z"),
    );
    expect(view.responseMet).toBe(true);
    expect(view.responseBreached).toBe(false);
  });
});

describe("sanitize", () => {
  it("strips scripts and event handlers from messages", async () => {
    const { sanitizeMessageHtml } = await import("@/lib/sanitize");
    const out = sanitizeMessageHtml(
      '<p onclick="evil()">hi<script>alert(1)</script></p><img src=x>',
    );
    expect(out).not.toContain("script");
    expect(out).not.toContain("onclick");
    expect(out).toContain("hi");
  });

  it("forces safe attributes on links", async () => {
    const { sanitizeMessageHtml } = await import("@/lib/sanitize");
    const out = sanitizeMessageHtml('<a href="https://x.test">x</a>');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).toContain('target="_blank"');
  });
});

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { htmlToText, snippet } from "@/lib/sanitize";
import type {
  EmailProvider,
  NormalizedAddress,
  NormalizedMessage,
  OutboundMessage,
  ProviderCtx,
  ProviderTokens,
  Subscription,
  SyncOptions,
  SyncResult,
} from "./types";

const OAUTH = "https://oauth2.googleapis.com";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
];

function assertConfigured() {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new AppError(
      "PROVIDER_ERROR",
      "Google Workspace integration is not configured on this server.",
    );
  }
}

async function gmailFetch(
  ctx: ProviderCtx,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  let token = ctx.tokens.accessToken;
  if (ctx.tokens.expiresAt.getTime() < Date.now() + 60_000) {
    const refreshed = await gmailProvider.refreshToken(ctx.tokens.refreshToken);
    await ctx.onTokensRefreshed(refreshed);
    ctx.tokens = refreshed;
    token = refreshed.accessToken;
  }
  return fetch(`${GMAIL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

function parseAddress(raw?: string): NormalizedAddress {
  if (!raw) return { address: "" };
  const m = raw.match(/^\s*"?([^"<]*)"?\s*<?([^>]*)>?\s*$/);
  return {
    name: m?.[1]?.trim() || undefined,
    address: (m?.[2] || raw).trim().toLowerCase(),
  };
}

function header(
  headers: { name: string; value: string }[],
  name: string,
): string | undefined {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
}

interface MimePart {
  mimeType?: string;
  filename?: string;
  body?: { data?: string };
  parts?: MimePart[];
}

function decodeBody(part: MimePart): { html?: string; text?: string } {
  const out: { html?: string; text?: string } = {};
  const walk = (p: MimePart) => {
    if (p.body?.data) {
      const decoded = Buffer.from(
        p.body.data.replace(/-/g, "+").replace(/_/g, "/"),
        "base64",
      ).toString("utf8");
      if (p.mimeType === "text/html") out.html = decoded;
      else if (p.mimeType === "text/plain") out.text = decoded;
    }
    p.parts?.forEach((c) => walk(c));
  };
  walk(part);
  return out;
}

interface GmailFullMessage {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: MimePart & { headers?: { name: string; value: string }[] };
}

function normalize(m: GmailFullMessage, self?: string): NormalizedMessage {
  const headers = m.payload?.headers ?? [];
  const from = parseAddress(header(headers, "From"));
  const body = m.payload ? decodeBody(m.payload) : {};
  const refs = header(headers, "References")
    ?.split(/\s+/)
    .filter(Boolean);
  const direction =
    self && from.address === self.toLowerCase() ? "OUTBOUND" : "INBOUND";
  return {
    providerMessageId: m.id,
    providerThreadId: m.threadId,
    internetMessageId: header(headers, "Message-ID"),
    inReplyTo: header(headers, "In-Reply-To"),
    references: refs,
    direction,
    from,
    to: (header(headers, "To") ?? "")
      .split(",")
      .map((s) => parseAddress(s))
      .filter((a) => a.address),
    cc: (header(headers, "Cc") ?? "")
      .split(",")
      .map((s) => parseAddress(s))
      .filter((a) => a.address),
    subject: header(headers, "Subject"),
    bodyHtml: body.html,
    bodyText: body.text ?? (body.html ? htmlToText(body.html) : m.snippet),
    snippet: snippet(m.snippet ?? body.text ?? ""),
    receivedAt: m.internalDate ? new Date(Number(m.internalDate)) : undefined,
    sentAt:
      direction === "OUTBOUND" && m.internalDate
        ? new Date(Number(m.internalDate))
        : undefined,
    hasAttachments: Boolean(
      (m.payload?.parts as { filename?: string }[] | undefined)?.some(
        (p) => p.filename,
      ),
    ),
  };
}

export const gmailProvider: EmailProvider = {
  kind: "GOOGLE",

  getAuthorizationUrl(state, redirectUri) {
    assertConfigured();
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    assertConfigured();
    const res = await fetch(`${OAUTH}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok)
      throw new AppError("PROVIDER_ERROR", "Google sign-in failed", {
        cause: await res.text(),
      });
    const data = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scope: data.scope,
    } satisfies ProviderTokens;
  },

  async refreshToken(refreshToken) {
    assertConfigured();
    const res = await fetch(`${OAUTH}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok)
      throw new AppError("PROVIDER_ERROR", "Google token refresh failed", {
        cause: await res.text(),
      });
    const data = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scope: data.scope,
    };
  },

  async revoke(tokens) {
    await fetch(
      `https://oauth2.googleapis.com/revoke?token=${tokens.refreshToken}`,
      { method: "POST" },
    ).catch(() => undefined);
  },

  async getAccountInfo(ctx) {
    const res = await gmailFetch(ctx, "/profile");
    if (!res.ok)
      throw new AppError("PROVIDER_ERROR", "Couldn't read Google account");
    const data = await res.json();
    return {
      address: (data.emailAddress ?? "").toLowerCase(),
      externalId: data.emailAddress,
    };
  },

  async syncMessages(ctx, opts: SyncOptions): Promise<SyncResult> {
    const limit = opts.limit ?? 25;
    // Cursor is a Gmail historyId; on first run we page recent messages.
    const listRes = await gmailFetch(
      ctx,
      `/messages?maxResults=${limit}&q=in:anywhere newer_than:30d`,
    );
    if (!listRes.ok)
      throw new AppError("PROVIDER_ERROR", "Gmail sync failed", {
        cause: await listRes.text(),
      });
    const list = await listRes.json();
    const ids: string[] = (list.messages ?? []).map(
      (m: { id: string }) => m.id,
    );
    const self = (await this.getAccountInfo(ctx)).address;
    const messages: NormalizedMessage[] = [];
    for (const id of ids) {
      const r = await gmailFetch(ctx, `/messages/${id}?format=full`);
      if (r.ok) messages.push(normalize(await r.json(), self));
    }
    return { messages, nextCursor: list.historyId ?? null };
  },

  async getMessage(ctx, id) {
    const res = await gmailFetch(ctx, `/messages/${id}?format=full`);
    if (!res.ok) throw new AppError("PROVIDER_ERROR", "Message not found");
    return normalize(await res.json());
  },

  async getThread(ctx, threadId) {
    const res = await gmailFetch(ctx, `/threads/${threadId}?format=full`);
    if (!res.ok) throw new AppError("PROVIDER_ERROR", "Thread not found");
    const data = await res.json();
    const self = (await this.getAccountInfo(ctx)).address;
    return (data.messages ?? []).map((m: GmailFullMessage) =>
      normalize(m, self),
    );
  },

  async sendMessage(ctx, msg: OutboundMessage) {
    const self = (await this.getAccountInfo(ctx)).address;
    const lines = [
      `From: ${self}`,
      `To: ${msg.to.join(", ")}`,
      msg.cc?.length ? `Cc: ${msg.cc.join(", ")}` : "",
      `Subject: ${msg.subject}`,
      "MIME-Version: 1.0",
      'Content-Type: text/html; charset="UTF-8"',
      "",
      msg.bodyHtml,
    ].filter(Boolean);
    const raw = Buffer.from(lines.join("\r\n"))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const res = await gmailFetch(ctx, "/messages/send", {
      method: "POST",
      body: JSON.stringify({ raw }),
    });
    if (!res.ok)
      throw new AppError("PROVIDER_ERROR", "Send failed", {
        cause: await res.text(),
      });
    const data = await res.json();
    return {
      providerMessageId: data.id,
      providerThreadId: data.threadId ?? "",
      direction: "OUTBOUND",
      from: { address: self },
      to: msg.to.map((address) => ({ address })),
      subject: msg.subject,
      bodyHtml: msg.bodyHtml,
      hasAttachments: false,
      sentAt: new Date(),
    };
  },

  async createSubscription(ctx): Promise<Subscription> {
    if (!env.GOOGLE_PUBSUB_TOPIC) {
      throw new AppError(
        "PROVIDER_ERROR",
        "GOOGLE_PUBSUB_TOPIC is not configured; using scheduled sync instead.",
      );
    }
    const res = await gmailFetch(ctx, "/watch", {
      method: "POST",
      body: JSON.stringify({
        topicName: env.GOOGLE_PUBSUB_TOPIC,
        labelIds: ["INBOX"],
      }),
    });
    if (!res.ok)
      throw new AppError("PROVIDER_ERROR", "Gmail watch failed", {
        cause: await res.text(),
      });
    const data = await res.json();
    return {
      subscriptionId: String(data.historyId),
      expiresAt: new Date(Number(data.expiration)),
    };
  },

  async renewSubscription(ctx) {
    return this.createSubscription(ctx, "", "");
  },

  async deleteSubscription(ctx) {
    await gmailFetch(ctx, "/stop", { method: "POST" }).catch(() => undefined);
  },
};

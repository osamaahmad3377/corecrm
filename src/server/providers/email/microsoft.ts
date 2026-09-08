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

const AUTH = "https://login.microsoftonline.com";
const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPES = [
  "offline_access",
  "openid",
  "email",
  "profile",
  "https://graph.microsoft.com/Mail.ReadWrite",
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/User.Read",
];

function tenant() {
  return env.MICROSOFT_TENANT_ID || "common";
}

function assertConfigured() {
  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
    throw new AppError(
      "PROVIDER_ERROR",
      "Microsoft 365 integration is not configured on this server.",
    );
  }
}

async function graphFetch(
  ctx: ProviderCtx,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  let token = ctx.tokens.accessToken;
  if (ctx.tokens.expiresAt.getTime() < Date.now() + 60_000) {
    const refreshed = await microsoftProvider.refreshToken(
      ctx.tokens.refreshToken,
    );
    await ctx.onTokensRefreshed(refreshed);
    ctx.tokens = refreshed;
    token = refreshed.accessToken;
  }
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  return res;
}

function mapAddress(a?: {
  emailAddress?: { name?: string; address?: string };
}): NormalizedAddress {
  return {
    name: a?.emailAddress?.name,
    address: a?.emailAddress?.address ?? "",
  };
}

interface GraphMessage {
  id: string;
  conversationId: string;
  internetMessageId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType: string; content: string };
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: { emailAddress?: { name?: string; address?: string } }[];
  ccRecipients?: { emailAddress?: { name?: string; address?: string } }[];
  receivedDateTime?: string;
  sentDateTime?: string;
  hasAttachments?: boolean;
  isDraft?: boolean;
  internetMessageHeaders?: { name: string; value: string }[];
}

function normalize(m: GraphMessage, selfAddress?: string): NormalizedMessage {
  const from = mapAddress(m.from);
  const html = m.body?.contentType === "html" ? m.body.content : undefined;
  const text =
    m.body?.contentType === "text" ? m.body.content : html ? htmlToText(html) : m.bodyPreview;
  const headers = m.internetMessageHeaders ?? [];
  const inReplyTo = headers.find(
    (h) => h.name.toLowerCase() === "in-reply-to",
  )?.value;
  const references = headers
    .find((h) => h.name.toLowerCase() === "references")
    ?.value?.split(/\s+/)
    .filter(Boolean);

  const direction =
    selfAddress && from.address.toLowerCase() === selfAddress.toLowerCase()
      ? "OUTBOUND"
      : "INBOUND";

  return {
    providerMessageId: m.id,
    providerThreadId: m.conversationId,
    internetMessageId: m.internetMessageId,
    inReplyTo,
    references,
    direction,
    from,
    to: (m.toRecipients ?? []).map(mapAddress),
    cc: (m.ccRecipients ?? []).map(mapAddress),
    subject: m.subject,
    bodyHtml: html,
    bodyText: text,
    snippet: snippet(m.bodyPreview ?? text ?? ""),
    receivedAt: m.receivedDateTime ? new Date(m.receivedDateTime) : undefined,
    sentAt: m.sentDateTime ? new Date(m.sentDateTime) : undefined,
    hasAttachments: Boolean(m.hasAttachments),
  };
}

export const microsoftProvider: EmailProvider = {
  kind: "MICROSOFT",

  getAuthorizationUrl(state, redirectUri) {
    assertConfigured();
    const params = new URLSearchParams({
      client_id: env.MICROSOFT_CLIENT_ID,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: SCOPES.join(" "),
      state,
      prompt: "select_account",
    });
    return `${AUTH}/${tenant()}/oauth2/v2.0/authorize?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    assertConfigured();
    const res = await fetch(`${AUTH}/${tenant()}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.MICROSOFT_CLIENT_ID,
        client_secret: env.MICROSOFT_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope: SCOPES.join(" "),
      }),
    });
    if (!res.ok) {
      throw new AppError("PROVIDER_ERROR", "Microsoft sign-in failed", {
        cause: await res.text(),
      });
    }
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
    const res = await fetch(`${AUTH}/${tenant()}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.MICROSOFT_CLIENT_ID,
        client_secret: env.MICROSOFT_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        scope: SCOPES.join(" "),
      }),
    });
    if (!res.ok) {
      throw new AppError("PROVIDER_ERROR", "Microsoft token refresh failed", {
        cause: await res.text(),
      });
    }
    const data = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scope: data.scope,
    };
  },

  async revoke() {
    // Microsoft has no standard revoke endpoint for delegated tokens; dropping
    // the stored refresh token effectively disconnects the account.
  },

  async getAccountInfo(ctx) {
    const res = await graphFetch(ctx, "/me?$select=mail,userPrincipalName,displayName,id");
    if (!res.ok)
      throw new AppError("PROVIDER_ERROR", "Couldn't read Microsoft account");
    const data = await res.json();
    return {
      address: (data.mail ?? data.userPrincipalName ?? "").toLowerCase(),
      externalId: data.id,
      displayName: data.displayName,
    };
  },

  async syncMessages(ctx, opts: SyncOptions) {
    const limit = opts.limit ?? 25;
    const path =
      opts.cursor ??
      `/me/messages/delta?$select=id,conversationId,internetMessageId,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,hasAttachments,isDraft&$top=${limit}`;
    const url = opts.cursor ? opts.cursor.replace(GRAPH, "") : path;
    const res = await graphFetch(ctx, url);
    if (!res.ok)
      throw new AppError("PROVIDER_ERROR", "Microsoft mailbox sync failed", {
        cause: await res.text(),
      });
    const data = await res.json();
    const self = (await this.getAccountInfo(ctx)).address;
    const messages: NormalizedMessage[] = (data.value ?? [])
      .filter((m: GraphMessage) => !m.isDraft)
      .map((m: GraphMessage) => normalize(m, self));
    const nextCursor: string | null =
      data["@odata.nextLink"] ?? data["@odata.deltaLink"] ?? null;
    return { messages, nextCursor };
  },

  async getMessage(ctx, id) {
    const res = await graphFetch(
      ctx,
      `/me/messages/${id}?$select=id,conversationId,internetMessageId,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,hasAttachments&$expand=internetMessageHeaders`,
    );
    if (!res.ok) throw new AppError("PROVIDER_ERROR", "Message not found");
    return normalize(await res.json());
  },

  async getThread(ctx, conversationId) {
    const res = await graphFetch(
      ctx,
      `/me/messages?$filter=conversationId eq '${conversationId}'&$orderby=receivedDateTime asc&$select=id,conversationId,internetMessageId,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,hasAttachments`,
    );
    if (!res.ok) throw new AppError("PROVIDER_ERROR", "Thread not found");
    const data = await res.json();
    const self = (await this.getAccountInfo(ctx)).address;
    return (data.value ?? []).map((m: GraphMessage) => normalize(m, self));
  },

  async sendMessage(ctx, msg: OutboundMessage) {
    if (msg.inReplyToProviderMessageId) {
      const res = await graphFetch(
        ctx,
        `/me/messages/${msg.inReplyToProviderMessageId}/reply`,
        {
          method: "POST",
          body: JSON.stringify({
            message: {
              body: { contentType: "HTML", content: msg.bodyHtml },
              toRecipients: msg.to.map((address) => ({
                emailAddress: { address },
              })),
              ccRecipients: (msg.cc ?? []).map((address) => ({
                emailAddress: { address },
              })),
            },
          }),
        },
      );
      if (!res.ok)
        throw new AppError("PROVIDER_ERROR", "Reply failed", {
          cause: await res.text(),
        });
      return {
        providerMessageId: `reply-${msg.inReplyToProviderMessageId}`,
        providerThreadId: "",
        direction: "OUTBOUND",
        from: { address: "" },
        to: msg.to.map((address) => ({ address })),
        subject: msg.subject,
        bodyHtml: msg.bodyHtml,
        hasAttachments: false,
        sentAt: new Date(),
      };
    }

    const res = await graphFetch(ctx, "/me/sendMail", {
      method: "POST",
      body: JSON.stringify({
        message: {
          subject: msg.subject,
          body: { contentType: "HTML", content: msg.bodyHtml },
          toRecipients: msg.to.map((address) => ({ emailAddress: { address } })),
          ccRecipients: (msg.cc ?? []).map((address) => ({
            emailAddress: { address },
          })),
        },
        saveToSentItems: true,
      }),
    });
    if (!res.ok)
      throw new AppError("PROVIDER_ERROR", "Send failed", {
        cause: await res.text(),
      });
    return {
      providerMessageId: `sent-${Date.now()}`,
      providerThreadId: "",
      direction: "OUTBOUND",
      from: { address: "" },
      to: msg.to.map((address) => ({ address })),
      subject: msg.subject,
      bodyHtml: msg.bodyHtml,
      hasAttachments: false,
      sentAt: new Date(),
    };
  },

  async createSubscription(ctx, notifyUrl, clientState): Promise<Subscription> {
    const res = await graphFetch(ctx, "/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        changeType: "created",
        notificationUrl: notifyUrl,
        resource: "/me/mailFolders('inbox')/messages",
        expirationDateTime: new Date(Date.now() + 3600_000 * 24).toISOString(),
        clientState,
      }),
    });
    if (!res.ok)
      throw new AppError("PROVIDER_ERROR", "Couldn't subscribe to mailbox", {
        cause: await res.text(),
      });
    const data = await res.json();
    return {
      subscriptionId: data.id,
      expiresAt: new Date(data.expirationDateTime),
    };
  },

  async renewSubscription(ctx, subscriptionId): Promise<Subscription> {
    const res = await graphFetch(ctx, `/subscriptions/${subscriptionId}`, {
      method: "PATCH",
      body: JSON.stringify({
        expirationDateTime: new Date(Date.now() + 3600_000 * 24).toISOString(),
      }),
    });
    if (!res.ok) throw new AppError("PROVIDER_ERROR", "Subscription renewal failed");
    const data = await res.json();
    return {
      subscriptionId: data.id,
      expiresAt: new Date(data.expirationDateTime),
    };
  },

  async deleteSubscription(ctx, subscriptionId) {
    await graphFetch(ctx, `/subscriptions/${subscriptionId}`, {
      method: "DELETE",
    });
  },
};

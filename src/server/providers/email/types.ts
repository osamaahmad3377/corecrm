export type EmailProviderKind = "MICROSOFT" | "GOOGLE";

export interface ProviderTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope?: string;
}

export interface ProviderCtx {
  tokens: ProviderTokens;
  /** Persist rotated tokens. Providers call this after a refresh. */
  onTokensRefreshed: (t: ProviderTokens) => Promise<void>;
}

export interface NormalizedAddress {
  name?: string;
  address: string;
}

export interface NormalizedMessage {
  providerMessageId: string;
  providerThreadId: string;
  internetMessageId?: string;
  inReplyTo?: string;
  references?: string[];
  direction: "INBOUND" | "OUTBOUND";
  from: NormalizedAddress;
  to: NormalizedAddress[];
  cc?: NormalizedAddress[];
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  snippet?: string;
  receivedAt?: Date;
  sentAt?: Date;
  hasAttachments: boolean;
}

export interface OutboundMessage {
  to: string[];
  cc?: string[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  /** Provider message id to reply to (keeps threading). */
  inReplyToProviderMessageId?: string;
}

export interface SyncOptions {
  /** Provider delta cursor from the previous sync. */
  cursor?: string | null;
  /** Hard cap on messages fetched in one pass (serverless-safe). */
  limit?: number;
}

export interface SyncResult {
  messages: NormalizedMessage[];
  nextCursor: string | null;
}

export interface Subscription {
  subscriptionId: string;
  expiresAt: Date;
}

export interface WebhookEvent {
  subscriptionId: string;
  resource: string; // provider-specific pointer to changed message(s)
}

/**
 * Provider-agnostic email integration. New providers (IMAP, Zoho, Exchange…)
 * implement this interface and register in the factory — nothing else changes.
 */
export interface EmailProvider {
  readonly kind: EmailProviderKind;

  getAuthorizationUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<ProviderTokens>;
  refreshToken(refreshToken: string): Promise<ProviderTokens>;
  revoke(tokens: ProviderTokens): Promise<void>;

  getAccountInfo(
    ctx: ProviderCtx,
  ): Promise<{ address: string; externalId: string; displayName?: string }>;

  syncMessages(ctx: ProviderCtx, opts: SyncOptions): Promise<SyncResult>;
  getMessage(ctx: ProviderCtx, providerMessageId: string): Promise<NormalizedMessage>;
  getThread(ctx: ProviderCtx, providerThreadId: string): Promise<NormalizedMessage[]>;
  sendMessage(ctx: ProviderCtx, msg: OutboundMessage): Promise<NormalizedMessage>;

  createSubscription(
    ctx: ProviderCtx,
    notifyUrl: string,
    clientState: string,
  ): Promise<Subscription>;
  renewSubscription(ctx: ProviderCtx, subscriptionId: string): Promise<Subscription>;
  deleteSubscription(ctx: ProviderCtx, subscriptionId: string): Promise<void>;
}

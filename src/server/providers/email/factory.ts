import type { EmailProvider, EmailProviderKind } from "./types";
import { microsoftProvider } from "./microsoft";
import { gmailProvider } from "./gmail";

const REGISTRY: Record<EmailProviderKind, EmailProvider> = {
  MICROSOFT: microsoftProvider,
  GOOGLE: gmailProvider,
};

export function getEmailProvider(kind: EmailProviderKind): EmailProvider {
  return REGISTRY[kind];
}

export const SUPPORTED_PROVIDERS = Object.keys(REGISTRY) as EmailProviderKind[];

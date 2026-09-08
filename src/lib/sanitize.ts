import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitise user- or email-provided HTML before it is stored or rendered.
 * Ticket messages accept a small formatting subset; email bodies keep more
 * structure but are still stripped of scripts, event handlers and styles and
 * are additionally rendered inside a sandboxed iframe on the client.
 */

const MESSAGE_CONFIG = {
  ALLOWED_TAGS: [
    "p", "br", "b", "strong", "i", "em", "u", "s", "a", "ul", "ol", "li",
    "blockquote", "pre", "code", "span", "h1", "h2", "h3", "h4",
  ],
  ALLOWED_ATTR: ["href", "target", "rel"],
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: ["target"],
};

const EMAIL_CONFIG = {
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "link", "meta"],
  FORBID_ATTR: ["style", "srcset"],
  ALLOW_DATA_ATTR: false,
};

export function sanitizeMessageHtml(dirty: string): string {
  const clean = DOMPurify.sanitize(dirty, MESSAGE_CONFIG) as unknown as string;
  // Force safe link behaviour.
  return clean.replace(
    /<a /g,
    '<a target="_blank" rel="noopener noreferrer nofollow" ',
  );
}

export function sanitizeEmailHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, EMAIL_CONFIG) as unknown as string;
}

/** Plain-text → minimal safe HTML (newlines become <br>). */
export function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<p>${escaped.replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function snippet(text: string, length = 140): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > length ? `${clean.slice(0, length)}…` : clean;
}

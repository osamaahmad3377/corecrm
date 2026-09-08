import sanitizeHtml from "sanitize-html";

/**
 * Sanitise user- or email-provided HTML before it is stored or rendered.
 * Ticket messages accept a small formatting subset; email bodies keep more
 * structure but are still stripped of scripts, styles and handlers and are
 * additionally rendered inside a sandboxed iframe on the client.
 *
 * Uses `sanitize-html` (htmlparser2 based — no jsdom), so it runs cleanly in
 * serverless/edge bundling.
 */

const MESSAGE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "b", "strong", "i", "em", "u", "s", "a", "ul", "ol", "li",
    "blockquote", "pre", "code", "span", "h1", "h2", "h3", "h4",
  ],
  allowedAttributes: { a: ["href", "target", "rel"] },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      target: "_blank",
      rel: "noopener noreferrer nofollow",
    }),
  },
};

const EMAIL_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.filter(
    (t) => !["script", "style", "iframe", "object", "embed", "form"].includes(t),
  ),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    "*": ["align", "color", "width", "height", "colspan", "rowspan"],
  },
  allowedSchemes: ["http", "https", "mailto", "cid", "data"],
  disallowedTagsMode: "discard",
};

export function sanitizeMessageHtml(dirty: string): string {
  return sanitizeHtml(dirty, MESSAGE_OPTIONS);
}

export function sanitizeEmailHtml(dirty: string): string {
  return sanitizeHtml(dirty, EMAIL_OPTIONS);
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
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function snippet(text: string, length = 140): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > length ? `${clean.slice(0, length)}…` : clean;
}

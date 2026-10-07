import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = ["strong", "em", "u", "br", "p", "div", "ul", "ol", "li", "b", "i"];
const RENAME: Record<string, string> = { b: "strong", i: "em" };

/**
 * Keeps a small set of formatting tags and drops every attribute. DOMPurify
 * parses the markup (no regex tag-stripping), so `<` inside quoted attribute
 * values and nested/case-variant payloads cannot smuggle tags through.
 * `b`/`i` are allowed through the parser and renamed afterwards, when the
 * output is attribute-free and safe to rewrite with a simple pattern.
 */
export function sanitizeCourseHtml(input: string): string {
  const html = DOMPurify.sanitize(input.replace(/\u0000/g, ""), {
    ALLOWED_TAGS,
    ALLOWED_ATTR: [],
  }).replace(/<\s*(\/?)\s*(b|i)\s*>/gi, (_match, slash: string, raw: string) => {
    const name = RENAME[raw.toLowerCase()] ?? raw.toLowerCase();
    return slash ? `</${name}>` : `<${name}>`;
  });
  const text = html.replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").replace(/\s+/g, "");
  if (!text) {
    return "";
  }
  return html.trim();
}

export function courseSummaryText(input: string): string {
  return sanitizeCourseHtml(input)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|ul|ol)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

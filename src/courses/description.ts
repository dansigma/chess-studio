import { FilterXSS } from "xss";

const ALLOWED_TAGS = ["strong", "em", "u", "br", "p", "div", "ul", "ol", "li", "b", "i"];
const RENAME: Record<string, string> = { b: "strong", i: "em" };

/**
 * Whitelist-based sanitizer with no DOM dependency: it runs identically in the
 * browser, in Node (tests/build) and inside the Cloudflare Worker (workerd).
 * DOM-based sanitizers are not an option on workerd — jsdom-backed wrappers
 * try to read files from disk and crash (error 1101), and linkedom lacks
 * `document.implementation.createHTMLDocument`, which makes DOMPurify
 * silently skip sanitization entirely.
 */
const filter = new FilterXSS({
  whiteList: Object.fromEntries(ALLOWED_TAGS.map((tag) => [tag, []])),
  stripIgnoreTag: true, // unknown tags: drop the tag, keep the text
  stripIgnoreTagBody: ["script", "style", "svg"], // and drop these subtrees whole
});

/**
 * Keeps a small set of formatting tags and drops every attribute. A real HTML
 * parser (FilterXSS) does the work — no regex tag-stripping — so `<` inside
 * quoted attribute values and nested/case-variant payloads cannot smuggle
 * tags through. `b`/`i` are allowed through the parser and renamed
 * afterwards, when the output is attribute-free and safe to rewrite with a
 * simple pattern.
 */
export function sanitizeCourseHtml(input: string): string {
  const html = filter
    .process(input.replace(/\u0000/g, ""))
    .replace(/<\s*(\/?)\s*(b|i)\s*>/gi, (_match, slash: string, raw: string) => {
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

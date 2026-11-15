import { Chess } from "chess.js";
import xss, { FilterXSS } from "xss";

// The CommonJS build assigns `parseAttr` in a loop, so Node ESM cannot see it as a named export; read it off the default export.
const parseAttr = (xss as unknown as { parseAttr: (html: string, onAttr: (name: string, value: string) => string) => string }).parseAttr;

const ALLOWED_TAGS = ["strong", "em", "u", "br", "p", "div", "ul", "ol", "li", "b", "i", "h2", "h3"];
const RENAME: Record<string, string> = { b: "strong", i: "em" };

/** SIG-1368 limits. */
export const MAX_DIAGRAM_CAPTION = 200;
const MAX_FEN_LENGTH = 100;
const MAX_HREF_LENGTH = 2000;

export type DiagramOrientation = "white" | "black";
export type DescriptionBlock =
  | { type: "html"; html: string }
  | { type: "diagram"; fen: string; orientation: DiagramOrientation; caption: string };

function encodeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Decodes exactly the five entities `encodeText` produces, once. */
function decodeText(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Attributes of a raw tag (the first occurrence of a name wins, as in browsers), parsed by xss. */
function readAttrs(rawTag: string): Map<string, string> {
  const attrs = new Map<string, string>();
  const space = rawTag.search(/\s/);
  if (space === -1) {
    return attrs;
  }
  const source = rawTag.slice(space + 1, -1).replace(/\/\s*$/, "");
  parseAttr(source, (name, value) => {
    if (!attrs.has(name)) {
      attrs.set(name, value);
    }
    return "";
  });
  return attrs;
}

/** True when `fen` is a legal position (chess.js validates it). */
export function isValidDiagramFen(fen: string): boolean {
  if (!fen || fen.length > MAX_FEN_LENGTH || !/^[0-9A-Za-z/ -]+$/.test(fen)) {
    return false;
  }
  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}

/** Only absolute https links: no whitespace, control characters, quotes, brackets or backslashes. */
export function safeLinkHref(value: string | undefined): string | null {
  const href = value?.trim() ?? "";
  if (!href || href.length > MAX_HREF_LENGTH || /[\u0000- \u007f-\u009f"'<>\\`]/.test(href)) {
    return null;
  }
  try {
    const url = new URL(href);
    return url.protocol === "https:" && url.hostname ? href : null;
  } catch {
    return null;
  }
}

// Private-use markers (stripped from the input first) so the final pass can pair
// each closing tag with its opening tag.
const BARE_ANCHOR_OPEN = "\uE000";
const ANCHOR_CLOSE = "\uE001";

/** Drops bare anchors with their closing tags and keeps valid links balanced; stray closers vanish. */
function resolveAnchors(html: string): string {
  const open: boolean[] = []; // true = a real link
  return html.replace(/<a href="|\uE000|\uE001/g, (token) => {
    if (token === ANCHOR_CLOSE) {
      return open.pop() ? "</a>" : "";
    }
    open.push(token !== BARE_ANCHOR_OPEN);
    return token === BARE_ANCHOR_OPEN ? "" : token;
  });
}

/**
 * Rebuilds `<a>` and `<figure>` from scratch out of validated values, so no
 * author-supplied attribute is ever copied through. An unacceptable `<a>`
 * becomes a bare `<a>` that the final pass removes together with its closing
 * tag; an unacceptable `<figure>` disappears. A `<figure>` is always emitted
 * as an empty element, so nothing can nest inside one.
 */
function onTag(tag: string, html: string, info: { isClosing?: boolean }): string | undefined {
  if (tag === "a") {
    if (info.isClosing) {
      return ANCHOR_CLOSE;
    }
    const href = safeLinkHref(readAttrs(html).get("href"));
    return href ? `<a href="${encodeText(href)}" target="_blank" rel="noopener noreferrer">` : BARE_ANCHOR_OPEN;
  }
  if (tag === "figure") {
    if (info.isClosing) {
      return "";
    }
    const attrs = readAttrs(html);
    const fen = (attrs.get("data-fen") ?? "").trim().replace(/\s+/g, " ");
    if (!isValidDiagramFen(fen)) {
      return "";
    }
    const orientation = attrs.get("data-orientation")?.trim() === "black" ? "black" : "white";
    const caption = decodeText(attrs.get("data-caption") ?? "")
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_DIAGRAM_CAPTION);
    const captionAttr = caption ? ` data-caption="${encodeText(caption)}"` : "";
    return `<figure data-fen="${fen}" data-orientation="${orientation}"${captionAttr}></figure>`;
  }
  return undefined;
}

/**
 * Whitelist-based sanitizer with no DOM dependency: it runs identically in the
 * browser, in Node (tests/build) and inside the Cloudflare Worker (workerd).
 * DOM-based sanitizers are not an option on workerd — jsdom-backed wrappers
 * try to read files from disk and crash (error 1101), and linkedom lacks
 * `document.implementation.createHTMLDocument`, which makes DOMPurify
 * silently skip sanitization entirely.
 */
const filter = new FilterXSS({
  whiteList: { ...Object.fromEntries(ALLOWED_TAGS.map((tag) => [tag, []])), a: [], figure: [] },
  onTag,
  stripIgnoreTag: true, // unknown tags: drop the tag, keep the text
  stripIgnoreTagBody: ["script", "style", "svg"], // and drop these subtrees whole
});

/**
 * Keeps a small set of formatting tags and drops every attribute, except the
 * ones `onTag` rebuilds on links (https only) and chess diagrams. A real HTML
 * parser (FilterXSS) does the work — no regex tag-stripping — so `<` inside
 * quoted attribute values and nested/case-variant payloads cannot smuggle
 * tags through. `b`/`i` are allowed through the parser and renamed
 * afterwards, when the output is attribute-free and safe to rewrite with a
 * simple pattern.
 */
export function sanitizeCourseHtml(input: string): string {
  let html = filter
    .process(input.replace(/[\u0000\uE000\uE001]/g, ""))
    .replace(/<\s*(\/?)\s*(b|i)\s*>/gi, (_match, slash: string, raw: string) => {
      const name = RENAME[raw.toLowerCase()] ?? raw.toLowerCase();
      return slash ? `</${name}>` : `<${name}>`;
    });
  html = resolveAnchors(html);
  if (html.includes("<figure ")) {
    return html.trim();
  }
  const text = html.replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").replace(/\s+/g, "");
  if (!text) {
    return "";
  }
  return html.trim();
}

/** Plain text for cards and meta. Diagram figures contribute nothing (not even their caption). */
export function courseSummaryText(input: string): string {
  return sanitizeCourseHtml(input)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|ul|ol|h2|h3)>/gi, " ")
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

const DIAGRAM =
  /<figure data-fen="([^"]*)" data-orientation="(white|black)"(?: data-caption="([^"]*)")?><\/figure>/g;

/**
 * Splits a description into html runs and diagram blocks. It sanitizes first,
 * so the figures it finds are the canonical ones `onTag` emits (attribute
 * values encoded, text `<` always `&lt;`).
 */
export function splitDescriptionBlocks(input: string): DescriptionBlock[] {
  const html = sanitizeCourseHtml(input);
  const blocks: DescriptionBlock[] = [];
  let last = 0;
  const push = (chunk: string) => {
    if (chunk.replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").trim()) {
      blocks.push({ type: "html", html: chunk });
    }
  };
  for (const match of html.matchAll(DIAGRAM)) {
    push(html.slice(last, match.index));
    blocks.push({
      type: "diagram",
      fen: match[1],
      orientation: match[2] as DiagramOrientation,
      caption: decodeText(match[3] ?? ""),
    });
    last = match.index + match[0].length;
  }
  push(html.slice(last));
  return blocks;
}

export function countDescriptionDiagrams(input: string): number {
  return splitDescriptionBlocks(input).filter((block) => block.type === "diagram").length;
}

const ALLOWED = new Set(["strong", "em", "u", "br", "p", "div", "ul", "ol", "li"]);
const RENAME: Record<string, string> = { b: "strong", i: "em" };

/** Keeps a small set of formatting tags and drops every attribute. */
export function sanitizeCourseHtml(input: string): string {
  let html = input.replace(/\u0000/g, "");
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  for (let pass = 0; pass < 4; pass += 1) {
    const next = html
      .replace(/<\s*(script|style|iframe|object|embed|link|meta|svg|math)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
      .replace(/<\s*(script|style|iframe|object|embed|link|meta|svg|math)\b[^>]*\/?>/gi, "");
    if (next === html) {
      break;
    }
    html = next;
  }
  html = html.replace(/<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (_match, slash: string, raw: string) => {
    const name = RENAME[raw.toLowerCase()] ?? raw.toLowerCase();
    if (!ALLOWED.has(name)) {
      return "";
    }
    if (name === "br") {
      return "<br>";
    }
    return slash ? `</${name}>` : `<${name}>`;
  });
  html = html.replace(/<(?!\/?(?:strong|em|u|br|p|div|ul|ol|li)\b)/gi, "&lt;");
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

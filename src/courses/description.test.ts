import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { courseSummaryText, sanitizeCourseHtml } from "./description.ts";
import { hasPlayableContent, normalizeChapters } from "./draft.ts";

describe("course description", () => {
  it("keeps the sanitizer Worker-safe (no DOM-based sanitizer deps)", () => {
    const source = readFileSync(new URL("./description.ts", import.meta.url), "utf8");
    const imports = source.split("\n").filter((line) => /^\s*import\b/.test(line));
    for (const line of imports) {
      assert.ok(
        !/jsdom|dompurify|linkedom/i.test(line),
        `DOM-based sanitizer deps break or silently no-op on Workers: ${line.trim()}`,
      );
    }
    assert.ok(
      imports.some((line) => /["']xss["']/.test(line)),
      "the sanitizer must use the DOM-free xss filter",
    );
  });

  it("keeps bold and italic and drops scripts", () => {
    const html = sanitizeCourseHtml('<strong>Master</strong> the <em>plans</em><script>alert(1)</script>');
    assert.equal(html, "<strong>Master</strong> the <em>plans</em>");
    assert.equal(courseSummaryText(html), "Master the plans");
  });

  it("strips event handlers and unknown tags", () => {
    const html = sanitizeCourseHtml('<div onclick="alert(1)"><b>Safe</b><img src=x onerror="alert(1)"></div>');
    assert.equal(html, "<div><strong>Safe</strong></div>");
  });

  it("keeps a less-than sign that is not a tag", () => {
    assert.equal(sanitizeCourseHtml("Keep 1 < 2 and <strong>bold</strong>"), "Keep 1 &lt; 2 and <strong>bold</strong>");
    assert.equal(courseSummaryText("Keep 1 < 2 and <strong>bold</strong>"), "Keep 1 < 2 and bold");
  });

  it("neutralizes parser-level payloads the regex could miss", () => {
    assert.equal(sanitizeCourseHtml('<div title="a > b" onclick="alert(1)">hi</div>'), "<div>hi</div>");
    assert.equal(sanitizeCourseHtml("<svg onload=alert(1)>x</svg>"), "");
    assert.equal(
      sanitizeCourseHtml('<style>a{background:url(javascript:alert(1))}</style>text'),
      "text",
    );
    assert.equal(sanitizeCourseHtml("<SCRIPT>alert(1)</SCRIPT><P>Hi</P>"), "<p>Hi</p>");
    assert.equal(sanitizeCourseHtml('<a href="javascript:alert(1)">click</a>'), "click");
    // Nested-split fragments are escaped as inert text and the inner script
    // tag is replaced with a `[removed]` marker; no tags or attributes
    // survive, so nothing executable can come out of this payload.
    assert.equal(
      sanitizeCourseHtml("<scr<script>ipt>alert(1)</scr<script>ipt>"),
      "&lt;scr[removed]ipt&gt;alert(1)&lt;/scr[removed]ipt&gt;",
    );
  });

  it("neutralizes XSS attack vectors across mixed-case, NUL bytes, and smuggled tags", () => {
    // Mixed-case script tags
    assert.equal(sanitizeCourseHtml("<sCrIpT>alert(1)</sCrIpT>"), "");
    assert.equal(sanitizeCourseHtml("<SCRIPT SRC=\"https://evil.com/xss.js\"></SCRIPT>"), "");

    // NUL byte injection in tags and text
    assert.equal(sanitizeCourseHtml("<scr\u0000ipt>alert(1)</script>"), "");
    assert.equal(sanitizeCourseHtml("<s\u0000cript>alert(1)</s\u0000cript>"), "");
    assert.equal(sanitizeCourseHtml("<p>Hello\u0000 World</p>"), "<p>Hello World</p>");

    // Event handler attributes (onerror, onload, onmouseover)
    assert.equal(sanitizeCourseHtml('<img src="x" onerror="alert(1)">'), "");
    assert.equal(sanitizeCourseHtml('<p onload="alert(1)" onmouseover="alert(2)">hover</p>'), "<p>hover</p>");
    assert.equal(sanitizeCourseHtml('<div onclick="alert(1)">content</div>'), "<div>content</div>");

    // javascript: URLs in various tags
    assert.equal(sanitizeCourseHtml('<iframe src="javascript:alert(1)"></iframe>'), "");
    assert.equal(sanitizeCourseHtml('<object data="javascript:alert(1)"></object>'), "");

    // SVG vectors
    assert.equal(sanitizeCourseHtml("<svg><circle r=10 /></svg>"), "");
    assert.equal(sanitizeCourseHtml("<svg><script>alert(1)</script></svg>"), "[removed]");

    // Mixed-case permitted tags are normalized and attributes stripped
    assert.equal(sanitizeCourseHtml("<DIV><STRONG>text</STRONG></DIV>"), "<div><strong>text</strong></div>");
    assert.equal(sanitizeCourseHtml("<B>bold</B> and <I>italic</I>"), "<strong>bold</strong> and <em>italic</em>");
    assert.equal(sanitizeCourseHtml("<P><U>underline</U></P>"), "<p><u>underline</u></p>");

    // Attribute-smuggled tags and less-than symbols
    assert.equal(sanitizeCourseHtml('<div title="<script>alert(1)</script>">hello</div>'), "<div>hello</div>");
    assert.equal(sanitizeCourseHtml('<p title="a<b">text</p>'), "<p>text</p>");
  });

  it("keeps underline, bullet, and ordered lists the pipeline preserves", () => {
    assert.equal(
      sanitizeCourseHtml("<p><u>Under</u></p><ul><li>One</li></ul><ol><li>First</li></ol>"),
      "<p><u>Under</u></p><ul><li>One</li></ul><ol><li>First</li></ol>",
    );
  });

  it("treats an empty editor as no description", () => {
    assert.equal(sanitizeCourseHtml("<div><br></div>"), "");
    assert.equal(sanitizeCourseHtml("  A solid defense.  "), "A solid defense.");
  });
});

describe("course draft", () => {
  it("saves a named chapter before any line exists", () => {
    const result = normalizeChapters([{ id: "ch-1", title: "Jobava", variations: [] }]);
    assert.deepEqual(result, { chapters: [{ id: "ch-1", title: "Jobava", variations: [] }] });
  });

  it("drops a blank line and rejects a line without moves", () => {
    const blank = normalizeChapters([
      { id: "ch-1", title: "One", variations: [{ id: "v", title: "", pgn: "   " }] },
    ]);
    assert.deepEqual(blank, { chapters: [{ id: "ch-1", title: "One", variations: [] }] });
    const invalid = normalizeChapters([
      { id: "ch-1", title: "One", variations: [{ id: "v", title: "Main", pgn: "{only a comment}" }] },
    ]);
    assert.equal("error" in invalid, true);
  });

  it("keeps a commented line", () => {
    const result = normalizeChapters([
      {
        id: "ch-1",
        title: "London",
        variations: [{ id: "v", title: "Main", pgn: "{A solid start.} 1. d4 d5 2. Nf3" }],
      },
    ]);
    assert.ok(!("error" in result));
    if ("error" in result) {
      return;
    }
    assert.equal(result.chapters[0]?.variations.length, 1);
  });

  it("requires a chapter with a playable line before publishing", () => {
    assert.equal(hasPlayableContent([]), false);
    assert.equal(
      hasPlayableContent([
        { id: "ch-1", title: "Empty", variations: [] },
        { id: "ch-2", title: "Also empty", variations: [] },
      ]),
      false,
    );
    assert.equal(
      hasPlayableContent([{ id: "ch-1", title: "Jobava", variations: [{ id: "v", title: "Main", pgn: "1. d4 d5" }] }]),
      true,
    );
  });
});

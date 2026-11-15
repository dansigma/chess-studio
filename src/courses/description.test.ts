import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  countDescriptionDiagrams,
  courseSummaryText,
  sanitizeCourseHtml,
  splitDescriptionBlocks,
} from "./description.ts";
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

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("course description headings, links and diagrams (SIG-1368)", () => {
  it("keeps h2 and h3 without attributes", () => {
    assert.equal(
      sanitizeCourseHtml('<h2 onclick="x" id="a">Plan</h2><h3>Idea</h3><h1>Big</h1>'),
      "<h2>Plan</h2><h3>Idea</h3>Big",
    );
  });

  it("keeps https links, forces rel and target and drops author attributes", () => {
    assert.equal(
      sanitizeCourseHtml(
        '<a href="https://lichess.org/x?a=1&b=2" target="_self" rel="opener" onclick="x" style="a:b">go</a>',
      ),
      '<a href="https://lichess.org/x?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">go</a>',
    );
    assert.equal(
      sanitizeCourseHtml('<A HREF="HTTPS://Example.com/">go</A>'),
      '<a href="HTTPS://Example.com/" target="_blank" rel="noopener noreferrer">go</a>',
    );
  });

  it("removes links that are not plain https and keeps their text", () => {
    const bad = [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      " javascript:alert(1)",
      "java\tscript:alert(1)",
      "&#106;avascript:alert(1)",
      "&#x6A;avascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "//evil.com/x",
      "http://example.com/",
      "mailto:a@b.c",
      "vbscript:x",
      "/relative",
      "https://a.com/ x",
      "",
    ];
    for (const href of bad) {
      const out = sanitizeCourseHtml(`<a href="${href}">text</a>`);
      assert.equal(out, "text", `href ${JSON.stringify(href)} gave ${out}`);
    }
    // a quote ends the value; the injected handler is just another dropped attribute
    assert.equal(
      sanitizeCourseHtml('<a href="https://a.com/" onmouseover="alert(1)">text</a>'),
      '<a href="https://a.com/" target="_blank" rel="noopener noreferrer">text</a>',
    );
    assert.equal(sanitizeCourseHtml("<a>text</a>"), "text");
    assert.equal(sanitizeCourseHtml("<a href=javascript:alert(1)>text</a>"), "text");
    assert.equal(sanitizeCourseHtml("<a href='javascript:alert(1)'>text</a>"), "text");
  });

  it("never lets a rejected link steal the closing tag of a good one", () => {
    assert.equal(
      sanitizeCourseHtml('<a href="https://a.com/">one<a href="javascript:x">two</a>three</a>'),
      '<a href="https://a.com/" target="_blank" rel="noopener noreferrer">onetwothree</a>',
    );
  });

  it("keeps a valid diagram and normalizes its attributes", () => {
    assert.equal(
      sanitizeCourseHtml(
        `<figure data-fen="${START}" data-orientation="black" data-caption="Start &amp; end" class="x" onclick="y"></figure>`,
      ),
      `<figure data-fen="${START}" data-orientation="black" data-caption="Start &amp; end"></figure>`,
    );
    assert.equal(
      sanitizeCourseHtml(`<figure data-fen="${START}" data-orientation="sideways"></figure>`),
      `<figure data-fen="${START}" data-orientation="white"></figure>`,
    );
    // a description that is only a diagram is not empty
    assert.notEqual(sanitizeCourseHtml(`<figure data-fen="${START}"></figure>`), "");
  });

  it("drops diagrams with an invalid or missing FEN", () => {
    const fens = ["", "nonsense", "8/8/8/8/8/8/8/8 w - - 0 1", `${START}"><script>alert(1)</script>`, "x".repeat(500)];
    for (const fen of fens) {
      const out = sanitizeCourseHtml(`<p>t</p><figure data-fen="${fen.replace(/"/g, "&quot;")}"></figure>`);
      assert.equal(out, "<p>t</p>", JSON.stringify(fen));
    }
    assert.equal(sanitizeCourseHtml("<p>t</p><figure></figure>"), "<p>t</p>");
  });

  it("escapes and caps captions", () => {
    const out = sanitizeCourseHtml(
      `<figure data-fen="${START}" data-caption="&lt;script&gt;alert(1)&lt;/script&gt; &quot;x&quot;"></figure>`,
    );
    assert.ok(!out.includes("<script"));
    assert.equal(splitDescriptionBlocks(out)[0]?.type, "diagram");
    const long = sanitizeCourseHtml(`<figure data-fen="${START}" data-caption="${"a".repeat(900)}"></figure>`);
    const block = splitDescriptionBlocks(long)[0];
    assert.ok(block?.type === "diagram" && block.caption.length === 200);
  });

  it("cannot nest content or other figures inside a figure", () => {
    const out = sanitizeCourseHtml(
      `<figure data-fen="${START}"><script>alert(1)</script><figure data-fen="bad"><img src=x onerror=alert(1)></figure>hello</figure>`,
    );
    assert.equal(out, `<figure data-fen="${START}" data-orientation="white"></figure>hello`);
    assert.equal(
      sanitizeCourseHtml(`<figcaption onclick="x">cap</figcaption><figure data-fen='${START}' data-fen='bad'/>`),
      `cap<figure data-fen="${START}" data-orientation="white"></figure>`,
    );
  });

  it("does not let text pretend to be a figure", () => {
    const out = sanitizeCourseHtml(
      `&lt;figure data-fen="${START}"&gt;&lt;/figure&gt; <p title="<figure data-fen='${START}'>">x</p>`,
    );
    assert.equal(countDescriptionDiagrams(out), 0);
  });

  it("splits html and diagram blocks in order", () => {
    const html = `<p>Intro</p><figure data-fen="${START}" data-orientation="black" data-caption="Hi"></figure><h2>Next</h2><figure data-fen="${START}"></figure>`;
    assert.deepEqual(splitDescriptionBlocks(html), [
      { type: "html", html: "<p>Intro</p>" },
      { type: "diagram", fen: START, orientation: "black", caption: "Hi" },
      { type: "html", html: "<h2>Next</h2>" },
      { type: "diagram", fen: START, orientation: "white", caption: "" },
    ]);
    assert.deepEqual(splitDescriptionBlocks(""), []);
    assert.equal(countDescriptionDiagrams(html), 2);
  });

  it("keeps summary text plain: diagrams add nothing, headings separate", () => {
    const text = courseSummaryText(
      `<h2>Plan</h2><p>See <a href="https://a.com/">this</a></p><figure data-fen="${START}" data-caption="Secret"></figure><h3>End</h3>`,
    );
    assert.equal(text, "Plan See this End");
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
    assert.deepEqual(invalid, {
      error: { key: "course.admin.error.lineNoMoves", vars: { title: "Main" } },
    });
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

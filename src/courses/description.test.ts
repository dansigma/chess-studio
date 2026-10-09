import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { courseSummaryText, sanitizeCourseHtml } from "./description.ts";
import { hasPlayableContent, normalizeChapters } from "./draft.ts";

describe("course description", () => {
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
    // Nested-split tags parse as one unknown element; the parser drops the
    // tags and keeps only inert text, so no script survives.
    assert.equal(
      sanitizeCourseHtml("<scr<script>ipt>alert(1)</scr<script>ipt>"),
      "ipt&gt;alert(1)ipt&gt;",
    );
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

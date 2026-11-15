import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyCourse, type CourseDraft } from "./admin-draft.ts";
import { locateError, validateCourseDraft } from "./validate-draft.ts";

function validDraft(patch: Partial<CourseDraft> = {}): CourseDraft {
  return {
    ...emptyCourse(),
    title: "London System",
    theme: "openings",
    chapters: [
      {
        id: "c1",
        title: "Intro",
        variations: [{ id: "v1", title: "Main", pgn: "1. d4 d5 2. Bf4 Nf6" }],
      },
    ],
    ...patch,
  };
}

function failure(draft: CourseDraft) {
  const result = validateCourseDraft(draft);
  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error("unreachable");
  }
  return result;
}

test("a complete draft is valid", () => {
  assert.deepEqual(validateCourseDraft(validDraft()), { ok: true });
});

test("title errors point at the title on Informações", () => {
  const result = failure(validDraft({ title: "  " }));
  assert.equal(result.error.key, "course.admin.error.needsTitle");
  assert.deepEqual([result.tab, result.field], ["info", "title"]);
});

test("theme and color errors point at their selects on Informações", () => {
  const theme = failure(validDraft({ theme: "" }));
  assert.equal(theme.error.key, "course.admin.error.chooseTheme");
  assert.deepEqual([theme.tab, theme.field], ["info", "theme"]);
  const color = failure(validDraft({ color: "red" as never }));
  assert.equal(color.error.key, "course.admin.error.chooseColor");
  assert.deepEqual([color.tab, color.field], ["info", "color"]);
});

test("address and author errors point at their inputs on Informações", () => {
  const address = failure(validDraft({ title: "!!!", slug: "" }));
  assert.equal(address.error.key, "course.admin.error.needsAddress");
  assert.deepEqual([address.tab, address.field], ["info", "slug"]);
  const author = failure(validDraft({ authorName: "x".repeat(121) }));
  assert.equal(author.error.key, "course.admin.error.authorNameTooLong");
  assert.deepEqual([author.tab, author.field], ["info", "authorName"]);
});

test("catalog field errors point at Informações", () => {
  const cases: Array<[Partial<CourseDraft>, string, string]> = [
    [{ level: "expert" as never }, "course.admin.error.invalidLevel", "level"],
    [{ language: "fr" as never }, "course.admin.error.invalidLanguage", "language"],
    [{ eloMin: 1000, eloMax: null }, "course.admin.error.eloIncomplete", "elo"],
    [{ eloMin: 1000, eloMax: 9000 }, "course.admin.error.eloOutOfRange", "elo"],
    [{ eloMin: 1800, eloMax: 1000 }, "course.admin.error.eloOrder", "elo"],
    [{ durationMinutes: 0 }, "course.admin.error.invalidDuration", "duration"],
  ];
  for (const [patch, key, field] of cases) {
    const result = failure(validDraft(patch));
    assert.equal(result.error.key, key);
    assert.deepEqual([result.tab, result.field], ["info", field]);
  }
});

test("a too long description points at the summary on Descrição", () => {
  const result = failure(validDraft({ summary: `<p>${"a".repeat(20001)}</p>` }));
  assert.equal(result.error.key, "course.admin.error.descriptionTooLong");
  assert.deepEqual([result.tab, result.field], ["description", "summary"]);
});

test("a description may hold 12 diagrams; a 13th points at the summary on Descrição", () => {
  const figure = '<figure data-fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"></figure>';
  assert.equal(validateCourseDraft(validDraft({ summary: figure.repeat(12) })).ok, true);
  const result = failure(validDraft({ summary: figure.repeat(13) }));
  assert.equal(result.error.key, "course.admin.error.tooManyDiagrams");
  assert.deepEqual([result.tab, result.field], ["description", "summary"]);
});

test("cover and video errors point at their inputs on Mídia", () => {
  const cover = failure(validDraft({ coverUrl: "https://evil.example/x.png" }));
  assert.equal(cover.error.key, "course.admin.error.coverHost");
  assert.deepEqual([cover.tab, cover.field], ["media", "coverUrl"]);
  const video = failure(validDraft({ videoUrl: "not a link" }));
  assert.equal(video.error.key, "course.admin.error.videoLink");
  assert.deepEqual([video.tab, video.field], ["media", "videoUrl"]);
});

test("chapter and line errors point at Capítulos", () => {
  const noLine = failure(validDraft({ chapters: [{ id: "c1", title: "A", variations: [] }] }));
  assert.equal(noLine.error.key, "course.admin.error.needsPlayableLine");
  assert.deepEqual([noLine.tab, noLine.field], ["chapters", "chapters"]);
  const noPgn = failure(
    validDraft({ chapters: [{ id: "c1", title: "A", variations: [{ id: "v1", title: "Main", pgn: "" }] }] }),
  );
  assert.equal(noPgn.error.key, "course.admin.error.lineNeedsPgn");
  assert.deepEqual([noPgn.tab, noPgn.field], ["chapters", "chapters"]);
  const noMoves = failure(
    validDraft({ chapters: [{ id: "c1", title: "A", variations: [{ id: "v1", title: "Main", pgn: "garbage" }] }] }),
  );
  assert.equal(noMoves.error.key, "course.admin.error.lineNoMoves");
  assert.equal(noMoves.tab, "chapters");
});

test("a paid or premium draft still validates: the free launch forces free", () => {
  assert.deepEqual(validateCourseDraft(validDraft({ accessTier: "paid", priceCents: null })), { ok: true });
  assert.deepEqual(validateCourseDraft(validDraft({ accessTier: "premium", priceCents: 500 })), { ok: true });
});

test("an invalid id has no field", () => {
  const result = failure(validDraft({ id: "nope" }));
  assert.equal(result.error.key, "course.admin.error.invalidId");
  assert.equal(result.field, undefined);
  assert.equal(result.tab, undefined);
});

test("locateError maps server errors to their tab and field", () => {
  const taken = locateError({ key: "course.admin.error.addressInUse" });
  assert.deepEqual([taken?.tab, taken?.field], ["info", "slug"]);
  const line = locateError({ key: "course.admin.error.lineTooLong", vars: { title: "x" } });
  assert.deepEqual([line?.tab, line?.field], ["chapters", "chapters"]);
  assert.equal(locateError({ key: "course.admin.error.publishFailed" }), null);
  assert.equal(locateError({ key: "course.admin.error.not_owner" }), null);
});

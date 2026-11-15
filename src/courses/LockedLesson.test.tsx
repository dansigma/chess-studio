// SIG-1354: the locked screen is a neutral message with a way back; it never
// links to a paywall.
import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { cleanup, render } from "@testing-library/react";
import type { Course } from "./types.ts";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

const { LockedLesson } = await import("./LockedLesson.tsx");

const course = { slug: "caro", accessTier: "paid", priceCents: 1990, chapters: [] } as unknown as Course;

test("LockedLesson shows a message and a back link, no paywall link", () => {
  const { container } = render(<LockedLesson course={course} />);
  const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
  assert.deepEqual(hrefs, ["/courses/caro"]);
  assert.ok(!/R\$|premium|buy|comprar|assinar/i.test(container.textContent ?? ""));
});

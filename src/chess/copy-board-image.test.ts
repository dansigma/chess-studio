import assert from "node:assert/strict";
import test, { mock } from "node:test";

let toBlobCalls: Array<{ element: unknown; options: unknown }> = [];
let toBlobResult: unknown = null;

mock.module("html-to-image", {
  namedExports: {
    toBlob: async (element: unknown, options: unknown) => {
      toBlobCalls.push({ element, options });
      return toBlobResult;
    },
  },
});

const { boardPngBlob } = await import("./copy-board-image.ts");

test("boardPngBlob renders the element through a dynamic html-to-image import", async () => {
  toBlobCalls = [];
  const blob = new Blob(["png"], { type: "image/png" });
  toBlobResult = blob;
  const element = {} as HTMLElement;
  const result = await boardPngBlob(element);
  assert.equal(result, blob);
  assert.equal(toBlobCalls.length, 1);
  assert.equal(toBlobCalls[0]?.element, element);
  assert.deepEqual(toBlobCalls[0]?.options, { pixelRatio: 2, cacheBust: true });
});

test("boardPngBlob throws when the renderer produces no blob", async () => {
  toBlobCalls = [];
  toBlobResult = null;
  await assert.rejects(boardPngBlob({} as HTMLElement), /Could not create the board image/);
});

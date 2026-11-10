import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, render } from "@testing-library/react";
import { useVirtualRows } from "./use-virtual-rows";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

// Regression: the table's scroll container mounts only after the first page
// loads. The hook must still measure and observe it once it appears.
test("measures a scroll container that mounts after the first render", () => {
  const observed: Element[] = [];
  const original = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    observe(element: Element) {
      observed.push(element);
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  try {
    let lastEnd = -1;
    function Probe({ ready }: { ready: boolean }) {
      const { attachScroll, end } = useVirtualRows({ count: 200, rowHeight: 10, overscan: 0 });
      lastEnd = end;
      return ready ? <div ref={attachScroll} data-testid="scroll" /> : <p>loading</p>;
    }
    // The DOM shim does not expose element classes as globals; use a div's prototype.
    const proto = Object.getPrototypeOf(document.createElement("div")) as object;
    Object.defineProperty(proto, "clientHeight", { configurable: true, get: () => 900 });
    try {
      const view = render(<Probe ready={false} />);
      assert.equal(observed.length, 0);
      view.rerender(<Probe ready />);
      assert.deepEqual(observed, [view.getByTestId("scroll")]);
      assert.equal(lastEnd, 90, "a 900 px viewport renders 90 rows of 10 px, not the 480 px fallback");
    } finally {
      delete (proto as { clientHeight?: number }).clientHeight;
    }
  } finally {
    globalThis.ResizeObserver = original;
  }
});

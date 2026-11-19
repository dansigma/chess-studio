import assert from "node:assert/strict";
import { after, afterEach, before, test, mock } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { cleanup, render } from "@testing-library/react";

mock.module("@/src/engine/shared-engine", {
  namedExports: {
    acquire: () => ({
      analyze: () => undefined,
      stop: () => undefined,
      subscribe: () => () => undefined,
      release: () => undefined,
    }),
  },
});

const { EvalGraphPanel, EvalSparkline } = await import("./EvalGraphPanel.tsx");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");
const { importPgn } = await import("@/src/chess/pgn.ts");
const { fenKey, variationPoints } = await import("@/src/chess/tree.ts");

function seedLineWithMixedEvals(): void {
  const imported = importPgn(`[Event "MixedEval"]\n\n1. e4 e5 2. Nf3 *`);
  const points = variationPoints(imported.tree, imported.path);
  const evals = [0.2, 1.5, -1.2, 0.8];
  const evalByFen: Record<string, { pawns: number; label: string; depth: number }> = {};
  points.forEach((point, index) => {
    const pawns = evals[index] ?? 0;
    evalByFen[fenKey(point.fen)] = {
      pawns,
      label: pawns >= 0 ? `+${pawns.toFixed(1)}` : pawns.toFixed(1),
      depth: 12,
    };
  });

  useStudioStore.setState({
    boards: [
      {
        id: "eval-board",
        remoteId: null,
        title: imported.title,
        tree: imported.tree,
        path: imported.path,
        headers: imported.headers,
        orientation: "white" as const,
        repertoireColor: null,
        dirty: false,
        preview: false,
      },
    ],
    activeBoardId: "eval-board",
    settings: { ...DEFAULT_SETTINGS, locale: "en" },
    evalByFen,
    setupMode: false,
    workspaceView: "studio",
  });
}

before(() => {
  setupDom();
  (globalThis as Record<string, unknown>).ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});

after(() => {
  teardownDom();
});

afterEach(() => {
  cleanup();
});

test("SIG-1399: EvalGraphPanel splits area fills at zeroY with distinct clipPaths for White and Black advantage", () => {
  seedLineWithMixedEvals();
  const { container } = render(<EvalGraphPanel />);

  const clipPaths = Array.from(container.querySelectorAll("clipPath"));
  assert.equal(clipPaths.length, 2, "two clipPaths (above and below zeroY)");
  const clipIds = clipPaths.map((node) => node.getAttribute("id") ?? "");
  assert.notEqual(clipIds[0], clipIds[1], "clipPath ids are distinct");
  for (const id of clipIds) {
    assert.ok(id.length > 0 && !id.includes(":"), `clipPath id "${id}" is non-empty and colon-free`);
  }

  const paths = Array.from(container.querySelectorAll("svg > path"));
  const clippedAreas = paths.filter((node) => node.hasAttribute("clip-path"));
  assert.equal(clippedAreas.length, 2, "two clipped area paths");

  const fills = clippedAreas.map((node) => node.getAttribute("fill"));
  const clips = clippedAreas.map((node) => node.getAttribute("clip-path"));
  assert.notEqual(fills[0], fills[1], "area paths use distinct fills");
  assert.notEqual(clips[0], clips[1], "area paths reference distinct clipPaths");
  assert.deepEqual(fills, ["var(--studio-accent)", "var(--studio-muted)"]);
  assert.deepEqual(clips, [`url(#${clipIds[0]})`, `url(#${clipIds[1]})`]);

  const linePath = paths.find((node) => node.getAttribute("fill") === "none");
  assert.ok(linePath, "line path is preserved");
  assert.equal(linePath!.getAttribute("stroke"), "var(--studio-accent)");
});

test("SIG-1399: EvalGraphPanel and EvalSparkline generate distinct clipPath ids when mounted together", () => {
  seedLineWithMixedEvals();
  const { container } = render(
    <div>
      <EvalGraphPanel />
      <EvalSparkline walk={false} />
    </div>,
  );

  const clipPaths = Array.from(container.querySelectorAll("clipPath"));
  assert.equal(clipPaths.length, 4, "two clipPaths per chart");
  const uniqueIds = new Set(clipPaths.map((node) => node.getAttribute("id")));
  assert.equal(uniqueIds.size, 4, "all four clipPath ids are unique across mounted charts");
});

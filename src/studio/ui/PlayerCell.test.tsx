import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { cleanup, render } from "@testing-library/react";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { PlayerCell } from "./PlayerCell";

before(() => setupDom());
after(() => teardownDom());
afterEach(cleanup);

test("bold gives a losing player the normal text colour and keeps the full name in the tooltip", () => {
  const name = "A player with a long name";
  const { getByTitle, rerender } = render(<PlayerCell name={name} rating={2800} outcome="lost" />);
  assert.ok(getByTitle(name).classList.contains("text-studio-muted"));

  rerender(<PlayerCell name={name} rating={2800} outcome="lost" bold />);
  const player = getByTitle(name);
  assert.equal(player.textContent, name);
  assert.ok(player.classList.contains("truncate"));
  assert.ok(player.classList.contains("font-semibold"));
  assert.ok(player.classList.contains("text-studio-fg"));
  assert.ok(!player.classList.contains("text-studio-muted"));
});

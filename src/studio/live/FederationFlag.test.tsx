import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import "../../test-utils/dom.ts";
import { cleanup, render, screen } from "@testing-library/react";
import { FederationFlag } from "./FederationFlag.tsx";

afterEach(cleanup);

test("renders a local flag with the same localized tooltip and accessible name", () => {
  const { rerender } = render(<FederationFlag fed="IND" locale="pt-br" />);
  const flag = screen.getByRole("img", { name: "Índia" });
  assert.equal(flag.getAttribute("src"), "/flags/in.svg");
  assert.equal(flag.getAttribute("title"), "Índia");

  rerender(<FederationFlag fed="ENG" locale="en" />);
  assert.equal(screen.getByRole("img", { name: "England" }).getAttribute("src"), "/flags/gb-eng.svg");
});

test("renders neutral FIDE and unknown federations as text", () => {
  render(<><FederationFlag fed="FID" locale="pt-br" /><FederationFlag fed="ZZZ" locale="en" /></>);
  assert.equal(screen.getByText("FIDE").getAttribute("title"), "FIDE");
  assert.ok(screen.getByText("ZZZ"));
  assert.equal(screen.queryByRole("img"), null);
});

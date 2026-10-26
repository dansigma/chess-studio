// SIG-1045 smoke test: proves happy-dom + Testing Library render a
// store-connected component under `node --test`.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, render, screen, cleanup } from "@testing-library/react";
import { SiteFooter } from "./SiteFooter.tsx";
import { useStudioStore } from "../store/studio-store.ts";

before(() => {
  setupDom();
});

after(() => {
  teardownDom();
});

test("SiteFooter renders the two legal links in English", () => {
  act(() => {
    useStudioStore.getState().setLocale("en");
  });
  try {
    render(<SiteFooter />);
    const privacy = screen.getByRole("link", { name: "Privacy" });
    const terms = screen.getByRole("link", { name: "Terms" });
    assert.equal(privacy.getAttribute("href"), "/privacidade");
    assert.equal(terms.getAttribute("href"), "/termos");
  } finally {
    cleanup();
  }
});

test("SiteFooter labels the legal links in Portuguese after a locale switch", () => {
  useStudioStore.getState().setLocale("pt-br");
  try {
    const { rerender } = render(<SiteFooter />);
    act(() => {
      useStudioStore.getState().setLocale("pt-br");
    });
    rerender(<SiteFooter />);
    const privacy = screen.getByRole("link", { name: "Privacidade" });
    const terms = screen.getByRole("link", { name: "Termos" });
    assert.equal(privacy.getAttribute("href"), "/privacidade");
    assert.equal(terms.getAttribute("href"), "/termos");
  } finally {
    act(() => {
      useStudioStore.getState().setLocale("en");
    });
    cleanup();
  }
});

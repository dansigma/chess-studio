import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { useStudioStore } from "../studio-store.ts";

describe("workspaceView (SIG-1273)", () => {
  beforeEach(() => useStudioStore.setState({ workspaceView: "studio" }));

  it("defaults to studio", () => {
    assert.equal(useStudioStore.getState().workspaceView, "studio");
  });

  it("setWorkspaceView switches the center view without touching boards or activity", () => {
    const before = useStudioStore.getState();
    before.setWorkspaceView("library");
    const after = useStudioStore.getState();
    assert.equal(after.workspaceView, "library");
    assert.equal(after.boards, before.boards);
    assert.equal(after.activity, before.activity);
  });

  it("toggleLibrary flips between library and studio", () => {
    useStudioStore.getState().toggleLibrary();
    assert.equal(useStudioStore.getState().workspaceView, "library");
    useStudioStore.getState().toggleLibrary();
    assert.equal(useStudioStore.getState().workspaceView, "studio");
  });
});

describe("toggleLive (SIG-1288)", () => {
  beforeEach(() => useStudioStore.setState({ workspaceView: "studio" }));

  it("flips between live and studio", () => {
    useStudioStore.getState().toggleLive();
    assert.equal(useStudioStore.getState().workspaceView, "live");
    useStudioStore.getState().toggleLive();
    assert.equal(useStudioStore.getState().workspaceView, "studio");
  });

  it("is mutually exclusive with library", () => {
    useStudioStore.getState().toggleLibrary();
    useStudioStore.getState().toggleLive();
    assert.equal(useStudioStore.getState().workspaceView, "live");
    useStudioStore.getState().toggleLibrary();
    assert.equal(useStudioStore.getState().workspaceView, "library");
  });
});

describe("workspace view change closes the side panel (SIG-1317)", () => {
  const open = () =>
    useStudioStore.setState({
      workspaceView: "studio",
      settings: { ...useStudioStore.getState().settings, sidebarCollapsed: false },
    });
  const collapsed = () => useStudioStore.getState().settings.sidebarCollapsed;

  it("toggleLibrary collapses the panel", () => {
    open();
    useStudioStore.getState().toggleLibrary();
    assert.equal(collapsed(), true);
  });

  it("toggleLive collapses the panel", () => {
    open();
    useStudioStore.getState().toggleLive();
    assert.equal(collapsed(), true);
  });

  it("setWorkspaceView to a new view collapses the panel", () => {
    open();
    useStudioStore.getState().setWorkspaceView("library");
    assert.equal(collapsed(), true);
  });

  it("setWorkspaceView with the current view keeps the panel open", () => {
    open();
    useStudioStore.getState().setWorkspaceView("studio");
    assert.equal(collapsed(), false);
  });

  it("going back to studio from library also collapses", () => {
    open();
    useStudioStore.getState().setWorkspaceView("library");
    useStudioStore.getState().setActivity("bookmarks");
    assert.equal(collapsed(), false);
    useStudioStore.getState().setWorkspaceView("studio");
    assert.equal(collapsed(), true);
  });
});

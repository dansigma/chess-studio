import assert from "node:assert/strict";
import test from "node:test";

const { useStudioStore } = await import("../studio-store.ts");

test("openPgnSource keeps the games-quota message importFileDatabase reported", () => {
  const gamesQuota = "This database holds more than 25,000 games. Remove some games and try again.";
  useStudioStore.setState({
    importFileDatabase: () => {
      useStudioStore.setState({ statusMessage: gamesQuota });
      return "";
    },
  });

  useStudioStore.getState().openPgnSource("Huge", "1. e4 e5 *");

  assert.equal(useStudioStore.getState().statusMessage, gamesQuota);
});

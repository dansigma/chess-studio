import { expect, test } from "@playwright/test";

/**
 * SIG-1089: anonymous users opening the My Games activity see the sign-in
 * hint and the sidebar never fires a sync request (unit tests cover the
 * signed-in list/pagination/sync; e2e stays anonymous-only so no auth
 * fixtures are needed).
 */
test("my games: anonymous sees the sign-in hint and never syncs", async ({ page }) => {
  let syncRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/my-games/sync") {
      syncRequests += 1;
    }
  });

  await page.goto("/studio");
  await page.getByRole("button", { name: "My Games", exact: true }).first().click();

  // Settle the sidebar first so the zero-sync assertion is not a false pass.
  await expect(page.getByText("Sign in to see your imported games.")).toBeVisible();
  expect(syncRequests).toBe(0);
});

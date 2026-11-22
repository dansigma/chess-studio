import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { teardownDom } from "../test-utils/dom.ts";

let onBrowserSignOut: () => void;
let onServerSignOut: () => void;
mock.module("@/src/lib/supabase/client", {
  namedExports: { createBrowserSupabase: () => ({ auth: { signOut: async () => onBrowserSignOut() } }) },
});
mock.module("next/navigation", { namedExports: { useRouter: () => ({}) } });
mock.module("@/app/login/actions", { namedExports: { signOut: async () => onServerSignOut() } });

test("sign-out commits the Library deletion before redirecting and invalidates older saves", async (t) => {
  t.after(teardownDom);
  const oldLibrary = { folders: [{ id: "old", name: "Old", parentId: null }], databases: [] };
  const key = "studio-clone-files";
  window.localStorage.setItem(key, JSON.stringify(oldLibrary));
  let snapshot: typeof oldLibrary | undefined = oldLibrary;
  const saveOpened = Promise.withResolvers<void>();
  const deleteStarted = Promise.withResolvers<void>();
  let releaseSave: () => void = () => {};
  let finishDelete: () => void = () => {};
  let opening = 0;
  Object.defineProperty(window, "indexedDB", { configurable: true, value: { open() {} } });
  t.after(() => Reflect.deleteProperty(window, "indexedDB"));
  t.mock.method(window.indexedDB, "open", () => {
    const request = {
      onsuccess: () => {},
      result: {
        close() {},
        transaction() {
          let deleting = false;
          const transaction = {
            oncomplete: () => {},
            objectStore: () => ({
              put: (value: typeof oldLibrary) => { snapshot = value; return {}; },
              get: () => ({ result: snapshot }),
              delete: () => {
                deleting = true;
                finishDelete = () => {
                  snapshot = undefined;
                  transaction.oncomplete();
                };
                deleteStarted.resolve();
                return {};
              },
            }),
          };
          setImmediate(() => {
            if (!deleting) transaction.oncomplete();
          });
          return transaction;
        },
      },
    };
    if (++opening === 1) {
      releaseSave = () => request.onsuccess();
      saveOpened.resolve();
    } else {
      queueMicrotask(() => request.onsuccess());
    }
    return request;
  });

  const { EMPTY_FILES, loadLocalFiles, saveLocalFiles } = await import("@/src/lib/user-files");
  const { useStudioStore } = await import("@/src/store/studio-store");
  const { signOutEverywhere } = await import("./AccountMenu");
  // Supabase can notify the shell before its signOut promise resolves.
  onBrowserSignOut = () => { void useStudioStore.getState().setUser(null); };
  useStudioStore.setState({ user: { id: "previous-account", email: null } });
  const slowSave = saveLocalFiles(oldLibrary);
  const queuedSave = saveLocalFiles(oldLibrary);
  await saveOpened.promise;
  let redirected = false;
  onServerSignOut = () => {
    assert.equal(snapshot, undefined);
    assert.equal(window.localStorage.getItem(key), null);
    redirected = true;
  };
  const signingOut = signOutEverywhere();
  try {
    await Promise.race([
      deleteStarted.promise,
      signingOut.then(() => assert.fail("redirected before deleting the Library")),
    ]);
    assert.equal(redirected, false);
    finishDelete();
    await signingOut;
    assert.equal(redirected, true);
  } finally {
    releaseSave();
    await Promise.allSettled([slowSave, queuedSave, signingOut]);
  }
  assert.deepEqual(await loadLocalFiles(), EMPTY_FILES);
});

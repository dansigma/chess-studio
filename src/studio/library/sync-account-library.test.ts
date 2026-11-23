import assert from "node:assert/strict";
import test, { mock } from "node:test";
import * as userFiles from "@/src/lib/user-files";

let load: () => Promise<userFiles.FilesLibrary>;
mock.module("@/src/lib/user-files", {
  namedExports: { ...userFiles, loadRemoteFiles: () => load() },
});

const { useStudioStore } = await import("@/src/store/studio-store");
const { syncAccountLibrary } = await import("./sync-account-library");

for (const { stage, error, expected } of [
  { stage: "load", error: undefined, expected: "Não foi possível carregar a biblioteca da conta." },
  { stage: "load", error: Error("Network failure"), expected: "Não foi possível carregar a biblioteca da conta." },
  { stage: "load", error: Error("quota_databases"), expected: "quota" },
  { stage: "upload", error: Error("Network failure"), expected: "Não foi possível enviar as bases locais para a conta." },
]) {
  test(`account Library sync reports a localized ${stage} failure (${error?.message})`, async () => {
    load = async () => {
      if (stage === "load") throw error;
      return userFiles.EMPTY_FILES;
    };
    useStudioStore.setState((state) => ({
      user: { id: "account", email: null },
      settings: { ...state.settings, locale: "pt-br" },
      statusMessage: null,
      uploadLocalDatabases: async () => {
        if (stage === "upload") throw error;
        assert.fail("Upload should only run after a successful load");
      },
    }));

    await syncAccountLibrary("account", () => false);

    const { tLibrary } = await import("@/src/i18n/library-strings");
    assert.equal(useStudioStore.getState().statusMessage, expected === "quota"
      ? tLibrary("pt-br", "library.sync.loadFailed", { reason: tLibrary("pt-br", "library.quota.databases") })
      : expected);
  });
}

import assert from "node:assert/strict";
import { test } from "node:test";
import { toUserInfo } from "./user-info.ts";

test("toUserInfo reads a trimmed display_name from user_metadata", () => {
  assert.deepEqual(toUserInfo({ id: "1", email: "a@b.c", user_metadata: { display_name: "  Ana " } }), {
    id: "1",
    email: "a@b.c",
    displayName: "Ana",
  });
});

test("toUserInfo yields null for missing, blank or non-string names", () => {
  for (const meta of [undefined, null, {}, { display_name: "  " }, { display_name: 5 }]) {
    assert.equal(toUserInfo({ id: "1", user_metadata: meta }).displayName, null);
  }
  assert.equal(toUserInfo({ id: "1" }).email, null);
});

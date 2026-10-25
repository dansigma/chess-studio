import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MIN_PASSWORD_LENGTH,
  isValidPassword,
  passwordLengthError,
  passwordRequirementHint,
} from "./password.ts";

describe("password validation", () => {
  it("defines minimum password length as 10", () => {
    assert.equal(MIN_PASSWORD_LENGTH, 10);
  });

  it("validates boundary lengths", () => {
    assert.equal(isValidPassword("123456789"), false);
    assert.equal(isValidPassword("1234567890"), true);
    assert.equal(isValidPassword("12345678901"), true);
  });

  it("rejects non-string and empty values", () => {
    assert.equal(isValidPassword(""), false);
    assert.equal(isValidPassword(null), false);
    assert.equal(isValidPassword(undefined), false);
    assert.equal(isValidPassword(1234567890), false);
  });

  it("returns translation keys with interpolation vars", () => {
    assert.deepEqual(passwordLengthError(), {
      key: "auth.error.passwordTooShort",
      vars: { min: 10 },
    });
    assert.deepEqual(passwordLengthError(8), {
      key: "auth.error.passwordTooShort",
      vars: { min: 8 },
    });
    assert.deepEqual(passwordRequirementHint(), {
      key: "auth.hint.passwordRequirement",
      vars: { min: 10 },
    });
    assert.deepEqual(passwordRequirementHint(8), {
      key: "auth.hint.passwordRequirement",
      vars: { min: 8 },
    });
  });
});

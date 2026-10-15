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

  it("formats error messages and helper hints", () => {
    assert.equal(passwordLengthError(), "Password must be at least 10 characters.");
    assert.equal(passwordLengthError(8), "Password must be at least 8 characters.");
    assert.equal(passwordRequirementHint(), "At least 10 characters");
    assert.equal(passwordRequirementHint(8), "At least 8 characters");
  });
});

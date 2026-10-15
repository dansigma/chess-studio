import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SITE_LOCALE,
  htmlLangFor,
  isSiteLocale,
  SITE_LOCALES,
  siteLocaleFromLanguage,
} from "./locale.ts";

describe("site locale (SIG-962)", () => {
  it("accepts only the known locales", () => {
    assert.deepEqual([...SITE_LOCALES], ["en", "pt-br"]);
    assert.equal(DEFAULT_SITE_LOCALE, "en");
    assert.equal(isSiteLocale("en"), true);
    assert.equal(isSiteLocale("pt-br"), true);
    assert.equal(isSiteLocale("pt"), false);
    assert.equal(isSiteLocale("klingon"), false);
    assert.equal(isSiteLocale(undefined), false);
  });

  it("derives the default from the browser language", () => {
    assert.equal(siteLocaleFromLanguage("pt-BR"), "pt-br");
    assert.equal(siteLocaleFromLanguage("pt"), "pt-br");
    assert.equal(siteLocaleFromLanguage("en-US"), "en");
    assert.equal(siteLocaleFromLanguage(undefined), "en");
    assert.equal(siteLocaleFromLanguage(null), "en");
  });

  it("maps locales to BCP-47 html lang tags", () => {
    assert.equal(htmlLangFor("en"), "en");
    assert.equal(htmlLangFor("pt-br"), "pt-BR");
  });
});

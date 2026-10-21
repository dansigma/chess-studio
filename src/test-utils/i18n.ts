// SIG-1035: test util asserting two string tables stay aligned: same key
// sets, no empty values, and identical `{placeholder}` sets per key.
import assert from "node:assert/strict";

function placeholders(text: string): string[] {
  return (text.match(/\{([^}]+)\}/g) ?? []).sort();
}

export function assertStringTablesAligned<Key extends string>(
  en: Record<Key, string>,
  ptBr: Record<Key, string>,
): void {
  const enKeys = Object.keys(en).sort();
  const ptKeys = Object.keys(ptBr).sort();
  assert.deepEqual(ptKeys, enKeys, "EN and PT-BR tables must define the same keys");
  for (const key of enKeys) {
    const enText = en[key as Key];
    const ptText = ptBr[key as Key];
    assert.ok(enText.length > 0, `en:${key} must not be empty`);
    assert.ok(typeof ptText === "string" && ptText.length > 0, `pt-br:${key} must not be empty`);
    assert.deepEqual(
      placeholders(ptText),
      placeholders(enText),
      `placeholders mismatch between EN and PT-BR for "${key}"`,
    );
  }
}

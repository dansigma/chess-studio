// SIG-1221: theme vocabulary, detection (EN + PT-BR), tags and mapping table tests.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SYNONYMS, THEMES, THEME_IDS, detectThemes, isMappedTheme, mappingTable, normalizeText, parseThemeTags, resolveThemeTag, squaresInText } from "./themes.mjs";

describe("detectThemes", () => {
  const english = [
    ["A fork on c7 wins the rook.", ["fork"]],
    ["The knight forks king and queen.", ["fork"]],
    ["The bishop pins the knight to the king.", ["pin"]],
    ["That is a skewer: the king must move.", ["skewer"]],
    ["Black's bishop is hanging.", ["hanging"]],
    ["The rook is a loose piece.", ["hanging"]],
    ["The knight is trapped on h8.", ["trapped"]],
    ["It is a back rank mate.", ["back-rank"]],
    ["White threatens mate on f7.", ["mate-threat"]],
    ["That is checkmate.", ["mate"]],
    ["A discovered attack on the queen.", ["discovered-attack"]],
    ["The sacrifice works because of the pin.", ["pin", "sacrifice"]],
  ];
  const portuguese = [
    ["Garfo de cavalo em c7.", ["fork"]],
    ["Um ataque duplo contra rei e torre.", ["fork"]],
    ["A cravação do cavalo decide.", ["pin"]],
    ["O bispo está cravado.", ["pin"]],
    ["Uma cravada na coluna e.", ["pin"]],
    ["Um espeto contra o rei.", ["skewer"]],
    ["A peça pendurada cai.", ["hanging"]],
    ["Há uma peça solta no tabuleiro.", ["hanging"]],
    ["O cavalo está aprisionado.", ["trapped"]],
    ["Mate do corredor!", ["back-rank"]],
    ["Atenção à última fileira.", ["back-rank"]],
    ["Isso cria uma ameaça de mate.", ["mate-threat"]],
    ["Xeque-mate em dois lances.", ["mate"]],
    ["Que sacrifício bonito.", ["sacrifice"]],
    ["Um ataque descoberto.", ["discovered-attack"]],
  ];
  for (const [text, expected] of [...english, ...portuguese]) {
    it(`finds ${expected.join("+")} in "${text}"`, () => {
      assert.deepEqual(detectThemes(text).themes, expected);
    });
  }

  it("is accent and case insensitive", () => {
    assert.deepEqual(detectThemes("CRAVAÇÃO").themes, ["pin"]);
    assert.equal(normalizeText("Peça  Solta!"), "peca solta");
  });

  it("does not match inside other words", () => {
    assert.deepEqual(detectThemes("The opinion of the spinner is irrelevant.").themes, []);
  });

  it("lists negated themes instead of counting them", () => {
    assert.deepEqual(detectThemes("There is no fork here."), { themes: [], negated: ["fork"] });
    assert.deepEqual(detectThemes("Aqui não há garfo, só uma cravada."), { themes: ["pin"], negated: ["fork"] });
  });

  it("reports vocabulary without a fact kind as themes, to be listed as unmapped", () => {
    const { themes } = detectThemes("A zugzwang, with a nice deflection.");
    assert.deepEqual(themes, ["deflection", "zugzwang"]);
    assert.ok(themes.every((theme) => !isMappedTheme(theme)));
  });
});

describe("tags", () => {
  it("parses [%themes], [%mustmention] and [%mustnotclaim] and strips them from the text", () => {
    const parsed = parseThemeTags("[%themes fork, Back Rank] [%mustmention fork] [%mustnotclaim pin;skewer] Nice move.");
    assert.deepEqual(parsed.themes, ["fork", "back-rank"]);
    assert.deepEqual(parsed.mustMention, ["fork"]);
    assert.deepEqual(parsed.mustNotClaim, ["pin", "skewer"]);
    assert.equal(parsed.text, "Nice move.");
    assert.deepEqual(parsed.unknown, []);
  });

  it("accepts PT-BR words as tag values and keeps unknown words", () => {
    const parsed = parseThemeTags("[%themes garfo,cravada,whatever]");
    assert.deepEqual(parsed.themes, ["fork", "pin"]);
    assert.deepEqual(parsed.unknown, ["whatever"]);
  });

  it("returns themes null when there is no tag (so text detection applies)", () => {
    assert.equal(parseThemeTags("plain comment").themes, null);
  });

  it("resolves ids, aliases and rejects nonsense", () => {
    assert.equal(resolveThemeTag("back-rank"), "back-rank");
    assert.equal(resolveThemeTag("Back Rank"), "back-rank");
    assert.equal(resolveThemeTag("espeto"), "skewer");
    assert.equal(resolveThemeTag("nonsense"), null);
    assert.equal(resolveThemeTag(""), null);
  });

  it("finds squares named in the text", () => {
    assert.deepEqual(squaresInText("Fork on C7, then Nxa8 and Rd1."), ["c7", "a8", "d1"]);
  });
});

describe("mapping table", () => {
  it("has a vocabulary entry for every theme and no entry for a missing theme", () => {
    for (const id of THEME_IDS) assert.ok(SYNONYMS[id], `no synonyms for ${id}`);
    for (const id of Object.keys(SYNONYMS)) assert.ok(THEME_IDS.includes(id), `synonyms for unknown theme ${id}`);
  });

  it("maps each mapped theme to a fact kind and flags every unmapped one with a gap", () => {
    const table = mappingTable();
    assert.equal(table.length, THEMES.length);
    for (const entry of table) {
      assert.equal(entry.mapped, entry.factKind !== null);
      if (!entry.mapped) assert.ok(entry.gap);
    }
    assert.ok(table.some((entry) => entry.id === "zugzwang" && !entry.mapped));
  });

  it("has unique ids", () => {
    assert.equal(new Set(THEME_IDS).size, THEME_IDS.length);
  });
});

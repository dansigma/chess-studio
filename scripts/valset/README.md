# Validation set runner (SIG-1221)

## Resumo (para o dono do curso)

Este diretório mede o quão bons são os **fatos** que o coach usa antes de qualquer LLM escrever uma explicação:
o extrator de fatos (garfo, cravada, espeto, peça pendurada, peça presa, mate do corredor, ameaça de mate...) e o
explicador por templates. Para isso precisamos do **seu material anotado**.

- **Formato preferido: PGN anotado**, com comentários `{...}` e símbolos (`!`, `?`, `!!`, `??`, `!?`, `?!`) como o
  autor escreveu. Pode ter várias partidas por arquivo, variantes `( ... )` e posições iniciais por `[FEN "..."]`.
  Nada precisa ser reescrito: o texto em português ou inglês é lido como está ("garfo", "cravada", "espeto",
  "peça pendurada", "peça solta", "mate do corredor", "ameaça de mate"...).
- Se quiser rotular à mão, escreva dentro do comentário: `[%themes garfo,cravada]`. Para os casos que você
  conferiu com certeza: `[%mustmention garfo]` (o extrator **tem** que enxergar) e `[%mustnotclaim cravada]`
  (o extrator **não pode** afirmar).
- Coloque os arquivos em `valset-data/` na sua máquina. **Essa pasta (e `valset-out/`) está no `.gitignore`: o
  material do curso nunca entra no repositório**, que é público.
- Para uma jogada ruim, ponha a jogada melhor do autor como primeira variante: `12. Cxe5? (12. d4)`.
- Em caso de dúvida, mande o PGN como está; o relatório lista toda palavra que não reconheceu.

## What it measures (no LLM)

1. **Extractor recall.** The author (or a hand label) names a theme, do the facts of `src/chess/facts` contain it?
2. **Unlabelled detections.** The fact predicate fires but the author named nothing. This is a precision *proxy*,
   not an error count: authors do not mention everything on the board. The hard false-positive check is
   `[%mustnotclaim]`.
3. **Template explainer contradictions.** Does any statement from `src/chess/explain` contradict the engine
   ground truth or the author? Six checkable rules, listed below.
4. Everything per theme and per phase, with the list of misses (item ids).

The course text is internal ground truth only. It is never shipped in the repository, the app, or a prompt.

## Layout

| File | Role |
| --- | --- |
| `schema.mjs` | Item format (JSDoc types) and `validateItem(s)`: rejects illegal FEN, illegal move, SAN/UCI mismatch, unknown theme. |
| `themes.mjs` | Canonical theme list, theme to fact-kind mapping with predicates, EN + PT-BR vocabulary, `[%themes]` tag parser. |
| `ingest-pgn.mjs` | Annotated PGN to items (JSONL). Uses the app's own PGN importer. |
| `uci.mjs`, `ground-truth.mjs` | Native Stockfish through UCI: MultiPV 3, eval before/after, PVs, author-disagreement flag, cache by FEN + depth. |
| `split.mjs` | Deterministic stratified dev / holdout split and the holdout lock file. |
| `metrics.mjs`, `run.mjs` | Computes facts with the app's modules, scores them, writes `report.md` and `report.json`. |
| `fixtures/` | Synthetic PGN (own positions and words), precomputed engine cache, a fake UCI engine for tests. |

The scripts import the app's TypeScript the same way the tests do, through `scripts/test-resolve.mjs`
(`node --import ./scripts/test-resolve.mjs ...`). `npm run valset:ingest|truth|split|run -- <args>` are shortcuts.

## Preparing the material

Accepted input: **annotated PGN** (`.pgn`). Every annotated main-line move becomes one item; "annotated" means it has a
`{comment}`, a hand-label tag, or a move NAG (`!`, `?`, `!!`, `??`, `!?`, `?!` or `$1`..`$6`).

| In the PGN | Becomes |
| --- | --- |
| position before the move | `fen` |
| the move | `playedMove` (`san` + `uci`) |
| the comment (tags stripped) | `authorText` |
| `?`, `??` or `?!` and a first variation `( ... )` | `authorBestMove` = first move of that variation |
| words in the comment | `themes`, through the vocabulary in `themes.mjs` (EN + PT-BR, accent-insensitive; negations such as "no fork" / "sem garfo" are not counted) |
| `[%themes a,b]` in the comment | `themes` exactly as written, **replacing** the words detected in the text (`textThemes` keeps them) |
| `[%mustmention a]` | the facts must contain `a`; a miss is reported as a hard failure |
| `[%mustnotclaim a]` | the facts must not report `a`; a hit is reported as a hard false positive |
| `[Chapter "..."]` or `[Event "..."]` | `source.chapter` |
| `[WhiteElo]`/`[BlackElo]` or `[RatingBand "1200-1599"]` | `ratingBand` (`<1200`, `1200-1599`, `1600-1999`, `2000+`, `unrated`) |
| `[Phase "opening|middlegame|endgame"]` | overrides the automatic phase (`src/chess/phases.ts`), useful for single-position games |
| `[FEN "..."]` + `[SetUp "1"]` | custom start position (puzzle-style chapters) |

Theme ids you can use in tags: `fork pin skewer hanging trapped back-rank mate-threat mate sacrifice
discovered-attack xray passed-pawn isolated-pawn doubled-pawns backward-pawn outpost open-file seventh-rank
weak-square king-safety` (mapped to a fact kind) and `deflection decoy overloading interference zwischenzug desperado
zugzwang initiative prophylaxis development space` (known, but the extractor has no fact for them yet: they are counted
and listed as *unmapped*, never dropped). A word that is neither is kept in `unknownTags` and printed by the ingest
step. Add vocabulary in `SYNONYMS` in `themes.mjs`.

**Never commit the material.** Keep PGNs, `items*.jsonl`, the engine cache of the real set and the reports under
`valset-data/` and `valset-out/` (both ignored). Reports quote snippets of the author's text: do not paste them
into issues or PRs either.

## Commands, end to end

You need a native Stockfish for the ground-truth step (`apt-get install stockfish`, `brew install stockfish`, or set
`STOCKFISH_PATH`). It is looked up as `--stockfish`, then `STOCKFISH_PATH`, then `stockfish` on `PATH` (and the usual
install dirs). Everything else, including the CI tests, runs without it.

```bash
# 1. Ingest annotated PGN into items (JSONL)
npm run valset:ingest -- valset-data/*.pgn --source "Course X" --out valset-data/items.jsonl

# 2. Engine ground truth: MultiPV 3 at depth 18, cached by FEN + depth (reruns are cheap)
npm run valset:truth -- valset-data/items.jsonl --out valset-data/items.truth.jsonl \
  --depth 18 --threshold 50 --cache valset-data/engine-cache.json

# 3. Lock the split once (about 20% holdout, stratified by phase x tactical/positional x rating band)
npm run valset:split -- valset-data/items.truth.jsonl --lock valset-data/holdout.lock.json

# 4. Measure on dev (the default); writes valset-out/report.md and report.json
npm run valset:run -- valset-data/items.truth.jsonl

# 5. Final exam, rarely: the locked holdout (or everything) needs --i-know
npm run valset:run -- valset-data/items.truth.jsonl --split holdout --i-know   # report.holdout.md
```

The same pipeline on the synthetic fixture, with no Stockfish (the engine cache is committed):

```bash
npm run valset:ingest -- scripts/valset/fixtures/synthetic.pgn --source "Synthetic fixture" --out valset-data/items.jsonl
npm run valset:truth -- valset-data/items.jsonl --out valset-data/items.truth.jsonl --depth 14 --cache scripts/valset/fixtures/engine-cache.json
npm run valset:split -- valset-data/items.truth.jsonl
npm run valset:run -- valset-data/items.truth.jsonl --split all --i-know
```

### The holdout lock

`split.mjs` orders the items of each stratum by `sha256(seed:id)` and gives each stratum its share, so the result does
not depend on file order. The holdout ids go to `holdout.lock.json`. Once that file exists, nothing re-splits: running
`split.mjs` again only applies the lock, and a different `--seed` or `--fraction` is refused. Items added later count as
dev. If a locked id disappears from the items file, the runner stops. To start over you must delete the lock by hand.

### Author vs engine

`ground-truth.mjs` flags `authorDisagrees` (threshold `--threshold`, default 50 cp) when:

- `author-move-worse-than-engine`: the author's recommended variation is more than the threshold below the engine's top line;
- `nag-bad-but-engine-fine`: the author marks the move `?`, `??` or `?!` but it costs at most the threshold;
- `nag-good-but-engine-loses`: the author marks it `!` or `!!` but it costs more than the threshold.

Treat flagged items as "needs a human look" before trusting them as ground truth.

## Reading the report

- **Per theme**: `labelled` (the author named it), `hit` (a fact matches), `recall` = hit / labelled. `unlabelled
  detections` counts items where our predicate fires and the author named nothing; `agreement` = hit / (hit + unlabelled),
  a precision proxy. `square-agree` counts hits whose fact squares overlap the squares the author named ("fork on c7").
- **Per phase**, and recall by theme x phase.
- **Misses**: item id, theme and a snippet of the author's text. Open the item in `valset-data/items.truth.jsonl`
  (it carries the FEN) to see whether the extractor, the predicate or the author's wording is at fault.
- **Hand-verified checks**: `mustMention` failures and `mustNotClaim` violations are real extractor errors.
- **Unmapped themes / unknown tags**: vocabulary the extractor cannot express yet, or words to add to the table.
- **Template explainer contradictions**: below. Each line has the rule, the item id and the statement id.

### Contradiction rules

The template explainer runs on each item with the engine line as its best line and a label derived with the app's own
`gradeMove`. Statements are then checked:

1. **R1** `best-line-wins-material`: the engine line is replayed with chess.js; contradiction if the real gain is more than one pawn below the claim.
2. **R2** `best-gives-mate`, `best-line-mates`, `sacrifice-leads-to-mate`: the engine score (before the move for the first two, after the played move for the sacrifice) must be a forced mate for the mover.
3. **R3** `allows-mate`: the engine score after the played move must be a forced mate against the mover.
4. **R4** `neutralizes-threat`: contradiction if the engine's best reply to the played move captures a piece the threat was aimed at, or delivers mate when the "parried" threat was a mate threat.
5. **R5** `sacrifice-regains-material`: contradiction if the engine says the move loses 300 cp or more against the best move.
6. **R6** any `consequences` statement (allows-*, moves-into-attack, leaves-undefended) on a move the author marked `!` or `!!`. When the item is also flagged `authorDisagrees`, this is an engine-vs-author conflict, not an extractor bug.

### Theme to fact mapping and known gaps

The mapping lives in `THEMES` in `themes.mjs` and is printed at the end of every report. Notes:

- **Back rank** has no dedicated fact. It is derived from mate-in-1 facts (a rook or queen mating a king on its own back
  rank), so longer back-rank combinations are misses by construction.
- **Hanging** requires the piece to be attacked. An author's "loose piece" (undefended, not yet attacked) is a miss; the
  fixture contains one on purpose.
- **Mate** also accepts an engine mate score after the move; **mate threat** only covers mate in 1.
- `weak-square`, `open-file` and `xray` fire on many positions, so their unlabelled counts are naturally high.
- The unmapped themes listed in the report have no fact kind at all.

## Tests and fixture

`npm test` includes `scripts/valset/*.test.mjs`: schema validation, vocabulary (EN + PT-BR) and tags, ingestion, split
determinism and the lock, UCI parsing and client (against `fixtures/fake-uci.mjs`), metric computation on the fixture
(including a deliberate miss so recall is below 100%), and the contradiction rules. A real-Stockfish smoke test runs only
when a binary is found.

`fixtures/synthetic.pgn` has 20 small games written for this repository (no text or positions from any book or course).
`fixtures/engine-cache.json` holds Stockfish 16 results at depth 14 for them, so CI needs no engine. To regenerate it,
delete the file and run step 2 of the fixture commands with a Stockfish installed.

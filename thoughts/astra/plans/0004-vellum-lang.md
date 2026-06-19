# Astra Sub-plan 0004 — vellum-lang (full-vellum grammar + dual parser)

**Status:** Plan (pre-implementation). **Phase:** 2 (shared content + UI). **Parent:** [`0000-astra-migration-roadmap.md`](./0000-astra-migration-roadmap.md).
**Date:** 2026-06-19. **Decisions in force:** C = **full vellum** (one content format for ALL akasha content); D1 = **YAML** frontmatter; D2 = **metadata-only** Python parser.
**Depends-on:** Phase 1 (libs/config, observe). **Blocks:** `0007` akasha-backend (corpus conversion) → `0011` akasha-frontend (render). **Critical path** — draft + build this first/deepest.

> Goal: grow faerrin's `@faerrin/vellum` parser (which today handles PF2e statblocks/handouts) into
> **the single authored-content format for the whole akasha setting wiki** — prose, cross-references,
> deity/stat field-lists, and the timeline — and ship it as **two parsers (TS + Python) that produce
> the same AST**, guaranteed by one shared conformance corpus. The AST is the contract; the corpus is
> the spec. Nothing in akasha renders until this lands, so it sets the big-bang date.

---

## 1. Current state (faerrin `pkg/vellum/src/render/`)

- **Pipeline** (`parse.ts:32`): `compileVss` (VSS braces `@kind "…" {…}` → `:::` directives) → `desugar`
  (sigils `@N`/`#trait`/`||redact||` → inline directives) → `remark-parse` + `remark-gfm` +
  `remark-directive` → mdast → `parseNodes` → `VellumDocument`.
- **AST** (`model.ts`): `VellumDocument { mode, nodes: (VellumBlock | VellumProse | VellumColumns)[] }`;
  6 `DocumentKind`s (statblock/hazard/item/spell/handout/edict); inline `:action`/`:trait`/`:redact`.
  Pure, total — never throws; unknown directive → prose; malformed → `ErrorChip`.
- **Spec:** `MARKDOWN.md` (the authoritative dialect doc — port + extend it).
- **Explicitly absent (per `MARKDOWN.md §7`, §4 "Not supported"):** no YAML frontmatter, no `[[wikilink]]`
  cross-references, no field/definition construct, no timeline construct, **raw HTML is inert**.

## 2. Target scope (Decision C: one format for all akasha content)

The akasha wiki has **4 page types** (research §2.1.D / §2.3) that full-vellum must own:

| Wiki page type | Today | Full-vellum construct needed |
|---|---|---|
| Prose page + YAML frontmatter (`title/tags/aliases/img`) | CommonMark body; frontmatter unparsed | **frontmatter** (parsed, typed) + existing prose |
| `[[wikilinks]]` everywhere | Obsidian-only, unparsed | **cross-reference** inline construct |
| Deity/stat pages — `**Field** :: value <br />` | informal, rendered as plain md | **field-list** construct (structured `{term,value}`) |
| `Timeline.md` — raw `<ul><li style=…>` HTML | inert (HTML not rendered) | **timeline** block construct |

**Already covered (no change):** the 6 mechanical blocks, columns, inline directives/sigils, GFM, AON
external links, heading hierarchy.

**Deliberately OUT of scope** (keeps the long pole bounded — record as boundaries):
- **Transcripts are NOT vellum.** The generated `:::transcript-line`/`::transcript-audio` pages are
  akasha-**frontend** rendering fed by **linguist** data, not stored as vellum in akasha-backend. So
  vellum-lang needs no transcript directives.
- **Raw HTML stays inert.** `Timeline.md`'s `<ul><li>` must be *converted* to `:::timeline` (in 0007),
  not preserved. vellum-lang never renders HTML (SSRF/security rule carries over).
- **Theme mode** stays external (viewer/export setting), not in-document — unchanged.
- **VSS** stays opt-in authoring sugar — unchanged.

## 3. Grammar additions (the heart of this sub-plan)

Each construct: **syntax → AST node → migration source**. All must be pure/total (never throw; degrade
to prose or `ErrorChip`), and identical across the TS and Python parsers.

### 3.1 Frontmatter
- **Syntax:** leading `---` YAML block (Obsidian/markdown norm — eases migration). Parsed via
  `remark-frontmatter` (TS) / a YAML front-block split (Py), then validated into a typed struct.
- **AST:** `VellumDocument` gains `frontmatter: Frontmatter` = `{ title?, tags: string[], aliases:
  string[], img?, … }` (Zod in TS / Pydantic in Py — the *same* schema). Unknown keys preserved in a
  `extra` bag (akasha may add `kind`, `folder`, `slug` later).
- **Source:** every prose page's `tags/aliases/title/img`. → **Open decision D1** (YAML vs KDL frontmatter).

### 3.2 Cross-reference (`[[target]]` / `[[target|alias]]`)
- **Syntax:** keep Obsidian `[[…]]` (the single most common construct in the corpus — keeping the
  syntax means the wiki migrates with ~zero link rewriting). Optional `|alias` and `#heading`.
- **AST:** new inline (PhrasingContent) node `crossref { type:"crossref", target: string, alias?:
  string, heading?: string }`. vellum-lang **parses only** — it does *not* resolve targets to URLs or
  entities. (A remark micromark extension in TS; a regex/inline-rule in Py.)
- **Resolution is a separate pass in akasha-backend** (0007), which has the page index + ontology-being:
  a `crossref` resolves to either another akasha page **or** an ontology entity, and feeds the
  backlink graph (replacing aether's `site.ts` regex backlinks). Resolution failures are akasha's to
  report, not vellum-lang's.

### 3.3 Field-list (deity/stat pages)
- **Syntax:** formalize the `**Term** :: value` convention into a real construct. Recommend a fenced
  `:::fields` block whose lines are `Term :: value` (value is inline content incl. `[[refs]]`/links):
  ```
  :::fields
  Category :: Outer God
  Edicts :: Abide by the cycles of life, aid childbirth
  Divine Raiment :: Deep red, fiery
  Domains :: [air](https://2e.aonprd.com/…), [decay](…)
  :::
  ```
- **AST:** new node `VellumFields { type:"fields", items: { term: string, value: PhrasingContent[] }[] }`
  — structured, so akasha can *query* a deity's Domains, not just render them.
- **Source:** the `**Field** :: value <br />` deity/stat pages. The 0007 converter rewrites them into
  `:::fields`. → **Open decision D3** (block `:::fields` vs a per-line `:field[…]` leaf directive).

### 3.4 Timeline
- **Syntax:** a `:::timeline` block; each entry is a list item or `---`-separated run, with an optional
  era/date marker:
  ```
  :::timeline
  - {0ag} The [[Iridescent Host]] instructs the Hierophant Aurelia to widen the crack.
  - {12ag} …
  :::
  ```
- **AST:** `VellumTimeline { type:"timeline", entries: { marker?: string, children: RootContent[] }[] }`.
- **Source:** `Timeline.md`'s styled `<ul><li><span small-caps>era</span> … [[ref]]</li>`. The 0007
  converter parses the HTML once and emits `:::timeline`.

### 3.5 AST summary (the contract)
```
VellumDocument {
  frontmatter: Frontmatter            // NEW (§3.1)
  mode: ThemeMode
  nodes: VellumNode[]
}
VellumNode = VellumBlock | VellumProse | VellumColumns
           | VellumFields            // NEW (§3.3)
           | VellumTimeline          // NEW (§3.4)
// inline PhrasingContent gains: crossref (§3.2)
```
Everything else unchanged. **TS** produces the full document; **Python** (metadata-only, D2) produces
just `frontmatter` + the `crossref` set. The full AST's JSON shape is the contract for TS; the
`{frontmatter, crossrefs}` subset is the cross-language parity contract.

## 4. Parsers (TS full + Python metadata-only) + conformance corpus

**DECIDED (D2): metadata-only Python.** TS is the full reference parser/renderer; Python extracts only
the metadata akasha needs. Strategy:

1. **`libs/ts/vellum-lang`** (the **reference impl**) — extend the existing remark pipeline; full
   `VellumDocument` AST. Consumed by akasha-frontend + vellum-frontend via gothic's renderer, and it is
   the **authority for full structural validation** of the corpus. Add plugins for frontmatter,
   `[[crossref]]`, `:::fields`, `:::timeline`.
2. **`libs/py/vellum-lang`** (**metadata-only**) — extracts just **frontmatter** + the **crossref list**
   per document (a focused YAML front-block split + a `[[…]]` scan; markdown-it-py only if needed). It
   does *not* build the full AST or validate body structure. Consumed by akasha-backend (0007) to build
   the page index + backlink graph + resolve refs.
3. **`fixtures/vellum/`** — the conformance corpus: `*.vellum` input → `*.ast.json` (full, **TS**) **plus**
   `*.meta.json` (frontmatter + crossref set). TS asserts the full AST; Python asserts the metadata
   subset; the **parity gate** checks py+ts agree on `{frontmatter, crossrefs}`. Both run in CI
   (`ts-test` + `py-test`). The corpus is the spec.
4. **Full structural validation is TS-side.** Because Python is metadata-only, the "every page parses
   cleanly as full vellum" check (0007 exit gate + akasha-frontend build) runs the **TS** parser over
   the corpus — a small **Node step** in the otherwise-Python conversion pipeline. Budget for it.
5. **Port + extend `MARKDOWN.md`** into the astra repo, kept in sync with the corpus.

**Trade accepted (D2):** ~half the parser-maintenance of full parity, at the cost of a Node validation
touchpoint in the Python pipeline and no independent Python body-structure validation. If akasha later
needs full structural parsing in Python, that work reappears (risk §8.5).

## 5. Open decisions (recommend; confirm or override)

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Frontmatter format | YAML vs KDL | **DECIDED: YAML** — Obsidian-compatible, eases migrating 100+ pages; KDL stays for config/ontology. |
| D2 | Python parser depth | full AST parity vs metadata-only | **DECIDED: metadata-only** — Python extracts frontmatter + crossrefs; TS owns full structural parse/validation (§4). |
| D3 | Field-list shape | `:::fields` block vs per-line `:field[…]` leaf | **DECIDED: `:::fields` block** — structured + queryable + clean conversion target; `::` split scoped inside the fence (no collision with inline `:` directives). |
| D4 | Transcript scope | vellum owns directives vs akasha-frontend renders from linguist | **DECIDED: akasha-frontend renders from linguist** — vellum stays authored-content only; Script/ excluded from the corpus. |

## 6. Work items

1. **Scaffold** `libs/ts/vellum-lang` (lift faerrin `src/render/parse.ts`,`surface.ts`,`vss.ts`,
   `model.ts` + tests) and `libs/py/vellum-lang` (**metadata extractor**: a Pydantic `Frontmatter` +
   `CrossRef` list; YAML front-block split + `[[…]]` scan — NOT the full AST). Wire OTel
   (`libs/{py,ts}/observe`) — parsing is hot in the 0007 conversion.
2. **AST extensions** (`model.ts` + Py mirror): add `frontmatter`, `VellumFields`, `VellumTimeline`,
   inline `crossref`. Freeze the JSON shape.
3. **Frontmatter** (§3.1): TS `remark-frontmatter` + Zod schema; Py YAML split + Pydantic schema
   (shared field set). Validate-and-preserve-extras.
4. **Cross-reference** (§3.2): TS micromark/remark extension for `[[t|a#h]]` → `crossref`; Py inline
   rule. **No resolution here.**
5. **Field-list** (§3.3): TS `:::fields` directive handler → `VellumFields`; Py equivalent. Converter
   note for 0007 (`**T** :: v` → `:::fields`).
6. **Timeline** (§3.4): TS `:::timeline` handler → `VellumTimeline`; Py equivalent.
7. **Conformance corpus** (§4): author `fixtures/vellum/*` covering all constructs + edge cases —
   `.ast.json` (full, TS-asserted) + `.meta.json` (frontmatter+crossref, Py-asserted); wire the parity
   gate (py+ts agree on `{frontmatter, crossrefs}`). Seed from real faerrin pages (one of each type).
8. **Dialect doc**: port/extend `MARKDOWN.md` into the astra repo; document the 4 new constructs +
   the OUT-of-scope boundaries (§2).
9. **Parity gate**: a `vellum-lang conformance` CI job (py + ts run the same corpus, diff ASTs).

## 7. Exit criteria

- [ ] TS parses the full corpus to the expected AST; Python extracts frontmatter+crossrefs matching TS
      on those; the **parity gate** (py+ts agree on `{frontmatter, crossrefs}`) is green in CI.
- [ ] All 4 new constructs (frontmatter, crossref, field-list, timeline) round-trip from real sample
      pages (one deity, one prose, the timeline, one statblock) into the expected AST.
- [ ] Both parsers are total — TS (structural authority) produces `ErrorChip`/prose on malformed input
      and never throws (port the faerrin totality tests); Python's metadata scan never throws either.
- [ ] `MARKDOWN.md` (astra) documents every construct + boundary; the corpus matches it.
- [ ] gothic's React renderer (0003) renders each new AST node (smoke in Storybook) — confirms the
      AST is renderable, not just parseable.

## 8. Risks

1. **Parser drift (TS↔Py)** — now **bounded** to frontmatter+crossref agreement (metadata-only Py, D2),
   a much smaller surface than full-AST parity. Mitigation: the parity gate + a fixture per construct
   *before* implementing it.
2. **`[[crossref]]` micromark extension** is the fiddliest TS piece (tokenizer-level); budget for it.
   Py side is a simpler inline regex but must match TS exactly (incl. `|alias`, `#heading`, escapes).
3. **Field-list ambiguity** — `::` already means a directive in vellum; `Term :: value` inside
   `:::fields` must not collide with `:action`/`:trait` parsing. Scope the `::` field-split to inside
   `:::fields` only.
4. **Timeline HTML conversion** (in 0007) may have per-entry quirks (inline styles, `<br/>`, nested
   refs). vellum-lang just needs a clean `:::timeline` target; the messy HTML parse is 0007's problem.
5. **TS-only structural validation (D2 chosen)** — the full-corpus "parses cleanly" check runs the TS
   parser (a Node step in the Python conversion pipeline), and Python can't independently validate body
   structure. If akasha later needs Python structural parsing, a full Python parser reappears. Accepted.

## 9. Hand-off to 0007 (akasha-backend)

0004 ships: the TS reference parser, the metadata-only Python parser, the AST contract + parity gate,
the conformance corpus, the dialect doc. 0007 then: builds the **converter** (Obsidian wiki →
full-vellum, exercising frontmatter/crossref/fields/timeline), runs the **whole ~100+ page corpus**
through the **TS** parser asserting **zero structural parse errors** (a Node validation step), uses the
**Python metadata parser** to build the page index + **resolve** crossrefs against ontology-being (the
backlink graph), and emits the build-time snapshot for akasha-frontend. The converter is where the real
"full-vellum is the long pole" effort lands; 0004 makes it *possible* by defining the target precisely.

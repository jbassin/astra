# NLSpec 0004 — vellum-lang (full-vellum grammar + dual parser)

**Status:** draft → implementing. **Phase:** 2 (shared content + UI). **Source plan:** [`../plans/0004-vellum-lang.md`](../plans/0004-vellum-lang.md).
**Process:** octo:embrace, Claude team mode (persona subagents), per astra `CLAUDE.md`. **Sequencing:** built **before** 0003 (gothic renders this AST; vellum-lang has no gothic dep — the documented critical path).
**Decisions in force:** C = full vellum (one format for ALL akasha content); D1 = **YAML** frontmatter; D2 = **metadata-only Python**; D3 = **`:::fields` block**; D4 = transcripts are NOT vellum (akasha-frontend renders them from linguist).

## Goal

Grow faerrin's `@faerrin/vellum` parser into **the single authored-content format for the whole akasha
wiki** — prose + frontmatter, `[[cross-references]]`, deity/stat field-lists, and the timeline — shipped
as **two parsers that agree**: a TS **reference** parser (full `VellumDocument` AST) and a Python
**metadata-only** extractor (frontmatter + crossref set), pinned by one shared conformance corpus. The
AST is the contract; the corpus is the spec. **Parser/AST only — the React renderer is 0003 (gothic).**

## Scope (in)

- `libs/ts/vellum-lang` (`@astra/vellum-lang`): lift faerrin's **parser** files (`model.ts`, `surface.ts`,
  `vss.ts`, `parse.ts` + their tests) — **no React** (the renderer + components stay for 0003). Extend
  the AST with the 4 new constructs; remain pure/total (never throw).
- `libs/py/vellum-lang` (`astra-vellum-lang`): a **metadata-only** extractor — `Frontmatter` (Pydantic,
  same field set as the TS Zod schema) + `CrossRef`; `extract_metadata(source)` = a YAML front-block
  split + a `[[…]]` scan. Total. Wires OTel (`libs/{py,ts}/observe`) — parsing is hot in 0007.
- `fixtures/vellum/`: the conformance corpus (`*.vellum` inputs → committed `*.ast.json` full-AST,
  TS-asserted; `*.meta.json` `{frontmatter, crossrefs}`, **both** langs assert = the parity gate).
- `MARKDOWN.md` (astra copy): port + extend the dialect doc with the 4 new constructs + boundaries.

## Scope (out)

- **The React renderer** (`mdastToReact`, `components/`, action glyphs, theme axis) → **0003 (gothic)**.
- **Crossref resolution** (target → URL/entity, backlink graph) → **0007 akasha-backend** (has the page
  index + ontology-being). vellum-lang *parses* `[[…]]`, never resolves.
- **Transcript directives** (D4), **raw HTML rendering** (stays inert — converted, not preserved, in
  0007), **in-document theme** (viewer/export setting), **VSS changes** (lifted verbatim, unchanged).
- **Full structural validation in Python** (D2) — TS is the structural authority; the 0007 "parses
  cleanly" check runs the **TS** parser (a Node step in the py pipeline).

## The 4 new constructs (syntax → AST → source)

| # | Construct | Syntax | AST | Migration source (0007) |
|---|---|---|---|---|
| 1 | **frontmatter** | leading `---` YAML block | `VellumDocument.frontmatter: { title?, tags[], aliases[], img?, extra }` | every prose page's `tags/aliases/title/img` |
| 2 | **crossref** | `[[target]]`, `[[target\|alias]]`, `[[target#heading]]` | inline `{ type:"crossref", target, alias?, heading? }` | Obsidian `[[wikilinks]]` everywhere (kept verbatim → ~zero rewrite) |
| 3 | **field-list** | `:::fields` fence, lines `Term :: value` (value = inline incl. refs/links) | `{ type:"fields", items:[{ term, value: PhrasingContent[] }] }` | deity/stat `**Field** :: value <br />` pages |
| 4 | **timeline** | `:::timeline` fence, list items `- {marker} …` | `{ type:"timeline", entries:[{ marker?, children: RootContent[] }] }` | `Timeline.md`'s `<ul><li style=…>` HTML |

**AST contract** (frozen JSON shape): `VellumDocument { frontmatter, mode, nodes: VellumNode[] }` where
`VellumNode = VellumBlock | VellumProse | VellumColumns | VellumFields | VellumTimeline`; inline
PhrasingContent gains `crossref`. Everything else (6 mechanical kinds, columns, inline
`:action`/`:trait`/`:redact` + sigils, GFM) is **unchanged**. The TS AST's JSON is the full contract;
the `{frontmatter, crossrefs}` subset is the cross-language parity contract.

## Locked technical decisions

| # | Decision | Choice & rationale |
|---|---|---|
| K1 | crossref impl (TS) | **post-parse text-node transformer** (unist visitor splitting `[[…]]` out of `text` nodes), not a micromark tokenizer extension — pure, total, far simpler; `[[…]]` never appears mid-token in the corpus, and code spans are separate node types so they're naturally skipped. |
| K2 | crossref impl (Py) | a `[[…]]` regex scan matching the **same** grammar (`target`, optional `\|alias`, optional `#heading`, with escapes) — asserted equal to TS via the shared `.meta.json`. |
| K3 | frontmatter (TS) | `remark-frontmatter(["yaml"])` → `yaml.parse` the node → **Zod** validate; unknown keys preserved in `extra`. |
| K4 | frontmatter (Py) | leading `---\n…\n---` split → `yaml.safe_load` → **Pydantic** (same field set); unknown keys → `extra`. Total: bad/absent YAML → empty frontmatter, never throws. |
| K5 | `:::fields` split | split each body paragraph at the **first** ` :: ` (space-colon-colon-space) into term/value **inline-node** runs — scoped strictly inside the `fields` directive so it can't collide with inline `:` directives (risk §3 of plan). A line without `::` → its own item with empty value (degrade, don't drop). |
| K6 | `:::timeline` entries | parse the body list; each list item's leading `{marker}` (if present) → `marker`, the rest → `children`. Non-list body → one marker-less entry wrapping the nodes (degrade, don't drop). |
| K7 | corpus parity mechanism | one committed `.meta.json` per fixture (generated by the **TS** reference), asserted by **both** TS and Py — agreeing with the shared fixture ⇒ agreeing with each other (the being-snapshot pattern). `.ast.json` (full AST) asserted by TS only. |
| K8 | fixtures location + biome | `fixtures/vellum/` at repo root (language-neutral; both read by path). Inputs use the `.vellum` extension (biome `ignoreUnknown` skips them); generated `*.ast.json`/`*.meta.json` are **excluded** in `biome.json` (generated artifacts, like `being.canonical.json`). |

## Verification — exit gate (from plan §7)

| # | Criterion | How verified |
|---|---|---|
| A | uv + bun CI lanes green over the new members (ruff/format/ty/pytest; tsc/biome/bun test/build) | run locally |
| B | TS parses the full corpus to the expected AST (`*.ast.json`) | ts test |
| C | Python extracts `{frontmatter, crossrefs}` matching the committed `*.meta.json` | py test |
| D | **parity gate**: TS and Py agree on `{frontmatter, crossrefs}` (both assert the same `*.meta.json`) | ts + py tests |
| E | all 4 new constructs round-trip from real sample pages (one deity, one prose, the timeline, one statblock) | corpus fixtures |
| F | both parsers **total** — TS yields prose/ErrorChip on malformed input + never throws (faerrin totality tests ported); Py scan never throws | tests |
| G | `MARKDOWN.md` (astra) documents every construct + boundary; the corpus matches it | review |
| H | (deferred to 0003) gothic renders each new AST node — noted as the 0003 hand-off, not gated here | — |

## Risks (from plan §8)

1. **Parser drift TS↔Py** — bounded to frontmatter+crossref agreement (D2); the shared `.meta.json` +
   a fixture-per-construct-before-implementing is the gate.
2. **crossref grammar exactness** — `|alias`, `#heading`, escapes must match between K1 and K2; covered
   by dedicated crossref fixtures (aliased, pathed, heading, escaped, adjacent, in-list).
3. **`::` collision** — scope the field-split strictly inside `:::fields` (K5); a top-level `Term :: x`
   is ordinary prose.
4. **Timeline HTML conversion** is 0007's problem — 0004 only needs a clean `:::timeline` target.
5. **TS-only structural validation** (D2 accepted) — the 0007 full-corpus check is a Node step.

## Hand-off

0004 ships the TS reference parser, the Py metadata extractor, the AST contract + parity gate, the
conformance corpus, and the dialect doc. **0003 (gothic)** then renders each AST node (its renderer
absorbs faerrin's `mdastToReact` + components and adds the 4 new constructs' components). **0007
(akasha-backend)** builds the Obsidian→full-vellum converter, runs the corpus through the TS parser
(zero structural errors), and resolves crossrefs against ontology-being into the backlink graph.

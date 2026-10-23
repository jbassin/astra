# heartwood 0020 — Phase 3 (prose proposer) — scope / pre-implementation research

- **Status:** SCOPE (verified) — ready to spec. 2026-06-28.
- **Subsystem:** heartwood (0020) · **Phase:** 3 of 5 · **builds on:** Phase 2 (extraction engine, DONE)
- **Umbrella:** `thoughts/shared/research/2026-06-27-heartwood-0020-thoughts.md` (Phase-3 section §"the prose proposer")
- **Phase-2 spec (done):** `thoughts/astra/specs/0020-heartwood-phase2-extraction-spec.md`
- **Memory:** `[[heartwood-0020-gotchas]]`

## 0. What Phase 3 is

Turn the committed per-session noun-facts (`apps/heartwood-backend/facts/<date>.json`, Phase 2) into
**proposed akasha wiki pages** — new-page drafts for new entities **and merged-rewrite diffs** that weave new
facts into existing pages — emitted as **proposal change-sets** (a committed **KDL manifest** referencing
sibling **`.vellum`** bodies). Still **read-only**: zero corpus writes, no review surface (that's Phase 4),
no deploy. Reviewed crudely by rendering the staged `.vellum` with gothic. **The make-or-break gate: the
prose must read like the hand-written house voice, not AI slop.** Judged by the stakeholder (no metric).

## 1. Resolved decisions (this scope; settle the rest in the spec)

- **P3.1 — Authorship posture: AIM FOR PUBLISHABLE PAGES.** Pursue full LLM-drafted pages good enough to
  publish with light edits; the §11 stakeholder read decides whether the voice clears the bar. *Chosen with
  eyes open:* this exact step defeated two faerrin attempts (§4) — so we port every hard-won anti-slop asset
  to maximise the odds, but we are explicitly testing whether GLM-5.2 + that craft beats the prior attempts.
- **P3.2 — First-cut scope: NEW PAGES + MERGED REWRITES** (full umbrella D3). Draft new pages for `unknown`
  entities AND merged-rewrite the existing pages that new facts touch (on 2025-8-28: 25 new / 47 update
  candidates). The merged-rewrite-of-hand-written-prose is the riskiest sub-part (voice-flattening) — it gets
  the most anti-slop care + always surfaces as a diff for the human.
- **P3.3 — Home:** extend `apps/heartwood-backend` (`astra_heartwood`); a new prose stage downstream of facts.
  No new app (the review *frontend* is Phase 4). Matches the umbrella's "heartwood-backend across Phases 2–3."
- **P3.4 — Proposal store = committed KDL manifest + sibling `.vellum` bodies** (umbrella §7, repo "KDL at the
  edges"). Manifest carries id/session/status/per-page op (create|rewrite)/target path/entity decisions/
  source-fact refs; bodies are native vellum (rendered + diffed natively). Output dir e.g.
  `apps/heartwood-backend/proposals/<date>/`.
- **P3.5 — Prose path = `call_text`** (mouthpiece precedent, §3), NOT `call_structured` (prose must not be
  tool-JSON-shaped). Anti-slop craft lives in the system prompt + a machine tell-lint (§5) + a bounded revise
  pass when lints fire.

## 2. The house voice (verified against real pages — `apps/akasha-backend/content/**.vellum`)

Present-tense, third-person, **encyclopedic-but-wry — a gazetteer**. Confident, dry, comfortable with
incompleteness ("Little is known…"). Crossrefs `[[…]]` woven into prose (3–8/page, alias form `[[X|Y]]`),
never a "See Also" list. Length varies by kind: stubs (1–2 sentences, e.g. *Pharos*, *Amber Call* one-liner),
standard bios/places (3–6 paragraphs), long lore pillars (sections + `@handout`/`@deity` blocks).

Verbatim calibration (the bar a draft must hit / the slop to avoid), from faerrin's `DRAFT_SYSTEM` (§4):
- **GOOD:** *"Sableclutch is dominated by the dockworkers and warehouse employees that ply their trade on the
  river… somewhat overlooked by the rest of the capital — whilst many of the goods that enter into the city
  start their journey in Sableclutch, the power centers of the Orgs that manage it are found elsewhere."*
  (perspectival; states a tension/consequence; specific; economical; literary em-dash asides; woven links.)
- **BAD (the slop archetype):** *"X is a large scrapyard located within the neighborhood. It is an expansive
  site featuring mountains of trash."* (encyclopedia opener; "It is…" template; filler intensifiers.)

**Vellum constructs in use** (proposer should emit plain prose + crossrefs first; constructs only where the
existing page/kind warrants): `@handout "…" { }`, `@deity "…" { }` (deity stat blocks), `@fields`,
`@timeline`, `###` headers, `[[crossref]]`, YAML frontmatter (`date`, `tags`, `aliases`, `img`, `title`).

## 3. The anti-slop generation technique (mouthpiece, verified)

- `libs/py/llm` exposes **`call_text(TextRequest)` → str** (`client.py:301`), with a truncation guard
  (`finish_reason=="length"`) and an empty-output guard. `TextRequest(user_content, system?, model?,
  max_tokens?)` (`client.py:74`). `DEFAULT_MODEL = openrouter/z-ai/glm-5.2`; call `ensure_openrouter_env()`
  (`__init__.py:85`) before any GLM call (resolves the SOPS key into env). Free-text does NOT auto-retry
  (unlike forced-tool calls) — one shot, returns or raises.
- **mouthpiece two-pass** (`apps/mouthpiece-backend/.../{prompts,script}.py`): Pass A = `call_text` free-text
  "raw imperfect transcript" to *keep the model out of the clean-output attractor*; Pass B = `call_tool`
  typesetter that is FORBIDDEN to improve the text. Pass B is chunked (`PASS_B_CHUNK_WORDS=2200`) because
  GLM structured output stalls past a few thousand words. **Voice guide injection** = a one-line `persona`
  string per host from `being.kdl`, f-string-interpolated into every prompt builder. *No separate voice-guide
  document* — the persona string IS the style contract.
- **Translation to wiki prose (recommendation, lock in spec):** the page is short, so two-pass-for-length is
  unneeded. Use **one `call_text` draft per page** carrying the distilled voice guide + GOOD/BAD calibration +
  cited facts (+ existing body when amending), then a **machine tell-lint** (§5) and a **bounded revise pass**
  (re-`call_text` "rewrite to remove these tells, same facts") only if lints fire. The "two passes" become
  draft → self-correct-against-lints, which is the anti-slop loop that fits wiki prose.

## 4. Faerrin prior art — this feature FAILED TWICE (port the lessons, not the bet)

faerrin had a full `heartwood` (TS): a 7-stage PR tool, then a careful "human-on-the-pen" rewrite. **Both were
deleted** (`e2cb11e`, "remove heartwood, failed experiment"). Recoverable via `git show e2cb11e^:<path>`.
Post-mortem `thoughts/shared/memory/heartwood-rewrite-constraints.md` (faerrin) + the extraction memo
`wiki-is-setting-not-session-log.md`.

- **The central admission: "the house voice may be partially unlearnable by LLMs."** Their response was to
  draw automation only at extraction/citation/structuring and treat the **LLM draft as a fragile starting
  point, never final copy** — and even that was abandoned. P3.1 knowingly attempts more; the anti-slop assets
  below are the hedge.
- **Their #1 failure mode (extraction over-generating events/mechanics) is ALREADY SOLVED in our Phase 2** —
  our refine taxonomy *is* their hard-won DROP-TEST. Their other failures — wrong surface (GitHub PR `+/-`
  diffs) and review burden (too many tiny proposals) — are pre-addressed by our D2/D3 (vellum-editor base,
  merged-rewrite, one change-set per session).

**Assets to port verbatim (irreplaceable):**
- `pkg/heartwood/src/pipeline/draft.ts` **`DRAFT_SYSTEM`** — the drafting prompt spine: *"Your output is a
  STARTING POINT a human editor will rewrite"*; lead with POV/tension/consequence; **no encyclopedia opener**
  (don't start "{Name} is a/an/the {type}…"); no filler intensifiers as volume; no templated "It is…" second
  sentence; **1–3 sentences**; assert ONLY cited facts (no invented specifics, no mechanics/stat-blocks); when
  amending, match the surrounding paragraph's tense/POV/naming so it reads as one continuous human paragraph;
  weave `[[wikilinks]]`. + the GOOD/BAD calibration pair (§2). + `buildUser`: Subject (+ new/amend), cited
  facts as bullets, existing body to match-and-weave-into (don't repeat), optional reviewer instruction.
- `pkg/heartwood-review/src/lib/voice-warnings.ts` — the **machine tell-lint** (§5).
- `pkg/heartwood-review/src/lib/page-type.ts` — **page-type-aware suppression**: only `lore`/`stub` face the
  prose bar; `deity-statblock` (≥2 ` :: ` lines), `timeline`, `flavor-pre` (`<pre`) don't.
- `pkg/heartwood-review/src/lib/rejection-reasons.ts` — `out-of-voice | not-canon | wrong-page | hallucinated
  | already-known` (the human's reject vocabulary; informs Phase 4 + the slop metric).
- The **merge mechanism** (maps to P3.2): faerrin used **full-body replace, frontmatter preserved**
  (`page-body.ts` `replacePageBody` keeps the `---fm---` verbatim, swaps the body) + a targeted paragraph
  weave (`commit.ts` `applyWeave`: end/into/after, anchored on current paragraph text, append-if-not-found).
  For us: the proposer emits a full rewritten `.vellum` body (frontmatter preserved) surfaced as a **diff**.

## 5. The machine tell-lint to port (faerrin `voice-warnings.ts`) — warnings, never auto-reject

Five machine-checkable warning types, run on a draft to drive the revise pass (and later surfaced to the human
in Phase 4). They are *inputs the human can overrule*, never a hard gate:
- **encyclopedia-opener** — regex `^\s*(?:\[\[)?[A-Z][\w'’ -]*?(?:\]\])?\s+is\s+(?:a|an|the)\s+\w+` ("X is
  a/an/the …" dictionary cadence).
- **it-is-template** — a second sentence matching `^it\s+is\b`.
- **intensifier** — any of: `large, vast, expansive, numerous, various, many, massive, huge, enormous`.
- **broken-wikilink** — `[[target]]` not resolving to a known page/registry entity.
- **empty** — no prose.
Page-type-aware (§4): apply the prose lints only to `lore`/`stub` bodies.

## 6. Inputs the proposer consumes (verified)

- **Facts:** `facts/<date>.json` → `SessionFacts{ facts: ResolvedFact[], refined_out, dropped }`. Each
  `ResolvedFact{ subject, kind_hint, claim, status (resolved|ambiguous|unknown), entity?: EntityRef (canonical,
  page?, kind, being?), confidence, candidates }`. **Group facts by target page:** resolved+`page` → amend that
  page; resolved+no-`page` or `unknown` → new page (placement from kind, §7); `ambiguous` → surface for the
  human, don't auto-place.
- **Existing page bodies:** `apps/akasha-backend/content/<path>.vellum` (raw vellum incl. `---`frontmatter).
  The snapshot (`apps/akasha-backend/snapshot/akasha-snapshot.json`) has page `path`/`frontmatter`/`crossrefs`
  but **NOT the body** — read the body from the content file.
- **Registry:** `astra_ontology_entity` (`resolve`, `EntityRef.page`) for crossref validation + new-entity
  registry-addition proposals (applied on approval in Phase 4, not here).

## 7. Page placement / identity (verified — `astra_ontology/entity.py`)

Path = slash-joined, no extension, no leading slash; file = `apps/akasha-backend/content/<path>.vellum`.
Kind→folder: `deity→Divinity/`, `place→Geography/`, `phenomenon→Phenomena/`, `creature→Bestiary/`,
`person→Org/<Org>/People/<Name>`, `org→Org/<Name>` (or `…/index` for a folder-owning entity). `index` page =
the folder's own entity. **New-page placement is a real sub-problem** (which Org folder does a new person go
under? top-level vs sub-folder for a deity?) — propose a best-effort path from kind + the resolved entity's
relationships, and **surface it as an editable field** (placement is cheap for the human to fix, expensive to
get silently wrong — faerrin's "wrong-page" reject reason).

## 8. Proposed architecture (settle exact shapes in the spec)

`facts/<date>.json` → **group by target page** (§6) → for each page: **draft prose** (`call_text`, voice guide
+ GOOD/BAD + cited facts [+ existing body when amending]) → **tell-lint** (§5) → **bounded revise** if lints
fire → **assemble `.vellum`** (frontmatter preserved on amend; new frontmatter on create) → **emit change-set**
(KDL manifest + `.vellum` bodies under `proposals/<date>/`). A `session_page_proposals` Dagster asset mirrors
the Phase-2 asset shape; a host CLI (`astra-heartwood-propose <date>`) mirrors `astra-heartwood-extract` for
the acceptance run. Telemetry from day one (`astra.heartwood.propose` span; pages-drafted/lints-fired metrics).
**Crude review:** a tiny script renders each staged `.vellum` via `parseDocument`→`DocumentView`
(`renderToStaticMarkup`, `resolveCrossref` omitted) to HTML for the stakeholder.

## 9. Acceptance criteria (Phase-3 gate — stakeholder qualitative read, no metric)

Run host-side on the first TSD session (`2025-8-28`, the Phase-2 artifact). Stakeholder judges:
1. **Voice** — new pages + merged rewrites read like the hand-written house voice (the GOOD bar, not the BAD
   slop archetype); the tell-lint surfaces near-zero warnings on the final drafts.
2. **Faithful merge** — a merged rewrite weaves new facts into existing prose without flattening or losing the
   human's voice; surfaced as a clean diff; frontmatter preserved.
3. **Grounding** — drafts assert only the cited facts; no invented specifics, no mechanics/stat-blocks; no
   hallucinated crossrefs (broken-wikilink lint clean).
4. **Placement** — new pages land at sensible paths; ambiguous entities are surfaced, not mis-placed.
5. **Mechanics** — change-sets parse (KDL→Pydantic), `.vellum` renders via gothic; both CI lanes green
   locally; no corpus writes / no deploy.

## 10. Decisions to settle in the spec (not blocking — recommended answers noted)

- **Draft loop shape:** single `call_text` + tell-lint + bounded revise (rec) vs literal mouthpiece two-pass.
- **Voice guide form:** a distilled prose style-guide string (the §2 characterization + GOOD/BAD pair),
  stored where? (rec: a `prompts.py` constant, mirroring mouthpiece; revisit a being.kdl/config home later.)
- **Manifest schema:** exact KDL node shape (`proposal`/`page` nodes, op, path, fact-refs, entity decisions,
  placement-confidence) — follow the `entity.kdl` explicit-walk idiom (`astra_config.kdl.load_document`).
- **Diff representation for merged rewrites:** store new full body + rely on git/render diff (rec), vs storing
  a structured diff. (faerrin used full-body replace.)
- **Page-type detection** port (lore/stub/deity-statblock/timeline/flavor-pre) — port `page-type.ts` heuristics.
- **dspy:** raw prompts to start (umbrella §7); revisit only if quality demands + labels worth authoring.
- **Stub vs full page** for a thin new entity (few facts): emit a short stub (matches the corpus) vs skip.

## 11. Risks

- **THE risk (P3.1): the voice may not clear the bar** — twice-failed. Mitigations: port every anti-slop asset;
  aim short (1–3 sentences/section, the corpus is terse); the tell-lint + revise loop; human-diff review. If
  the §11 read says the prose is slop, that is a real finding — fall back to the "fragile draft, human on pen"
  posture (the Phase-4 review surface becomes an editor) rather than forcing it.
- **Merged-rewrite voice-flattening** — rewriting hand-authored prose risks erasing its character. Mitigate:
  match-surrounding-voice prompt rule + always a diff + frontmatter preserved + keep edits minimal.
- **Placement errors** — surface path as editable; don't silently mis-place (faerrin "wrong-page").
- **GLM cost/latency** — many `call_text` calls/session (one per page + revises); ~similar to Phase-2 spend.
```

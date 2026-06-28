# 0020 — heartwood Phase 3 (prose proposer, read-only) — NLSpec

- **Status:** **DONE** (2026-06-28). All 5 slices built + pushed (`f9e3ce0` S1 … `e3a57f8` S5); live acceptance
  on `2025-8-28` (`0dfb6e0`). Stakeholder §11 read = "pass creates, harden rewrites" → **P3.9 revised from
  full-body-replace to PRESERVE-AND-APPEND** (`9c1bbd8`, + a deterministic `pov_shift` warning) and the
  change-set regenerated (`8624ff7`). Acceptance gate (§12) met: voice passes on creates + the hardened
  additive rewrites; manifest round-trips; no corpus writes; CI green. **Phase 4 = the review surface +
  write-back.** See `[[heartwood-0020-gotchas]]` for the load-bearing details + the P3.9 revision.
- **Scope doc:** `thoughts/shared/research/2026-06-28-heartwood-0020-phase3-proposer-thoughts.md` (verified)
- **Umbrella scope:** `thoughts/shared/research/2026-06-27-heartwood-0020-thoughts.md`
- **Phase-2 spec (done):** `thoughts/astra/specs/0020-heartwood-phase2-extraction-spec.md`
- **Date:** 2026-06-28 · **Subsystem slug:** `heartwood` · **Phase:** 3 of 5

## 1. Overview

Phase 3 extends `apps/heartwood-backend` (pkg `astra-heartwood`) with the **prose proposer** — the stage
downstream of Phase-2 facts that drafts **proposed akasha wiki pages** and emits them as reviewable
**proposal change-sets**. It is **read-only**: zero corpus writes, no review surface, no deploy. Pipeline:

```
facts/<date>.json (Phase 2: ResolvedFact[])
  → group       (pure code: facts → target pages; resolved+page→rewrite, resolved-no-page/unknown→create,
                 ambiguous→flag-unplaced, never auto-place)
  → STAGE A draft(LLM call_text per page: voice guide + GOOD/BAD calibration + cited facts [+ existing body])
  → STAGE B lint (pure code: machine tell-lint) → bounded REVISE (1×, LLM) if prose lints fire
  → assemble     (.vellum body: new frontmatter on create; existing frontmatter PRESERVED on rewrite)
  → emit         atomic-write proposals/<date>/{manifest.kdl, <id>.vellum …} (committed)
```

**The make-or-break gate (P3.1): the prose must read like the hand-written house voice, not AI slop.**
This exact step **failed twice in faerrin** ("voice may be partially unlearnable by LLMs", scope §4) — so we
**port every hard-won anti-slop asset** and aim short, but we are knowingly testing whether GLM-5.2 + that
craft clears the bar. Judged by the stakeholder, **no objective metric** (D9 — prose's gate is deliberately
metric-less). Architecture mirrors Phase 2 1:1 (per-session asset + host CLI + committed artifact).

## 2. Actors / components

- **The maintainer** — runs the proposer host-side for the acceptance gate (`astra-heartwood-propose <date>`;
  SOPS resolves on host; `OTEL_SDK_DISABLED=true`), then reads the staged pages and judges §11.
- **heartwood-backend** (extended) — grouping, the draft stage, the tell-lint + revise loop, the assembler,
  the emitter, the Dagster asset.
- **astra-llm** (existing) — `LiteLLMClient.call_text` (free-text prose, GLM-5.2, cost telemetry,
  `ensure_openrouter_env`). NOT `call_structured` (P3.5 — prose must not be tool-JSON-shaped).
- **astra-ontology-entity** (Phase 1) — `resolve`/`EntityRef.page` for crossref validation + new-entity flags.
- **akasha content** (read-only input) — existing page bodies `apps/akasha-backend/content/<path>.vellum` +
  the page-path set from `apps/akasha-backend/snapshot/akasha-snapshot.json` (`pages[].path`, for crossref
  validation; the snapshot has no bodies — bodies come from the content files).
- **The Dagster code location** — gains the `session_page_proposals` asset import.

## 3. The app — additions, deps

Extend the existing member `apps/heartwood-backend/`:

```
src/astra_heartwood/
  proposer/                         # the Phase-3 stage (new sub-package; keeps Phase-2 modules untouched)
    __init__.py
    models.py                       # PageProposal, VoiceWarning, ProposalManifest (§5)
    group.py                        # facts → target-page groups (§6)
    voice.py                        # VOICE_GUIDE + GOOD/BAD calibration + DRAFT_SYSTEM (ported, §7)
    draft.py                        # Stage A: call_text draft per page (§7)
    lint.py                         # Stage B: machine tell-lint + page-type detection (ported, §8)
    assemble.py                     # .vellum body assembly (frontmatter preserve/create) (§9)
    manifest.py                     # KDL manifest read/write (entity.kdl explicit-walk idiom) (§9)
    pipeline.py                     # build_session_proposals(date) + host main() (§10)
  assets.py                         # + session_page_proposals asset (extends the existing Definitions)
  proposals/                        # committed output proposals/<date>/{manifest.kdl,<id>.vellum} (.gitkeep)
```

No new deps (all present from Phase 2). **No new app, no config namespace, no frontend** (Phase 4).
`proposals/` holds `.kdl` + `.vellum` — **neither is a biome target** (biome formats JSON/JS/TS), so unlike the
Phase-2 `facts/` JSON dir, **no biome exclude is needed** (verify: existing `apps/akasha-backend/content/*.vellum`
are already un-touched by the pre-commit gate).

## 4. Locked spec-level decisions (settling scope §10)

- **P3.6 — Draft loop = single `call_text` + tell-lint + bounded revise (1×).** The page is short (the corpus
  is terse), so mouthpiece's two-pass-for-length is unneeded; the "two passes" become draft → self-correct.
  One revise attempt max (re-`call_text` "rewrite to remove these tells, same facts"); if lints still fire,
  keep the better draft and record the residual warnings for the human (warnings never hard-block — faerrin).
- **P3.7 — Voice guide = a `voice.py` constant** (the scope §2 characterization + the GOOD/BAD pair + the
  `DRAFT_SYSTEM` spine), mirroring mouthpiece's persona-in-prompt pattern. A being.kdl/config home is a later
  refinement, not Phase 3.
- **P3.8 — Manifest = KDL, `entity.kdl` explicit-walk idiom** (`astra_config.kdl.load_document`; hand-written
  serialize, stable order). Bodies are **id-named sibling `.vellum` files** (`<id>.vellum`; the page path has
  slashes, so it can't be the filename) referenced by a `body=` property.
- **P3.9 — Merged rewrite = full rewritten `.vellum` body, frontmatter preserved** (faerrin `replacePageBody`);
  the "diff" is the git/render diff against the existing content file — **no structured diff is stored**. The
  manifest records `op="rewrite"` + the source path so a reviewer (and Phase 4) can diff. **Rewrites are
  novelty-gated and voice-matched** (P3.15/P3.16).
- **P3.10 — Page-type-aware lint** (port faerrin `page-type.ts`): the prose tell-lints apply only to `lore`/
  `stub` bodies; `deity-statblock`/`timeline`/`flavor-pre` are exempt. **Phase 3 only REWRITES `lore`/`stub`
  pages** — a non-prose existing page (deity stat-block, timeline, flavor-`<pre>`) is **not rewritten**
  (skip-with-note in the manifest; a full-body `call_text` would destroy its `@deity`/`@timeline` construct).
  Those updates are deferred to the Phase-4 human surface. New deity pages still emit an `@deity` block.
- **P3.11 — Thin entity → short stub** (1–2 sentences), matching the corpus (stubs are idiomatic); never skip a
  genuine new entity that has ≥1 durable fact.
- **P3.12 — Crude review = read the committed `.vellum`** (prose is near-plain markdown; GitHub renders it via
  `.gitattributes`) and/or paste into the existing `vellum.iridi.cc` editor for full gothic render. **A
  dedicated render-for-review tool is deferred to Phase 4** (the real review surface) — Phase 3 adds no TS to
  the Python app. *(Acceptance reads prose, which is legible raw; gothic fidelity isn't required to judge voice.)*
- **P3.13 — dspy: raw prompts** (umbrella §7); revisit only if quality demands + labels worth authoring.
- **P3.14 — Ambiguous facts are NOT placed** — surfaced in the manifest `unplaced` block with candidates for
  the human; new-entity registry additions are *proposed* (manifest `registry-add`), applied on approval in
  Phase 4 (not written here).
- **P3.15 — Novelty gate on rewrites** (faerrin "already-known" failure mode). A `rewrite` proposal includes
  ONLY the cited claims the existing page does **not** already assert (a per-claim novelty check: the LLM draft
  step is told to weave in only genuinely-new facts; a page whose every fact is already covered is **skipped**,
  not rewritten). This is *within* P3.2 (still doing merged rewrites) — it just stops rewriting ~47 pages to
  inject facts they already state, which is exactly faerrin's review-burden death. Skips are counted/logged
  (`no-silent-scope-cuts`: the manifest records skipped-as-redundant), never silently dropped.
- **P3.16 — Voice is MATCH-THE-TARGET, not a fixed rule.** New pages default to the corpus voice (present-tense,
  third-person, wry-gazetteer). **Rewrites MATCH the existing page's POV, tense, naming, and spelling** — the
  corpus contains second-person pages (e.g. `Org/Iconoclasm/index` "you're a recently joined member") and
  idiosyncratic spellings (`Ilmari` vs the registry's `Illmari`); a rewrite must NOT convert 2nd→3rd person or
  silently "correct" the human's spelling. The voice guide carries **multiple calibration exemplars** (a
  3rd-person GOOD, a 2nd-person page, a terse stub), not one. The DRAFT_SYSTEM third-person line applies to
  *new* pages only.
- **P3.17 — Contradictions are FLAGGED, not silently merged.** When a cited fact contradicts the existing page
  (e.g. session-1 facts call Iconoclasm "a religious org / orphanage" while the page describes a Voidsong
  mercenary group), the proposer does **not** overwrite — it records the claim under the proposal's `conflicts`
  for the human to adjudicate (Phase 4), and the rewrite weaves only the non-conflicting new facts. Detection
  is best-effort (an LLM check "does this contradict the body?"); a missed contradiction surfaces at §12.3 review.

## 5. The artifact schemas (`proposer/models.py`)

Pydantic v2, `extra=forbid`. `EntityKind`/`ResolveStatus` imported from `astra_ontology` (single source).

```python
WarningType = Literal["encyclopedia_opener", "it_is_template", "intensifier", "broken_wikilink", "empty"]
ProposalOp  = Literal["create", "rewrite"]

class VoiceWarning(BaseModel):
    type: WarningType
    message: str                  # human-readable, ported from faerrin voice-warnings.ts
    hit: str | None = None        # the offending token/phrase, when applicable (intensifier, broken target)

class PageProposal(BaseModel):
    id: str                       # stable slug, e.g. "iconoclasm-index"; also the body filename stem
    op: ProposalOp                # create (new page) | rewrite (merged rewrite of an existing page)
    target_path: str              # akasha page path, no ext (e.g. "Org/Iconoclasm/index"), §6 placement
    canonical: str                # the resolved/registry canonical name (or the raw subject if unknown)
    kind: EntityKind | None
    status: ResolveStatus         # resolved | unknown (ambiguous never reaches a proposal → unplaced)
    page_type: Literal["lore","stub","deity-statblock","timeline","flavor-pre"]  # for lint suppression (§8)
    body_file: str                # sibling rel path "<id>.vellum"
    fact_claims: list[str]        # the NEW cited claims this page asserts (post novelty gate, P3.15; grounding set)
    conflicts: list[str] = []     # cited claims that CONTRADICT the existing body — flagged, not merged (P3.17)
    lints: list[VoiceWarning]     # residual warnings after the revise pass (empty = clean)
    placement_note: str | None = None   # why this path (esp. low-confidence/folder-less placement, §6)

class UnplacedFact(BaseModel):    # an ambiguous fact we refuse to auto-place (P3.14)
    subject: str
    claim: str
    candidates: list[tuple[str, float]]

class SkippedPage(BaseModel):     # a resolved page we did NOT rewrite — auditable, never silent (P3.10/P3.15)
    target_path: str
    reason: Literal["already-known", "non-prose-page"]   # all facts already stated | deity/timeline/flavor-pre

class RegistryAddition(BaseModel):  # proposed new entity (applied on approval in Phase 4)
    canonical: str
    kind: EntityKind | None
    suggested_path: str

class ProposalManifest(BaseModel):  # the committed change-set head (→ manifest.kdl)
    date: str
    show: str
    world: str                    # "faerrin"
    proposals: list[PageProposal]
    unplaced: list[UnplacedFact] = []
    skipped: list[SkippedPage] = []          # rewrites declined as redundant/non-prose (P3.10/P3.15)
    registry_additions: list[RegistryAddition] = []
```

> **KDL↔Pydantic naming:** manifest props/nodes are kebab-case (`page-type`, `placement-note`,
> `suggested-path`, `registry-add`); the explicit-walk reader applies `astra_config.kdl.snake()` to map them to
> snake_case fields (the `entity.py` walk doesn't auto-convert — do it explicitly; the round-trip test covers it).

- A **KDL round-trip test** (`ProposalManifest` → `manifest.kdl` text → re-parse → equal) gates the schema
  (mirrors Phase-2's JSON round-trip). The `.vellum` bodies are written/read as plain files.
- **No provenance line-citations** (P2.6 carries forward); `fact_claims` is the grounding set, not a transcript pointer.

## 6. Grouping — facts → target pages (pure code — `proposer/group.py`)

Read `facts/<date>.json` (`SessionFacts`), bucket `ResolvedFact`s by destination. **Collapse multiple facts →
one `PageProposal`** (its `fact_claims` is the union); when facts disagree on kind, use the **resolved
`entity.kind`** (for `unknown`, the majority `kind_hint`, else None).
- `status=="resolved"` & `entity.page` set → candidate **rewrite** (`target_path = entity.page`), subject to the
  **novelty gate (P3.15)** and the **non-prose / contradiction rules** below.
- `status=="resolved"` & `entity.page is None` → **create** (known entity, no page yet); placement from kind.
- `status=="unknown"` → **create** a new page + a `RegistryAddition` (placement from kind).
- `status=="ambiguous"` → **UnplacedFact** (carry candidates); no page (P3.14).

**Rewrite gating (P3.10/P3.15/P3.17), in order:**
1. If the existing page is **non-prose** (`page_type ∈ {deity-statblock, timeline, flavor-pre}`, §8) →
   **`SkippedPage(reason="non-prose-page")`**, no rewrite (don't destroy the construct).
2. Drop cited claims the page **already asserts** (novelty gate); claims that **contradict** the body → the
   proposal's `conflicts` (not merged, P3.17). The novelty/contradiction check is part of the draft step
   (the LLM sees the body + the claims and is told what to weave / what to flag) — pure-code can't judge
   semantic overlap reliably.
3. If **no new, non-conflicting claims remain** → **`SkippedPage(reason="already-known")`**, no rewrite.

**Placement** — from kind, per `astra_ontology/entity.py` `_FOLDER_KIND` + the Org special-case (scope §7):
`deity→Divinity/<Name>`, `place→Geography/<Name>/index`, `phenomenon→Phenomena/<Name>`,
`creature→Bestiary/<Name>`, `org→Org/<Name>/index`, `person→Org/<Org>/People/<Name>`. **Folder-less / uncertain
kinds carry a `placement_note` and are best-effort, never silently mis-placed** (faerrin "wrong-page" is worse
than a flagged path; the human fixes paths cheaply in Phase 4):
- **`item` has NO corpus folder** (akasha has no Items/ section) → emit with a `placement_note` and a flagged
  best-effort path (e.g. under a co-resolved owner if obvious, else `target_path` left as a `needs-placement`
  marker the human resolves). **Do NOT invent a folder** (the scope-§7 example wrongly showed `Bestiary/` for an
  item — that was an error; Bestiary = creature). `kind is None` likewise → flagged.
- **`person` Org cannot be reliably inferred** — `ResolvedFact` rows are independent (no relationship field), so
  there's no structured person→org link. Best-effort: use a co-mentioned org **only if** unambiguous in the
  fact set, else flag with a `placement_note` (e.g. `Org/Unsorted/People/<Name>`).

**id-slug (pinned):** `id = slugify(target_path)` = lowercase, `/`→`-`, spaces→`-`, strip other punctuation,
NFKD-fold Unicode to ASCII where possible but never crash on `Anaïs`/`Færrin` (keep a safe transliteration);
on collision append `-2`,`-3`,…. The id is BOTH the manifest key and the `<id>.vellum` filename — **two
distinct `target_path`s must never collapse to one id** (the collision suffix guarantees it). Examples
(consistent rule — full path, not last-N segments): `Org/Iconoclasm/index → org-iconoclasm-index`,
`Bestiary/Sentience Distributor → bestiary-sentience-distributor`.

## 7. Stage A — the draft (`proposer/draft.py` + `proposer/voice.py`)

`call_text(TextRequest(system=DRAFT_SYSTEM, user_content=<built>, model, max_tokens))` per `PageProposal`.

- **`DRAFT_SYSTEM`** (ported from faerrin `pkg/heartwood/src/pipeline/draft.ts`, scope §4) — the spine:
  *"Your output is a STARTING POINT for a hand-authored worldbuilding wiki with a strong literary voice."*
  Lead with a point of view / tension / consequence (**never** an encyclopedia opener "{Name} is a/an/the
  {type}…"); no filler intensifiers as volume; no templated "It is…" second sentence; **assert ONLY the cited
  facts** (no invented specifics, no game mechanics/stat-blocks); weave `[[wikilinks]]` for named entities.
  Length matches kind (P3.11: stub 1–2 sentences; standard 1–3 short paragraphs). Carries **multiple
  calibration exemplars verbatim (P3.16):** the 3rd-person GOOD (Sableclutch) + the BAD slop archetype (scope
  §2), plus a **second-person** corpus exemplar and a **terse stub** exemplar so GLM isn't steered into one
  narrow register. **Voice rule (P3.16):** *new* pages default to present-tense/third-person/wry-gazetteer;
  **rewrites MATCH the target page's existing POV/tense/naming/spelling** (do not convert 2nd→3rd person; do not
  "correct" the page's spelling, e.g. keep `Ilmari`).
- **`buildUser`** (ported + P3.15/P3.17): `Subject: {canonical} ({a new page | amending an existing page})`;
  `Cited facts (assert nothing beyond these):` + bulleted claims; (rewrite only) `Existing page prose (match its
  voice/POV; weave in only what is NEW; do not repeat; do NOT contradict — if a fact conflicts with the page,
  list it under CONFLICTS instead of merging it):` + the existing `.vellum` **body** (read from the content
  file, frontmatter stripped). For a rewrite the call returns the rewritten body **and** the conflict list
  (a lightweight convention — e.g. a trailing `CONFLICTS:` section the proposer parses off, or a small
  structured side-call); record conflicts on the `PageProposal` and exclude them from the woven body.
- `model = load_config().llm.default_model` (config-single-source; GLM-5.2; pricing row exists). `ensure_openrouter_env()`
  before any call. `call_text` already guards truncation + empty output (one shot, no auto-retry).

## 8. Stage B — the tell-lint + bounded revise (`proposer/lint.py`)

**Machine tell-lint** (ported verbatim from faerrin `voice-warnings.ts`, scope §5) — *warnings, never an
auto-reject* (faerrin's load-bearing principle: the human is always the gate):
- `encyclopedia_opener` — regex `^\s*(?:\[\[)?[A-Z][\w'’ -]*?(?:\]\])?\s+is\s+(?:a|an|the)\s+\w+`.
- `it_is_template` — second sentence matching `^it\s+is\b`.
- `intensifier` — any of `large, vast, expansive, numerous, various, many, massive, huge, enormous`.
- `broken_wikilink` — a `[[target]]` not resolving. **Parsing:** split each `[[target|display]]` on `|` (and
  strip a `#heading`); a **path-form** target (contains `/`, e.g. `[[Org/index|Orgs]]`) is checked against the
  **known page set**; a **name-form** target (e.g. `[[Sin and Tonic]]`) is checked via `resolve()`. Key the
  **in-batch new pages** by BOTH their `canonical` AND their `target_path`, so a crossref to a sibling page
  created in the same change-set is not a false warning. The **known page set** = the `pages[].path` list from
  `apps/akasha-backend/snapshot/akasha-snapshot.json` (∪ in-batch creates). *(Load the snapshot once; it's
  listed as a Phase-3 input in §2.)*
- `empty` — no prose.

**Page-type detection** (ported from `page-type.ts`, P3.10) gates which lints apply: `Timeline`→`timeline`;
empty-after-frontmatter→`stub`; contains `<pre`→`flavor-pre`; ≥2 ` :: ` lines→`deity-statblock`; else `lore`
(or `stub` if <40 chars). **Prose lints (`encyclopedia_opener`/`it_is_template`/`intensifier`) apply only to
`lore`/`stub`**; `broken_wikilink`/`empty` apply to all.

**Bounded revise (P3.6):** if any prose lint fires on a `lore`/`stub` draft, one `call_text` revise ("rewrite
to remove these specific tells; keep exactly the same facts and crossrefs; same length") → re-lint → keep the
cleaner of the two; record residual lints on the `PageProposal` for the human. Max 1 revise (cost-bounded).

## 9. Assemble + emit (`proposer/assemble.py` + `proposer/manifest.py`)

- **Assemble** a `.vellum` body per proposal: `create` → minimal new frontmatter (`---` with `date`/`tags: []`,
  mirroring the corpus) + the drafted prose; `rewrite` → **preserve the existing file's `---`frontmatter`---`
  verbatim** (faerrin `replacePageBody`) + the rewritten body.
- **Emit** atomically into `apps/heartwood-backend/proposals/<date>/`: `manifest.kdl` (the `ProposalManifest`)
  + one `<id>.vellum` per proposal. KDL serialize is hand-written, stable-ordered (entity.kdl precedent). Shape:
```kdl
proposal "2025-8-28" show="through-a-song-darkly" world="faerrin" {
    page "Org/Iconoclasm/index" op="rewrite" canonical="Iconoclasm" kind="org" status="resolved" \
         page-type="lore" body="org-iconoclasm-index.vellum" {
        fact "Iconoclasm provides free food and housing to new members."
        conflict "Iconoclasm functions as an orphanage."  // contradicts the page's mercenary framing (P3.17)
        lint "intensifier" message="Filler intensifier: numerous." hit="numerous"
    }
    page "needs-placement/Sentience Distributor" op="create" canonical="Sentience Distributor" kind="item" \
         status="unknown" page-type="stub" body="needs-placement-sentience-distributor.vellum" \
         placement-note="kind=item has no corpus folder; human to place (P3.6 §6)" {
        fact "The Sentience Distributor is an arcane enchanted item that spreads a signal."
    }
    unplaced canonical="Argyle" reason="ambiguous" { candidate "Argyle" score="0.71"; candidate "Anouk" score="0.64" }
    skipped target-path="Geography/Sin and Tonic/index" reason="already-known"   // every fact already stated
    skipped target-path="Divinity/Outer Gods/Eternal Pulse" reason="non-prose-page"  // @deity block; defer to P4
    registry-add canonical="Sentience Distributor" kind="item" suggested-path="needs-placement/Sentience Distributor"
}
```
- **Manifest read** uses the explicit-walk idiom (`load_document` → iterate `proposal`/`page`/`unplaced`/
  `registry-add` nodes → construct models). Round-trip tested.

## 10. The Dagster asset + host pipeline

`proposer/pipeline.py` — `build_session_proposals(date, *, client=None, model=None) -> ProposalManifest | None`
(None when `facts/<date>.json` is absent or empty), + host `main()` (argv `<date>`) → `astra-heartwood-propose`
(a second `[project.scripts]` entry alongside `astra-heartwood-extract`). Mirrors Phase-2's pipeline shape.

`assets.py` — add `session_page_proposals`, per-session partitioned on the **same `heartwood_sessions`**
partitions def, **downstream of `session_noun_facts`** (reads the committed `facts/<date>.json`):
```python
@dg.asset(partitions_def=heartwood_sessions, deps=[session_noun_facts], group_name="heartwood")
def session_page_proposals(context) -> dg.MaterializeResult:
    date = context.partition_key
    manifest = build_session_proposals(date)
    if manifest is None:
        return dg.MaterializeResult(metadata={"status": "skipped (no facts)"})
    write_change_set(PROPOSALS_DIR / date, manifest)   # atomic
    return dg.MaterializeResult(metadata={"pages": len(manifest.proposals),
        "creates": …, "rewrites": …, "unplaced": len(manifest.unplaced),
        "skipped": len(manifest.skipped), "conflicts": …, "lints": …})
```
Extend the existing `dg.Definitions(assets=[session_noun_facts, session_page_proposals])`. **Sensor/schedule
auto-wiring stays Phase 5.** The `dagster/definitions.py` import already exists (Phase 2) — no new code-location wiring.

## 11. Telemetry (from day one — `telemetry-built-in`)

- `init_telemetry("astra.heartwood")` in the asset/pipeline runtime.
- Span `astra.heartwood.propose` (attrs: pages_total, creates, rewrites, unplaced, lints_fired, revises_run).
- Metrics: `astra.heartwood.pages_drafted{op,kind}`, `astra.heartwood.lints_fired{type}`,
  `astra.heartwood.revises_run`.
- LLM cost/latency auto-emit via `LiteLLMClient`. Host run: `OTEL_SDK_DISABLED=true`.

## 12. Acceptance criteria (Phase-3 gate — stakeholder qualitative read, NO metric)

Run host-side on the **first TSD session `2025-8-28`** (the committed Phase-2 artifact). The stakeholder reads
the staged `proposals/2025-8-28/*.vellum` (raw and/or via the vellum editor) and judges:
1. **Voice (THE bar, P3.1)** — new pages + merged rewrites read like the hand-written house voice (the GOOD
   calibration, not the BAD slop archetype); the final drafts surface near-zero residual prose lints.
2. **Faithful merge** — a `rewrite` weaves new facts into existing prose without flattening/losing the human's
   voice; frontmatter preserved; diffs cleanly against the existing content file.
3. **Grounding** — drafts assert only the cited `fact_claims`; no invented specifics, no mechanics/stat-blocks;
   no broken crossrefs (`broken_wikilink` clean).
4. **Placement** — new pages land at sensible `target_path`s; `unplaced`/ambiguous entities are surfaced (not
   mis-placed); `registry_additions` are sane.
5. **Mechanics** — `manifest.kdl` round-trips (KDL→Pydantic); `.vellum` renders via gothic (spot-check in the
   vellum editor); both CI lanes green locally; **no corpus writes / no deploy**.

**If the §11 read says the prose is slop** (the twice-failed risk), that is a real finding → fall back to the
"fragile draft, human-on-pen" posture (the LLM draft is a starting point; Phase-4's surface becomes an editor),
recorded as a decision — do not force a failing voice through.

## 13. Slice plan (each independently CI-green; commit per slice, push on completion)

- **S1 — models + grouping + placement + manifest I/O (no LLM).** `proposer/models.py` (incl. `conflicts`,
  `SkippedPage`); `group.py` (facts→target pages, the kind→folder placement + item/folder-less/person flagging
  §6, the **id-slug** rule, the **non-prose skip** [needs §8 page-type], unplaced/registry-add); `manifest.py`
  (KDL read/write, explicit-walk + `snake()` mapping) + round-trip test; fixture test grouping the committed
  `2025-8-28` facts (asserts: items flagged not Bestiary-placed, deity pages skipped non-prose, slug uniqueness).
- **S2 — the tell-lint + page-type (no LLM).** `lint.py` (the 5 warnings incl. the `broken_wikilink` path/name
  parsing §8 + page-type detection, ported verbatim); unit tests over the calibration strings (BAD trips
  opener+intensifier; GOOD + the 2nd-person/stub exemplars clean) + page-type cases + a path-form crossref +
  an in-batch sibling crossref (no false warning).
- **S3 — the draft stage.** `voice.py` (VOICE_GUIDE + the multiple exemplars + DRAFT_SYSTEM, P3.16); `draft.py`
  (`call_text` per page; create vs amend user-builder incl. the **novelty + CONFLICTS** instruction P3.15/P3.17
  and the conflict-parse-off). Stub-client unit test (incl. a conflict case); live behavior verified manually.
- **S4 — revise loop + assemble + emit + asset.** wire lint→bounded revise (1×, P3.6); `assemble.py`
  (frontmatter **preserved verbatim** on rewrite — unit-tested; new frontmatter on create); the rewrite gating
  (already-known/non-prose → `SkippedPage`); `build_session_proposals` + host `main` (`astra-heartwood-propose`);
  `session_page_proposals` asset (deps on facts) + extend Definitions; atomic `write_change_set`.
- **S5 — telemetry + the acceptance run.** Domain spans/metrics (§11); host-side run on **2025-8-28**;
  stakeholder §11 judgment; verify the Dockerfile `COPY apps/heartwood-backend` still builds the dagster-code
  image (the proposals dir + new sub-package ship). Commit the produced change-set.

## 14. Out of scope (later phases)

The `heartwood.iridi.cc` **review surface** + approve/edit/reject + **write-back** (corpus writes, akasha
snapshot regen, commit, redeploy) + **applying registry additions** (Phase 4); a dedicated **render-for-review
tool** (P3.12 — Phase 4); **cross-session accumulation** (a later session keying off an earlier session's
*proposed-but-unwritten* facts — needs Phase-4 write-back + re-seed, so **Phase 5**); **backfill over all 40
faerrin sessions** (Phase 5); **sensor/schedule automation** (Phase 5); a `heartwood` **config namespace**
(Phase 4); **transcript provenance/citations** (P2.6, deferred); **dspy-optimized prompts** (P3.13, deferred).

## 15. Risks / notes

- **THE risk (P3.1): the voice may not clear the bar — twice-failed in faerrin.** Mitigations: port every
  anti-slop asset (DRAFT_SYSTEM spine, GOOD/BAD calibration, the tell-lint, page-type suppression); aim short
  (the corpus is terse); the bounded revise loop; human diff review. Fallback posture is specified (§12).
- **Merged-rewrite voice-flattening** — rewriting hand-authored prose risks erasing its character. Mitigate:
  the match-surrounding-voice prompt rule + minimal edits + always a diff + frontmatter preserved. This is the
  riskiest sub-part; weight the §11 read toward it.
- **Placement errors** — surface `placement_note`; never silently mis-place (faerrin "wrong-page").
- **LLM non-determinism → no drift gate on `proposals/`** (like `facts/` and chronicle's summaries) — only
  structural/schema tests; **do not** add a CI diff gate on proposal content.
- **GLM cost/latency** — one `call_text` per page + up to one revise; ~similar to Phase-2 spend on 2025-8-28
  (~70+ pages from 149 facts). Bound the page count if needed (log, never silently cap — `no-silent-scope-cuts`).
- **The linguist-commit timer (~15 min) broad-`git add`s untracked source + pushes** → it will grab new
  `proposer/` files and/or `proposals/*` mid-session; **fetch+rebase before pushing** (`heartwood-0020-gotchas`).
- **biome on committed output** — `.kdl`/`.vellum` are not biome targets (unlike Phase-2 JSON), so no exclude
  is needed; **verify** the pre-commit gate stays clean after the first `proposals/` commit.

## 16. Adversarial completeness pass

An independent review (`Plan` agent, verified against the real repo + the `2025-8-28` facts) drove the
revisions above. **Resolved in-spec:** non-prose page rewrites would destroy `@deity`/`@timeline` blocks →
**skip-with-note** (P3.10/§6); `item`/folder-less kinds had no placement and the scope example wrongly used
`Bestiary/` → **flagged placement, no invented folder** (§6); ~47 redundant rewrites of already-stated facts →
**novelty gate** (P3.15); a rigid third-person rule vs second-person corpus pages + `Ilmari`/`Illmari` spelling
drift → **match-the-target voice** (P3.16); cited facts contradicting the page (Iconoclasm orphanage-vs-mercenary)
→ **flag as `conflicts`, don't overwrite** (P3.17); person→org placement has no structured link → **best-effort +
flag** (§6); `broken_wikilink` path-vs-name parsing + in-batch keying + page-set source → **specified** (§8);
kebab↔snake KDL → **`snake()` in the walk** (§5); divergent kind across bucketed facts → **use `entity.kind`** (§6);
id-slug rule + collision → **pinned** (§6).

**Residual edge cases (handle in implementation; not blockers):**
- **A rewrite target whose `.vellum` file is missing** (registry `page` points to a stale path) → degrade to a
  `create` with a note, or flag; never crash.
- **Zero proposals** (all facts already-known or ambiguous) → valid empty `proposals` (with `skipped`/`unplaced`);
  the asset still writes `manifest.kdl`. No error.
- **A draft that asserts beyond the cited facts** (hallucination) → not machine-catchable; the grounding prompt
  + `fact_claims` let the human verify; §12.3 judges it. Honest limit.
- **A revise that drifts the facts** while de-slopping → the revise prompt pins "same facts/crossrefs"; re-lint
  can't catch fact drift → keep the revise minimal; the human verifies (§12.3).
- **`encyclopedia_opener` false-positive on legit corpus cadence** (a `lore` page that genuinely opens "The X
  is …") → it's a warning, not a gate (human overrules); the revise must not "fix" acceptable prose → minimal revise.
- **Non-ASCII canonical/path** (`Anaïs`, `Færrin`) → UTF-8 writes; the id-slug transliterates safely, never
  crashes; a test covers a Unicode canonical.
- **An `unknown` entity that is actually an existing page under a different surface form** (resolution missed it)
  → a duplicate page. Accept for Phase 3 (human catches it; faerrin "already-known"); cross-page dedup is Phase 5.

# 0020 — heartwood facts-only rework (retire LLM drafting) — NLSpec

**Status:** SPEC — adversarially reviewed (2 blockers + 6 minors found and FOLDED IN, 2026-07-12);
ready to implement.
**Scope doc:** `thoughts/shared/research/2026-07-12-heartwood-0020-facts-only-rework-thoughts.md`
(3-agent analysis verified against HEAD `634679e`; all stakeholder forks resolved 2026-07-12).
**Supersedes in part:** `0020-heartwood-phase3-proposer-spec.md` (the drafting half) and amends
`0020-heartwood-phase4-review-writeback-spec.md` (card layout, approve gate, conflict UI).

## 1. Overview

The stakeholder redirected heartwood before the Phase-4 content acceptance ran: **the machine must
not write wiki prose.** Creates and rewrites now present only the extracted FACTS; the human
authors every body in the review surface's editor. The proposer becomes a zero-LLM stager
(facts → group/place → manifest + skeleton `.vellum`), and the review surface becomes a writing
surface. This is the terminal step of the faerrin lesson (voice failed twice there; Phase 3's own
acceptance needed preserve-and-append hardening): **extraction stays, drafting dies.**

Everything downstream of the proposal `.vellum` files is already content-agnostic and unchanged:
`apply.py` copies body bytes verbatim, `review.kdl` holds only decision metadata, the editor
saves whatever the human writes. The rework is confined to the proposer's emit path and the
frontend cards.

## 2. Locked decisions

Stakeholder-resolved (2026-07-12, recorded in the scope doc §2):

- **FO-1** Retire drafting entirely — delete `draft.py`/`voice.py`/revise/tell-lint-at-emit; no
  flag, no dormant path. Proposer runs zero LLM calls.
- **FO-2** Editor prefill: creates = frontmatter skeleton (`---\ndate: <date>\ntags: []\n---\n\n`)
  + empty body; rewrites = the live corpus page **verbatim**. Facts visible beside the editor.
- **FO-3** Regenerate `2025-8-28` under the new shape from committed `facts/2025-8-28.json`;
  the 50 LLM bodies are discarded (git history keeps them).
- **FO-4** `voiceLint.ts` stays advisory and unchanged (its `empty` warning is now the expected
  create starting state).
- **FO-5** Approve guarded on both ops: create → disabled while the stripped body is empty;
  rewrite → disabled while the buffer is byte-identical to the live corpus page. Client-side
  button gate (single-user posture, `[[strider-editor-auth-accepted]]`).
  **⚠ The guard must gate on PERSISTED state, not buffer state** (adversarial blocker B2):
  today `EditorIsland`'s 600ms debounced save is **cancelled un-flushed on unmount**
  (`EditorIsland.tsx:37-53`), and the editor unmounts on every tab switch
  (`ProposalCard.tsx:119-133`) — so write → flip to Diff → Approve inside 600ms would pass an
  in-memory guard while `apply.py:92` later copies the still-empty skeleton off disk. Required:
  (a) flush the pending debounce on unmount (write, don't `clearTimeout`-and-drop), and
  (b) lift save status into `ProposalCard` and disable Approve while a save is pending/failed
  (`decide()` must only run against a persisted body).
- **FO-6** Delete the conflict machinery (P3.17): `conflict` manifest nodes + models (both lanes),
  `ConflictCard`, the conflicts-resolved approve term. **`review.kdl`'s `conflict-res` node stays
  in the cross-language contract** (fixture + both serializers untouched) — it just never gets
  written.

Spec-level (mine, consistent with the scope doc):

- **FO-7** The trimmed `lint.py` (only `detect_page_type` + `NON_PROSE_TYPES` +
  `PROSE_PAGE_TYPES` survive) is **renamed `page_type.py`** — the module name must not lie.
  Import ripple (adversarial blocker B1 — complete list): `group.py:20`,
  **`tests/test_proposer_group.py:12`** (a direct `proposer.lint` import the first draft missed —
  a stale import fails the ENTIRE pytest collection), the trimmed lint tests, and the
  header comments in `voiceLint.ts:1` + `voiceLint.test.ts:5` (they claim to mirror
  `proposer/lint.py`, which stops being true — point them at the retired-drafting history
  instead).
- **FO-8** Telemetry: the span `astra.heartwood.propose` keeps
  `date/pages_total/creates/rewrites/unplaced` (drops `lints_fired`/`revises_run`); the three
  dead counters (`pages_drafted`, `lints_fired`, `revises_run`) are replaced by ONE
  `astra.heartwood.pages_proposed{op,kind}`. Dagster asset metadata drops `conflicts`/`lints`.
- **FO-9** `VoiceWarningSchema`/`VoiceWarning` move out of `manifest.ts` into `voiceLint.ts`
  (its only remaining consumer). `PageProposalSchema` drops `conflicts` + `lints` **and the
  now-dead `conflicts:`/`lints:` construction in `parseManifest`'s `page` branch
  (`manifest.ts:138-146`) is deleted too** (Zod would silently strip it, but dead parse logic
  doesn't ship). `SkippedPageSchema.reason` narrows to `"non-prose-page"` (both lanes — the
  regenerated manifest is the only committed instance; no other `proposals/<date>` dirs exist).
- **FO-10** The approve predicate is extracted as a pure function
  (`canApprove(op, source, corpusBody, targetPath)` or equivalent) with its own unit test —
  the card/footer have no component-level coverage, so the gate logic must be testable without
  one.
- **FO-11** Slice ordering respects the committed-manifest coupling: the backend rework lands
  first (py lane green; the OLD committed manifest still parses fine in TS because Zod
  length-guards/defaults absent children), then the frontend rework + the regeneration + the
  `manifest.test.ts` count updates land **in one slice**, then deploy.
- **FO-12** `assemble.py` shrinks to two pure functions: `skeleton_vellum(date)` and a verbatim
  passthrough for rewrites (`read_page_text(target_path)`); the no-frontmatter-synthesize branch
  dies. `write_change_set`'s atomic/idempotent stale-`.vellum`-clearing behavior is preserved.

## 3. Backend rework (`apps/heartwood-backend`)

**Delete:** `proposer/draft.py`; `proposer/voice.py`; from `pipeline.py` —
`_draft_lint_assemble`, the per-page drafting loop, the three dead counters; from `llm.py` —
`TextClient` + `real_text_client()` (heartwood-local seam only; `astra_llm.call_text` itself is
untouched — mouthpiece uses it); from `models.py` — `VoiceWarning`, `WarningType`,
`PageProposal.{lints,conflicts}`, the `already-known` literal in `SkippedPage.reason`.

**Rework:** `lint.py` → `page_type.py` (FO-7); `assemble.py` per FO-12; `manifest.py` stops
emitting/parsing `lint` + `conflict` children; `pipeline.build_session_proposals` = load facts →
`build_proposals` → emit (skips only from P3.10 non-prose); `assets.py` metadata keys trimmed.
CLI `astra-heartwood-propose` and the Dagster asset survive with unchanged entry points.

**Tests:** delete `test_proposer_draft.py`; `test_proposer_lint.py` → `test_proposer_page_type.py`
(page-type detection only); rewrite `test_proposer_assemble.py` (skeleton create / verbatim
rewrite — assert the rewrite emit is byte-identical to the source file); trim
`test_proposer_pipeline.py` (no stub TextClients; keep no-facts-file → None +
`write_change_set` shape + a new zero-LLM assertion: `build_session_proposals` completes with no
client injected); `test_proposer_manifest.py` fixture drops lint/conflict nodes **and replaces its
`SkippedPage(reason="already-known")` entry (`test_proposer_manifest.py:80`) — the Literal
narrows, so the old value fails Pydantic validation at construction**;
`test_proposer_group.py` needs ONLY its `proposer.lint` import updated (FO-7/B1);
`test_apply_writeback.py`, `test_review.py` untouched.

## 4. Frontend rework (`apps/heartwood-frontend`)

- `manifest.ts` per FO-9.
- `ProposalCard.tsx` — **facts-first**: the facts list becomes the card's primary content block
  (it is what the human writes from); the static `pc-lints` block and the Conflicts section +
  `ConflictCard.tsx` are deleted; the Reading tab gets an empty-body placeholder for skeleton
  creates (mirror `Preview.tsx:18-22`'s empty-document message); the Diff tab is mechanically
  unchanged (fix the stale preserve-and-append doc comment in `diff.ts:1-5`).
  **Deletion ripple (adversarial minors):** `routes/review.$date.tsx:43` (drops the
  `conflictRes` prop it passes into `ProposalCard`); `setConflictResolution` in
  `serverFns/writeDecision.ts:98` is **deleted** (its only caller was `ConflictCard`; the
  `upsertConflictResolution`/`ConflictResolution` reviewState machinery stays for the FO-6
  contract); the dead conflict/lint CSS in `styles/globals.css` (`.pc-conflicts`/`.pc-lints`/
  `.pc-lint*` at ~243-269 and `.conflict-*` at ~465-494).
- `DecisionFooter.tsx` — `canApprove` per FO-5/FO-10: placement ok ∧ (create → stripped body
  non-empty; rewrite → buffer ≠ `corpusBody`). `source`/`corpusBody` flow down from
  `ProposalCard` (already present there). Disabled-button `title` copy names the blocking gate
  ("Write the page first" / "No changes to apply" / "Place the page first").
- Frontmatter stripping for the create guard reuses `@astra/vellum-lang`'s `parseFrontmatter`
  seam (total, never throws) or a minimal local fence-split — do NOT hand-roll YAML.
- `manifest.test.ts` — update exact counts against the regenerated committed manifest
  (expected: 58 proposals / 39 create / 19 rewrite / 0 skipped / 5 unplaced / 17 registry-adds;
  lint + conflict assertions deleted). `voiceLint.test.ts` import path updates only.
  `reviewState.test.ts` (cross-language fixture) must stay green UNCHANGED — it is the proof
  FO-6 didn't break the contract.

## 5. Data contracts

- **`manifest.kdl` delta:** `page` nodes lose `lint`/`conflict` children; everything else
  (head node, `page` attrs incl. `body=` filename pointer, `fact` children, `unplaced`,
  `skipped` — now only `reason="non-prose-page"` — and `registry-add`) is unchanged.
- **`review.kdl`: NO change.** Schema, both serializers, and
  `apps/heartwood-backend/tests/fixtures/review-sample.kdl` are untouched.
- **Proposal `.vellum` semantics:** create = skeleton (empty body); rewrite = byte-identical
  copy of the live corpus page. The browser editor mutates these in place (existing
  `writeProposalBody` path, unchanged); `apply.py` copies them verbatim (unchanged).

## 6. Regeneration (FO-3)

After the backend slice: `OTEL_SDK_DISABLED=true uv run astra-heartwood-propose 2025-8-28`
(host-side, zero LLM calls, instant). Verify before committing: creates are skeletons; **every
rewrite `.vellum` is byte-identical to its corpus source** (`diff` in a loop); counts match §4;
no `lint`/`conflict`/`already-known` strings anywhere in the manifest; the pre-commit gate stays
clean (`.vellum`/`.kdl` are not oxfmt targets — Phase-3 precedent). No `review.kdl` exists yet →
no migration. Commits in the same slice as the `manifest.test.ts` count update (FO-11).

## 7. Acceptance criteria (the rework's gate — NOT the D1 content acceptance)

1. **Zero-LLM proposer:** the regenerated `2025-8-28` change-set is produced with no LLM client
   constructed (unit-asserted) and matches §6's shape checks.
2. **Both CI lanes green locally** (`uv run ruff check && uv run ruff format --check &&
   uv run ty check && uv run pytest`; `pnpm exec vp run -r typecheck && pnpm run lint &&
   pnpm run format:check && pnpm exec vp run -r test && pnpm exec vp run -r build`).
3. **Live surface:** after `just up`, `heartwood.iridi.cc` renders facts-first cards for the
   regenerated set; a create card's editor opens on the skeleton; a rewrite card's editor opens
   on the live page body; the Reading tab shows the empty-state placeholder for an unwritten
   create; the Diff tab starts all-added (create) / zero-diff (rewrite).
4. **Guards fire live:** Approve disabled on an unwritten create and an untouched rewrite;
   typing prose (create) or making any edit (rewrite) enables it; an approve/reject decision
   persists to `review.kdl` and survives a reload. **The B2 race is proven closed:** type into a
   create, switch tabs immediately, and the last edit is still on disk in the proposal `.vellum`
   (flush-on-unmount), with Approve gated on save status.
5. **Contract intact:** `reviewState.test.ts` + `test_review.py` green without modification;
   `apply.py`/`justfile` diff-free.
6. **Telemetry:** `astra.heartwood` SSR spans 0-error in SigNoz post-deploy;
   `astra.heartwood.review.body_edits` increments on an editor save;
   the propose span/counter shape is unit-covered (host regen runs OTEL-disabled by convention).
7. **Docs:** Phase-3/Phase-4 spec headers annotated (superseded-in-part / amended-by pointers),
   `[[heartwood-0020-gotchas]]` + `MEMORY.md` + `RESUME.md` updated.

The **D1 content acceptance** (approve ≥1 create + ≥1 rewrite → `just heartwood-apply 2025-8-28`
→ live on akasha) then proceeds on the new surface with human-written bodies — unchanged as the
standing Phase-4 gate, out of this spec's scope.

## 8. Slice plan (each independently CI-green; commit per slice, push on completion)

- **S1 — backend proposer rework.** All §3 deletions/reworks/tests. The old committed manifest
  stays untouched; the TS lane is unaffected (verify full `uv run pytest`, not per-app — the
  basename-collision precedent).
- **S2 — frontend rework + regeneration.** All §4 changes + the §6 regen + `manifest.test.ts`
  counts, one slice (FO-11). Both lanes reproduced locally.
- **S3 — deploy + live verify + docs.** `just up` (rebuilds `heartwood` + `dagster-code` — the
  asset runs in-image), acceptance §7.3–7.6 against the live edge, then §7.7 docs/memory and
  spec status flips.

## 9. Out of scope

Phase-5 backfill/automation (unchanged, gated behind the D1 content acceptance); the D1 content
acceptance itself (follows immediately after S3, stakeholder at the pen); any re-introduction of
machine drafting or machine novelty/conflict detection; `apply.py`/`review.py`/compose/Caddy/
config.kdl/SOPS (no changes needed — verified).

## 10. Risks / notes

- **linguist-commit timer** (~15 min, broad `git add` + push): keep a clean index across slices;
  `systemctl --user stop linguist-commit.timer` during the work, restart after.
- **Regen determinism:** grouping/ids are deterministic, but confirm stable output ordering so
  the committed manifest diff is reviewable; if ordering drifts, sort at emit (no behavior
  change).
- **Byte-identity nuance (FO-5 rewrite guard):** the comparison is editor buffer vs the
  loader-supplied `corpusBody` string. Both originate as verbatim file reads; CodeMirror does not
  normalize line endings on an untouched doc. If a false-positive "changed" state appears on an
  untouched rewrite, fix the comparison (e.g. compare against the proposal body as loaded), not
  the guard. The **persisted-state race** (write → tab-switch → approve inside the debounce
  window) is a spec requirement, not a risk — see FO-5's flush-on-unmount + save-status gate.
- **Regen count expectations verified adversarially:** all 19 rewrite targets (incl. the 8
  formerly already-known) exist as real `.vellum` files in `apps/akasha-backend/content`;
  grouping is deterministic; no stale-page-pointer collisions in this set; `parseDocument` is
  total on frontmatter-only skeletons (the Reading-tab placeholder is UX, not crash-avoidance);
  the skeleton passes `_normalize_create_date` + `validate-corpus` cleanly.
- **The novelty gate's absence** means ~8 more rewrite cards per session — accepted (scope §2);
  reject/defer is the human's novelty judgment now.
- **Memory posture flip:** `[[heartwood-0020-gotchas]]` currently records "creates PASS the
  house-voice bar" as the operative posture — S3's memory update must record the retirement so a
  future session doesn't resurrect drafting from stale memory.

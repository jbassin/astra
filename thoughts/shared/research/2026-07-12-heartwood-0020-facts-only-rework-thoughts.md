# heartwood 0020 — facts-only rework (retire LLM drafting; the human writes the prose)

**Date:** 2026-07-12 · **Status:** SCOPED — all decisions resolved with the stakeholder; ready to spec.
**Builds on:** `2026-06-28-heartwood-0020-phase3-proposer-thoughts.md`,
`2026-06-28-heartwood-0020-phase4-review-writeback-thoughts.md`,
specs `0020-heartwood-phase{3-proposer,4-review-writeback}-spec.md`, memory
`[[heartwood-0020-gotchas]]`.

## 1. What & why (stakeholder direction, 2026-07-12)

Before starting the Phase-4 content acceptance, the stakeholder redirected the product shape:
**creates and rewrites should only show the FACTS — the machine must not write the prose.** The
review surface becomes a *writing* surface: heartwood extracts + groups + places the facts and
stages skeleton pages; the human authors every body in the in-browser editor.

This is the terminal step of the faerrin lesson. The feature failed twice in faerrin ("voice may
be partially unlearnable by LLMs"); Phase 3's own acceptance showed creates *passing* but rewrites
flattening the human's prose (hence preserve-and-append). The stakeholder is now retiring the
remaining LLM-prose half entirely: **extraction stays (it worked); drafting dies (it was always
the risk).** Bonus: proposer runs drop to zero LLM calls (~$0.10/session → $0).

## 2. Resolved decisions (all stakeholder-answered 2026-07-12; none open)

- **FO-1 — Retire the drafting machinery entirely.** Delete `draft.py`, `voice.py` (DRAFT_SYSTEM +
  exemplars), the revise loop, and the tell-lint-at-emit. The proposer becomes
  facts → group/place → manifest + skeleton `.vellum` emit. No flag, no dormant path.
- **FO-2 — Editor prefill = skeleton + existing body.** Creates: frontmatter skeleton
  (`---\ndate: <date>\ntags: []\n---\n\n`, today's create-branch frontmatter) with an **empty
  body**. Rewrites: the live corpus page **verbatim** (`read_page_text(target_path)` passthrough).
  Facts stay visible on the card beside the editor. (Rejected: facts inlined as body comments;
  fully-empty prefill.)
- **FO-3 — Regenerate `2025-8-28` facts-only.** Re-run the proposer under the new shape from the
  committed `facts/2025-8-28.json`; the 50 LLM-drafted bodies are discarded (git history keeps
  them). Grouping is deterministic → the regen is free and instant.
- **FO-4 — voiceLint stays advisory.** The client-side `voiceLint.ts` (live-as-you-type: prose
  tells, broken wikilinks, empty) is unchanged and never blocks. Its `empty` warning ("No prose
  written yet.") becomes the *expected* starting state for creates rather than an anomaly.
- **FO-5 — Approve is guarded on both ops.** Creates: Approve disabled while the body (frontmatter
  stripped) is empty. Rewrites: Approve disabled while the buffer is **byte-identical to the live
  corpus page** (nothing changed = nothing to apply). Client-side button gate (single-user tool,
  the `[[strider-editor-auth-accepted]]` posture); the advisory lint still shows alongside.
- **FO-6 — Delete the conflict machinery (P3.17).** Conflict claims were parsed out of the LLM
  draft output — with drafting retired nothing can populate them. Drop `conflict` nodes from the
  manifest schema + models (both lanes); delete `ConflictCard` and the conflicts-resolved Approve
  gate. **The `review.kdl` `conflict-res` node STAYS in the cross-language contract** (fixture
  `review-sample.kdl` untouched, both serializers keep it) so old/foreign review files still
  round-trip — it just never gets written by the UI.

**Accepted consequences (flagged to the stakeholder during scoping):**
- **The novelty gate (P3.15 "already-known") dies with the LLM.** The only code path that ever
  compared a rewrite's facts against the target page's prose was `draft_page` + the
  `ALREADY-KNOWN` sentinel (`draft.py:76-77` → `pipeline.py:73-74`); there is no non-LLM
  equivalent. **All rewrite candidates now surface as cards** — on `2025-8-28` that's ~8 formerly
  auto-skipped rewrites reappearing (skipped 8 → ~0; rewrites 11 → ~19). Deciding "nothing new
  here" is now the human's reject/defer call, which is coherent with the human-pen posture.
- **`pov_shift` dies** (it compared the existing page's POV against the *drafted appended
  passage* — no passage exists). The TS voiceLint never implemented it, so the surface loses
  nothing visible.
- **Create `page_type` provenance changes:** today it's re-detected post-draft
  (`detect_page_type(draft.body)`, `pipeline.py:78-82`); facts-only keeps the grouping stage's
  provisional type (`_provisional_page_type`, `group.py:106-108` — stub/lore by claim count).
  Cosmetic: the frontend parses but never renders `pageType` (grep-confirmed).

## 3. Verified current state (3-agent analysis, 2026-07-12 — line refs verified against HEAD `634679e`)

### Proposer stage graph (`apps/heartwood-backend/src/astra_heartwood/proposer/`)

`pipeline.build_session_proposals` (`pipeline.py:116-171`): `load_facts` (`group.py:237-242`) →
`build_proposals` (`group.py`, deterministic — bucketing, `place()`, `slugify`, non-prose skip
P3.10 at `group.py:154-167`) → per-proposal `_draft_lint_assemble` (`pipeline.py:53-113`:
`draft_page` **LLM** `draft.py:100` → `voice_warnings`/`pov_shift_warning` `lint.py` → optional
`revise_draft` **LLM** `draft.py:129` → `assemble_vellum` `assemble.py:15-29`) →
`write_change_set` (`pipeline.py:174-184`, atomic manifest + bodies emit). The ONLY LLM calls in
the proposer are the two `call_text`s in `draft.py`.

### What the three seams need (headline findings)

- **`apply.py` / `review.py` / `justfile heartwood-apply` / the `review.kdl` cross-language
  contract: ZERO changes.** `apply.py` reads only `p.{id,target_path,op,body_file,canonical}` +
  `registry_additions` — never `fact_claims`/`lints`/`conflicts`/`page_type`/`status` — and copies
  the proposal `.vellum` bytes **verbatim** into the corpus for both ops (`apply.py:92,105`;
  preserve-and-append was purely a propose-time property). No body validation exists that could
  reject human-authored or empty content (`validate-corpus.ts` checks directive syntax/sigil
  collisions only; frontmatter is total/optional). The E4 date normalization, non-clobber create
  guard, `committed-at` idempotence, and `_apply_registry` non-clobber merge are all
  content-agnostic. The shared fixture `review-sample.kdl` round-trips byte-identical in both
  lanes and encodes only decision metadata — untouched by this rework.
- **The manifest schema barely changes.** `body=` stays a filename pointer (bodies are carried
  out-of-band by design, `pipeline.py:44-47`). Only the `lint` and `conflict` child nodes drop
  from the emit + models (+ the TS Zod mirror). The frontend length-guards both sections, so
  ordering the slices is easy (an old frontend tolerates a new manifest and vice versa — absent
  children parse to `[]`).
- **The frontend editor/save/diff machinery already fits the new shape.** `EditorIsland` seeds
  from the proposal `.vellum` (`loadReview.ts:69`) and debounce-saves it back atomically
  (`writeProposalBody.ts:42-71` — validation is id/date/size only, content-agnostic). The Diff tab
  computes live-buffer vs `corpusBody` (read from the ro corpus mount, `fs.ts:56-59`) — under
  facts-only a rewrite's diff simply starts at zero and grows as the human writes; creates already
  label `diff (new)` and diff from empty. `review.kdl` decisions never reference body content.
- **The one real frontend gap: Approve has NO body guard today** (`DecisionFooter.tsx:42` —
  `canApprove = conflictsResolved && !needsPlacement` only). FO-5 adds the two guards; FO-6
  removes the `conflictsResolved` term.

## 4. The change, per seam

### 4a. Backend proposer (`apps/heartwood-backend`)

**Delete:** `proposer/draft.py`, `proposer/voice.py` whole; from `proposer/lint.py` everything
except `detect_page_type` + `NON_PROSE_TYPES` (+ `PROSE_PAGE_TYPES` if anything still imports it)
— consider renaming the trimmed module `page_type.py` (imports: `group.py`, `lint` tests);
from `pipeline.py` `_draft_lint_assemble` + the drafting loop + the
`_pages_drafted`/`_lints_fired`/`_revises_run` counters; from `llm.py` the `TextClient` Protocol +
`real_text_client()` (heartwood-local seam — `astra_llm.call_text` itself stays, mouthpiece uses
it); from `models.py` `VoiceWarning`, `WarningType`, `PageProposal.{lints,conflicts}`, and the
`already-known` member of `SkippedPage.reason` (only `non-prose-page` remains).

**Rework:**
- `assemble.py` → two trivial pure functions: create = frontmatter skeleton + empty body;
  rewrite = `read_page_text(target_path)` verbatim passthrough (the no-frontmatter-synthesize
  branch dies — verbatim means verbatim).
- `pipeline.build_session_proposals` — no per-page LLM stage: group → emit. `SkippedPage` only
  from P3.10. Span `astra.heartwood.propose` keeps `date/pages_total/creates/rewrites/unplaced`
  (drop `lints_fired`/`revises_run`); replace the three dead counters with one
  `astra.heartwood.pages_proposed{op,kind}` (telemetry-from-day-one — the asset still needs a
  pulse).
- `manifest.py` — stop emitting/parsing `lint` + `conflict` children.
- Dagster asset `session_page_proposals` (`assets.py:41-65`) — internals unchanged (it calls
  `build_session_proposals`/`write_change_set`); drop the `conflicts`/`lints` metadata keys.
  CLI entry `astra-heartwood-propose` unchanged.

**Tests:** delete `test_proposer_draft.py`; trim `test_proposer_lint.py` to page-type detection;
rewrite `test_proposer_assemble.py` for skeleton/verbatim semantics; trim
`test_proposer_pipeline.py` (no stub TextClients — keep no-facts-file + `write_change_set` shape);
`test_proposer_manifest.py` fixture drops lint/conflict nodes; `test_proposer_group.py` unchanged.
`test_apply_writeback.py`/`test_review.py` unchanged (their synthetic manifests carry no
lint/conflict nodes — verified).

### 4b. Frontend (`apps/heartwood-frontend`)

- `manifest.ts` — drop `conflicts` + `lints` from `PageProposalSchema`; move `VoiceWarningSchema`
  (still used by `voiceLint.ts`) into `voiceLint.ts` or a shared types module.
- `ProposalCard.tsx` — **facts-first layout**: promote the facts list to the card's primary
  content (it's what the human writes *from*); delete the static `pc-lints` block (manifest lints
  gone; the live editor lint bar stays) and the Conflicts section + `ConflictCard`; Reading tab
  gets an empty-body placeholder for skeleton creates (mirror `Preview.tsx:18-22`); Diff tab
  unchanged mechanically (update the stale preserve-and-append doc comment in `diff.ts:1-5`).
- `DecisionFooter.tsx` — `canApprove` becomes: placement ok ∧ (create → stripped body non-empty;
  rewrite → buffer ≠ `corpusBody`). Needs `source`/`corpusBody` passed down from `ProposalCard`
  (both already live there as state/props). Disabled-title copy explains which gate blocks.
- `voiceLint.ts` — untouched (FO-4).
- `manifest.test.ts` — update the exact-count assertions against the regenerated `2025-8-28`
  manifest (proposals ~58, rewrites ~19, skipped ~0, lints field gone); `reviewState.test.ts`,
  `writeProposalBody.test.ts`, `diff.test.ts`, `ssrSmoke.test.ts` unaffected.
- No component-level tests exist for the card/footer (SSR smoke only) — add at least a unit for
  the new `canApprove` predicate (pure function, extract it).

### 4c. Regenerate `2025-8-28` (FO-3)

Host-side `OTEL_SDK_DISABLED=true uv run astra-heartwood-propose 2025-8-28` after the backend
slice — zero LLM calls, instant. Expected deltas: creates 39 (unchanged), rewrites 11 → ~19
(the already-known skips resurface), skipped 8 → ~0, unplaced 5 + registry-adds 17 (unchanged),
no lint/conflict nodes, all create bodies skeleton, all rewrite bodies byte-identical to the live
corpus. `.vellum`/`.kdl` are not oxfmt/oxlint targets (Phase-3 precedent — verify the pre-commit
gate stays clean anyway). No `review.kdl` exists yet (review never started) → no migration.

## 5. Explicitly unchanged (verified, don't touch)

`apply.py` + `review.py` + `justfile` recipe + `review-sample.kdl` fixture + both `reviewState`
serializers; `writeProposalBody` server-fn + `fs.ts`; the editor island/CodeMirror port; the
Compose unit/mounts/Caddy (`user: "1000:1000"`, rw proposals mount, ro corpus mount); Phase-2
extraction end-to-end; `entity.kdl` registry machinery; the Dagster sensor/partition wiring.

## 6. Risks / gotchas to carry into the spec

- **The linguist-commit timer** sweeps staged files + pushes every ~15 min — keep a clean index;
  `systemctl --user stop linguist-commit.timer` during multi-commit work, restart after.
- **Slice ordering for the committed-manifest coupling:** `manifest.test.ts` reads the real
  committed `proposals/2025-8-28/manifest.kdl` with exact counts. Regen + TS-test update must land
  in the same slice (or regen last). Zod tolerates absent children → the schemas themselves don't
  force ordering.
- **Deploy ripple:** frontend → rebuild `heartwood` container; proposer → rebuild `dagster-code`
  (the asset runs in-image). Both covered by `just up`; no config.kdl/Caddy/SOPS change.
- **The trimmed `lint.py` module name lies** — decide rename (`page_type.py`) in the spec; it's a
  2-import ripple (`group.py`, tests).
- **Docs debt:** Phase-3/-4 spec headers + `[[heartwood-0020-gotchas]]` must record the rework
  (the memory currently says "creates PASS the house-voice bar" as the operative posture).

## 7. Slice sketch (spec to finalize)

- **S1 — backend proposer rework** (py lane green; committed old manifest untouched, TS green).
- **S2 — frontend rework + regen `2025-8-28` + `manifest.test.ts` counts** (both lanes green).
  Could split regen into its own slice if S2 grows; the coupling says regen ships WITH the TS
  test update.
- **S3 — deploy (`just up`) + live verify** (facts-first cards render, editor prefill both ops,
  approve guards fire, decision persists to `review.kdl`) + docs/memory update.

Acceptance stays Phase 4's D1 gate, now with the human pen: the content acceptance
(approve ≥1 create + ≥1 rewrite → `just heartwood-apply 2025-8-28` → live on akasha) runs on
human-written bodies.

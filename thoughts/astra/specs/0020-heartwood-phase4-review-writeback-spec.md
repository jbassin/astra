# 0020 — heartwood Phase 4 (review surface + write-back) — NLSpec

> **⚠ AMENDED (2026-07-12)** by `0020-heartwood-facts-only-rework-spec.md` (COMPLETE): cards are
> facts-first and the HUMAN writes every body (creates open on a skeleton, rewrites on the live
> page verbatim); Approve is gated on placement ∧ persisted save ∧ real content; the conflict UI
> and manifest lint/conflict nodes are gone (the review.kdl contract kept `conflict-res`). The
> §11 content acceptance below still stands, now on human-written bodies.

- **Status:** **BUILT + SURFACE LIVE** (2026-06-28) — all 6 slices implemented, CI-green, committed + pushed
  (`7484900` S1 … `142af2e`/`db42c1a` S5); the review surface is live on `https://heartwood.iridi.cc`
  (`astra.heartwood` 0-error SSR spans in SigNoz). The adversarial pass's 3 blockers + 4 edge-cases (§15) were
  all folded into the build (the `user: "1000:1000"` bind-mount fix verified, `uv run akasha-snapshot`, the
  hand-rolled cross-language KDL writer round-tripping byte-identical both lanes). **The ONLY remaining step
  is the human-gated content acceptance** (§11 — Josh approves pages in the live surface → `just
  heartwood-apply 2025-8-28` → live on akasha); that is the D1 gate, not an autonomous step. See
  `[[heartwood-0020-gotchas]]`.
- **Scope doc:** `thoughts/shared/research/2026-06-28-heartwood-0020-phase4-review-writeback-thoughts.md` (verified)
- **Umbrella scope:** `thoughts/shared/research/2026-06-27-heartwood-0020-thoughts.md` (D1–D10)
- **Consumes:** the Phase-3 change-set contract — `thoughts/astra/specs/0020-heartwood-phase3-proposer-spec.md` §5/§9
- **Phase-2 spec (done):** `thoughts/astra/specs/0020-heartwood-phase2-extraction-spec.md`
- **Memory:** `[[heartwood-0020-gotchas]]`
- **Date:** 2026-06-28 · **Subsystem slug:** `heartwood` · **Phase:** 4 of 5

## 1. Overview

Phase 4 makes the human gate real. It is the first heartwood phase that **writes** to the corpus. Two new
deliverables sit on either side of a deliberate **browser-decides / host-applies** boundary (P4.1):

```
PUBLIC  apps/heartwood-frontend  (bun SSR, heartwood.iridi.cc, port 10371, no auth)
  /                read proposals/<date>/ → session index (per-session review progress)
  /review/$date    render the change-set as PR-style cards:
       render proposal (gothic DocumentView) · facts · lints · status · op
       Edit tab  (CodeMirror island) ──server-fn──▶ proposals/<date>/<id>.vellum   (rw mount)
       Diff tab  (proposed .vellum vs content/<path>.vellum, ro mount — additive)
       place needs-placement/unplaced (folder picker) · adjudicate conflicts (Accept/Reject)
       approve / reject(tagged) / defer ──server-fn──▶ proposals/<date>/review.kdl  (rw mount)

HOST    just heartwood-apply <date>   (human-run; the only host-privileged step)
  1. read review.kdl (approved decisions) + manifest.kdl
  2. create  → write   content/<path>.vellum   (no-overwrite)
     rewrite → overwrite content/<path>.vellum  (full preserve-and-append body)
  3. approved registry-add → entity.kdl  (merge_seed, non-clobbering)
  4. regen the akasha snapshot  (akasha-backend write_snapshot)
  5. git add <those paths> ; fetch+rebase ; commit ; push   (path-scoped)
  6. docker compose up -d --build akasha-frontend            (live)
  7. stamp committed-at back into review.kdl                 (idempotence)
```

**Why the split (P4.1):** the heartwood review app is a public, no-auth container; the corpus, git, docker,
and snapshot-regen live on the host. A containerized server-fn cannot safely reach them — **strider's editor
proves it** (it writes the *container's* ephemeral fs; gated `local_only`). So the public app's only write
power is a **narrow rw bind-mount of `apps/heartwood-backend/proposals/`**; the dangerous operation (commit +
redeploy) is a **human-run host recipe**, reusing the established **linguist-commit-timer** posture (host
owns commit + redeploy). No docker socket, no full-repo mount in a public container.

**The standing lesson (`[[heartwood-0020-gotchas]]`):** this feature **failed twice in faerrin**, including a
full PR-review surface (`pkg/heartwood-review`, deleted in faerrin `e2cb11e`). Phase 4 **ports faerrin's
review/editorial workflow** (the part worth keeping) and **does not** re-introduce its prose pipeline (Phase
3 owns prose; the §11 verdict already retired the prose risk — creates pass, rewrites are preserve-and-append).

## 2. Actors / components

- **The worldbuilder (maintainer)** — opens `heartwood.iridi.cc/review/<date>`, edits/approves/rejects each
  proposal, places ambiguous pages, adjudicates conflicts; then runs `just heartwood-apply <date>` host-side
  and confirms the pages are live on `akasha.iridi.cc`.
- **heartwood-frontend** (new bun app) — the SSR review surface: routes, the proposal cards, the CodeMirror
  editor island (ported vellum-editor base), the diff, the placement picker, the conflict card, the write
  server-fns. **Reads proposals + corpus at request time** (P4.7) — not build-time-baked (unlike akasha).
- **heartwood-backend** (extended, Python) — gains `apply.py` (the write-back logic) + a `review.py` KDL
  reader/writer for `review.kdl` + the `astra-heartwood-apply` CLI. Reuses the Phase-3 `proposer/manifest.py`
  reader for `manifest.kdl`.
- **akasha-backend** (read for diff via the frontend; written by apply) — `content/<path>.vellum` bodies +
  `snapshot/akasha-snapshot.json` (page-path set for crossref/slug; **no bodies**) + `write_snapshot()`
  (the snapshot regen the apply recipe calls).
- **ontology-entity** (Phase 1) — `entity.kdl` + `merge_seed`/`serialize_entities` (the non-clobbering
  registry write the apply recipe uses for approved `registry-add`s).
- **The host edge + deploy** — `config.kdl` (`heartwood` namespace), the Dockerfile sibling ripple, the
  Compose unit + bind-mounts, the Caddy block, the `just heartwood-apply` recipe, the akasha redeploy.

## 3. The apps — additions, deps

### 3a. `apps/heartwood-frontend` (new bun app, the review surface)

Templated from the ledger/vellum shell (strider template; backend-less SSR). Shell files reused verbatim
(`server.ts`, `vite.config.ts` with `gothicFontsPlugin` + `--configLoader runner`, `tsconfig.json`,
`router.tsx`, `__root.tsx`, `scripts/generate-routes.ts`, `Dockerfile`, `src/observe/`). New domain:

```
apps/heartwood-frontend/
  package.json                      # deps: @tanstack/react-{router,start}, react@19, codemirror,
                                    #   @astra/{gothic,vellum-lang,site-kit,observe,config}, @bgotink/kdl
  server.ts · vite.config.ts · tsconfig.json · Dockerfile      # SHELL (templated)
  scripts/generate-routes.ts
  src/
    router.tsx · routes/__root.tsx · observe/                  # SHELL
    routes/
      index.tsx                     # session index (lists proposals/<date>/)
      review.$date.tsx              # the change-set review surface (SSR list of cards)
    domain/
      review/
        manifest.ts                 # Zod-validated KDL reader for manifest.kdl (@bgotink/kdl) (§5)
        reviewState.ts              # Zod model + KDL read/write for review.kdl (§5)
        diff.ts                     # additive line-diff (proposed .vellum vs corpus body) (§6)
        voiceLint.ts                # TS mirror of proposer/lint.py (live edit checks, page-type-aware) (§6)
        fs.ts                       # the bind-mount roots + traversal-guarded read/write (server-only) (§7)
      components/
        ProposalCard.tsx            # Edit/Reading/Diff tabs + approve/reject/defer (ported) (§6)
        EditorIsland.tsx            # ClientOnly CodeMirror + live gothic Preview (ported vellum editor) (§6)
        ConflictCard.tsx            # Accept/Reject a contradicting fact (ported) (§6)
        PlacementPicker.tsx         # folder/target-path picker for needs-placement/unplaced (ported) (§6)
        RejectMenu.tsx              # tagged rejection-reason picker (ported) (§6)
      serverFns/
        loadReview.ts               # createServerFn: read manifest + bodies + corpus + review.kdl (§7)
        writeProposalBody.ts        # createServerFn: persist an edit to proposals/<date>/<id>.vellum (§7)
        writeDecision.ts            # createServerFn: upsert a decision/conflict-res into review.kdl (§7)
    styles/globals.css
```

### 3b. `apps/heartwood-backend` additions (Python — the host write-back)

```
src/astra_heartwood/
  review.py                         # ReviewState model + review.kdl explicit-walk read/write (§5)
  apply.py                          # apply_change_set(date, *, dry_run): corpus writes + entity.kdl + stamp (§8)
  # + [project.scripts] astra-heartwood-apply = "astra_heartwood.apply:main"
```

`apply.py` reuses `proposer/manifest.py` (read `manifest.kdl`), `astra_ontology_entity` (`merge_seed`,
`serialize_entities`), and `astra_akasha_backend` (`write_snapshot`). No new Python deps.

### 3c. Deploy wiring (config-single-source + the ripple)

- **config.kdl** `heartwood` namespace + **both** schemas (`HeartwoodConfig` Pydantic, `Heartwood` Zod),
  port **10371** (verified free), `public-origin "https://heartwood.iridi.cc"` (§9).
- The **11-sibling Dockerfile manifest ripple** (add `COPY apps/heartwood-frontend/package.json …` to every
  existing frontend Dockerfile — the `--frozen-lockfile` gate) + `pyproject.toml exclude` += the new app (§9).
- A backend-less Compose unit **plus the bind-mounts** (the heartwood departure, §9): `proposals/` rw,
  `apps/akasha-backend/content` ro, the akasha snapshot ro.
- `sites.caddyfile` `heartwood.iridi.cc` block; the `*.iridi.cc` wildcard (try first — no manual DNS, the
  ledger surprise) (§9).
- The `just heartwood-apply` recipe + the akasha redeploy (§8/§9).

## 4. Locked spec-level decisions

The four stakeholder forks (P4.1–P4.4) and the 14 derived decisions (P4.5–P4.18) are recorded in full in the
scope doc §2. The load-bearing ones the implementation must honor:

- **P4.1 — Browser decides, host applies.** Public app → `review.kdl` (narrow rw mount); `just
  heartwood-apply` does the real corpus write + snapshot + commit + redeploy. No docker socket / full-repo
  mount in the public container.
- **P4.2 — Full in-browser editor.** Port the vellum-editor base (CodeMirror + live gothic `DocumentView`) +
  faerrin's Edit/Reading/Diff tabs; the human edits a proposed `.vellum` in place before approving.
- **P4.3 — Per-session `review.kdl`.** Resumable per-proposal decisions; **no cross-session rejection
  memory** (Phase 5).
- **P4.4 — Acceptance = end-to-end live on akasha.** Approve ≥1 create + ≥1 rewrite → full write-back →
  pages live on `akasha.iridi.cc`.
- **P4.5 — The edit buffer is the proposal `.vellum` itself.** In-browser edits overwrite
  `proposals/<date>/<id>.vellum`; `review.kdl` stays metadata-only (no prose duplicated into KDL). Apply
  copies the (edited) proposal body to the corpus.
- **P4.6 — Rewrite write-back = whole-file overwrite.** The rewrite `.vellum` already contains the full page
  (existing frontmatter + body verbatim + appended passage, P3.9); apply overwrites the corpus file. Diff =
  proposed vs current corpus file (additive).
- **P4.7 — Surface reads at runtime** (server-fns over bind-mounts), not build-time-baked.
- **P4.8 — Registry-add is non-clobbering, host-side** (`merge_seed`; `seed --check` drift gate). Closes the
  "world builds on itself" loop — a session's discovered entities become resolvable for the next session
  **after** this approval.
- **P4.9 — `needs-placement`/`unplaced` are human-placed** in the surface (editable `target-path` + folder
  picker; the candidate list shown). Apply honors `review.kdl`'s `target-path` over the manifest's.
- **P4.10 — Conflicts are adjudicated, not auto-merged** (`ConflictCard` Accept/Reject → `review.kdl`).
  *(No `conflict` nodes on `2025-8-28` — built + tested on a synthetic fixture, P4-risk.)*
- **P4.11 — No auth (D5).** The dangerous step is host-side + human-run.
- **P4.12 — `heartwood` config namespace, port 10371.**
- **P4.13 — App `heartwood-frontend`** (sibling of `heartwood-backend`).
- **P4.14 — Render via gothic in-process; no `vellum-render` PNG service** (satisfies P3.12).
- **P4.15 — Coordinate with the linguist-commit timer:** apply is path-scoped + fetch/rebase before push;
  reuses the timer's akasha redeploy line. **Decide the timer's content-watch in §8.**
- **P4.16 — Telemetry from day one** (SSR + RUM spans `astra.heartwood`; write-fn span/counter; apply runs
  host-side `OTEL_SDK_DISABLED=true`).
- **P4.17 — Voice lint is advisory** (never blocks approve; a TS mirror re-runs live as the human edits).
- **P4.18 — Residual review-territory items are human-corrected here, not auto-fixed** (false-link,
  hallucination, no-`kind_hint`). No resolver tuning in Phase 4.

## 5. The data contracts

### 5a. `manifest.kdl` reader (TS, new — `domain/review/manifest.ts`)

The Phase-3 spec §5/§9 is authoritative for the schema; Phase 4 adds the **TS** reader (the frontend is bun).
Parse with `@bgotink/kdl` (the build-time devDep strider uses for layers, `[[strider-layers-kdl]]`), validate
into a Zod model mirroring the Pydantic `ProposalManifest`. **kebab→camel** mapping is explicit (the KDL is
kebab-case: `page-type`, `placement-note`, `suggested-path`, `registry-add`). Nodes/attrs to read (verified
against the real `2025-8-28` manifest — 50 `page`, 4 `unplaced`, 8 `skipped`, 18 `registry-add`, 4 `lint`,
**0 `conflict`**):

```ts
type ProposalOp = "create" | "rewrite";
type ResolveStatus = "resolved" | "unknown";
type PageType = "lore" | "stub" | "deity-statblock" | "timeline" | "flavor-pre";

interface PageProposal {
  id: string;               // body filename stem; the review key
  op: ProposalOp;
  targetPath: string;       // akasha page path, no ext
  canonical: string;
  kind: string | null;      // EntityKind | absent
  status: ResolveStatus;
  pageType: PageType;
  bodyFile: string;         // "<id>.vellum"
  facts: string[];          // child `fact` nodes
  conflicts: string[];      // child `conflict` nodes (P4.10)
  lints: { type: string; message: string; hit: string | null }[];  // child `lint` nodes (advisory)
  placementNote: string | null;
}
interface UnplacedFact { subject: string; claim: string; candidates: [string, number][]; }
interface SkippedPage { targetPath: string; reason: "already-known" | "non-prose-page"; }
interface RegistryAddition { canonical: string; kind: string | null; suggestedPath: string; }
interface ProposalManifest {
  date: string; show: string; world: string;
  proposals: PageProposal[]; unplaced: UnplacedFact[];
  skipped: SkippedPage[]; registryAdditions: RegistryAddition[];
}
```

A **fixture round-trip test** parses the committed `proposals/2025-8-28/manifest.kdl` and asserts the counts
above (the schema-conformance gate; the manifest is read-only here — no re-emit on the TS side).

### 5b. `review.kdl` — the proposal store (TS write + Python read; cross-language contract)

One per session: `apps/heartwood-backend/proposals/<date>/review.kdl`. **Metadata only** (P4.5 — prose lives
in the `.vellum`). Written by the frontend (Zod model + a **hand-rolled KDL serializer**), read by `just
heartwood-apply` (Python explicit-walk). **Both sides have a parser; a shared fixture round-trips both ways**
(the contract gate).

> **KDL emit from TS is net-new (B3).** Repo-wide, `@bgotink/kdl` is only ever **`parse`d** (`libs/ts/config/
> src/kdl.ts`, `libs/ts/ontology`, `strider/scripts/build-content.ts`); strider's KDL *write* is a hand-rolled
> string serializer (`apps/strider/src/domain/lib/editorHelpers.ts` `kdlNode`/`kdlString` — quote/space
> escaping). **Base the `review.kdl` writer on that pattern** (reuse/extract `kdlString`), NOT an unproven
> `@bgotink/kdl` `format` call (which could silently diverge from the Python reader). The Python read side is
> proven: `astra_config.kdl.load_document`/`snake()` + the `proposer/manifest.py` `parse_manifest`
> explicit-walk (+ its `_kdl_str` escaping precedent). The both-ways fixture exists **because** TS-side emit
> has zero prior art — it is the gate.

```kdl
review "2025-8-28" updated-at="2026-06-28T14:02:11-04:00" {
    decision id="org-iconoclasm-index" state="approved" target-path="Org/Iconoclasm/index" \
             decided-at="2026-06-28T13:58:02-04:00" committed-at="2026-06-28T14:05:00-04:00"
    decision id="needs-placement-aaron-cross" state="approved" \
             target-path="Org/The Scale/People/Aaron Cross"          // human placed it (P4.9)
    decision id="bestiary-goblinoid" state="rejected" rejection-reason="not-canon" \
             decided-at="2026-06-28T13:59:40-04:00"
    decision id="phenomena-zorbon" state="deferred"
    conflict-res page-id="org-iconoclasm-index" claim="Iconoclasm functions as an orphanage." \
                 resolution="accepted"                                // (P4.10)
    registry-decision canonical="Threshold Authority" state="approved"
}
```

- `state` ∈ `pending | approved | rejected | deferred`. A proposal **absent** from `review.kdl` = `pending`
  (the surface reads `manifest ∪ review` → resumable).
- `rejection-reason` ∈ `out-of-voice | not-canon | wrong-page | hallucinated | already-known` (faerrin tags).
- `target-path` (when present) **overrides** the manifest's `target-path` (re-placement, P4.9).
- `committed-at` set **only by apply** → idempotence (never re-write an applied page).
- `conflict-res` (per `page-id` + `claim`) ∈ `accepted | rejected`; `registry-decision` (per `canonical`) ∈
  `approved | rejected` (default unapproved → not written).
- KDL serialize is stable-ordered (the `entity.kdl`/`manifest.kdl` precedent). **`.kdl` is not a biome
  target** → no biome exclude (verify the pre-commit gate stays clean after the first `review.kdl` commit).

## 6. The review surface (`heartwood-frontend`)

### 6a. Routes
- **`/` (index)** — a `loadSessions` server-fn lists `proposals/*/` dirs; for each, read `manifest.kdl`
  (page count, creates/rewrites) ∪ `review.kdl` (approved/rejected/deferred/pending tally) → a card per
  session with a progress bar. SSR. (Forward-looking for Phase-5 backfill; today one session.)
- **`/review/$date`** — the change-set. A `loadReview` server-fn returns the manifest + each proposal's body
  (read `proposals/<date>/<id>.vellum`) + the **current corpus body** for rewrites (read
  `content/<targetPath>.vellum` from the ro mount, `null` if missing) + the current `review.kdl`. Renders a
  **ProposalCard per `page`**, an **UnplacedPanel** (read-only audit), a **SkippedPanel** (read-only audit), a
  **RegistryPanel** (the `registry-add`s with approve toggles), and a top-of-page **commit-readiness summary**
  (n approved / pending; the `just heartwood-apply` command to run). SSR list; CodeMirror is a client island.

### 6b. ProposalCard (ported from faerrin `ProposalCard.tsx`)
Header: `op` + `canonical` + `target-path` + `status`/`kind` chips. Body: the cited `facts` as bullets (the
grounding set, for verification), the advisory `lints`, the `conflicts` (→ ConflictCard). **Three tabs:**
- **Reading** — the proposed `.vellum` rendered via gothic `DocumentView` (the vellum-frontend `Preview`
  seam: `parseDocument(source) → <DocumentView>`), so the reviewer sees exactly the live look.
- **Edit** — an **EditorIsland** (`ClientOnly` CodeMirror, ported from `apps/vellum-frontend/src/domain/
  editor/` — `Editor.tsx` extensions + `Preview.tsx` live render). Editing autosaves (debounced) to
  `proposals/<date>/<id>.vellum` via `writeProposalBody` (P4.5). The live `voiceLint.ts` mirror flags tells
  as you type (page-type-aware; advisory).
- **Diff** — `diff.ts`: an additive line-diff of the proposed `.vellum` body vs the current corpus body
  (`create` → vs empty; `rewrite` → vs `content/<path>.vellum`). Preserve-and-append makes it additive by
  construction (P4.6).

Footer controls: **Approve** (enabled only when the body is non-empty **and**, for `create`/`needs-placement`,
a `target-path` is set), **Reject** (→ RejectMenu tagged reason), **Defer**. Each writes a `decision` into
`review.kdl` via `writeDecision`. Status colors mirror faerrin (approved/rejected/deferred/pending).

### 6c. PlacementPicker (ported from faerrin `CreatePagePicker.tsx`)
For a `create` whose `target-path` starts `needs-placement/` (kind/folder unknown) or an `unplaced` fact the
human promotes: a folder picker over the akasha taxonomy (`Divinity/ Geography/ Org/ Phenomena/ Rules/
Bestiary/`) + free-form leaf name → a concrete `target-path`, with **inbound-link suggestions** (pages whose
crossrefs would resolve to this name, from the snapshot slug-set). The chosen path lands in `review.kdl`
(P4.9). Approve is blocked until a non-`needs-placement` path is chosen.

### 6d. ConflictCard (ported from faerrin `ConflictCard.tsx`)
Per `conflict` on a proposal: shows the **new** claim vs the **existing** page framing; **Accept** (the page
becomes a correction — the human weaves it in the Edit tab; recorded `conflict-res=accepted`) or **Reject**
(drop the claim; old canon preserved; `conflict-res=rejected`). Unresolved conflicts surface at the top and
**block approve** for that page until adjudicated.

### 6e. voiceLint.ts (TS mirror of `proposer/lint.py`, P4.17)
Re-implements the 5 warnings (`encyclopedia_opener`, `it_is_template`, `intensifier`, `broken_wikilink`,
`empty`) + page-type detection so live edits stay checked. `broken_wikilink` resolves against the snapshot
slug-set ∪ in-batch creates (the Phase-3 §8 rule). **Advisory only** — never blocks approve.

## 7. The write server-fns (`createServerFn`, strider seam)

Server-only; run in the SSR/bun process with fs access to the bind-mounts. All paths are **traversal-guarded**
to their mount root (strider `writeLayer` `within(root, rel)` + `wx`/atomic semantics):
- **`loadReview(date)`** — read manifest + bodies + corpus + review (the `/review/$date` loader). Read-only;
  spanned.
- **`writeProposalBody({date, id, source})`** — validate (`<id>.vellum` matches a manifest proposal; size
  cap), atomic-write to `proposals/<date>/<id>.vellum` (rw mount). The edit *overwrites* the proposal body
  (P4.5 — the proposal is the draft buffer; git records the human's edit).
- **`writeDecision({date, ...})`** — upsert a `decision`/`conflict-res`/`registry-decision` into
  `proposals/<date>/review.kdl` (read-modify-atomic-write; bump `updated-at`). **Never sets `committed-at`**
  (that's apply's alone).

Each emits a traced span + counter (strider `writeLayerFn` pattern). **No auth (P4.11)** — the deploy posture
is D5 + `[[strider-editor-auth-accepted]]`; the dangerous operation is host-gated. The mount is narrow
(`proposals/` rw only); the corpus mount is **ro** (the surface cannot write the corpus — only apply can).

## 8. `just heartwood-apply <date>` (the host write-back)

A justfile recipe wrapping the Python `astra-heartwood-apply` CLI + the shell steps. **Idempotent**, with a
`--dry-run` that prints the plan and writes nothing.

1. **`astra-heartwood-apply <date>`** (`apply.py`): read `manifest.kdl` (reuse `proposer/manifest.py`) +
   `review.kdl` (new `review.py`). For each `decision.state=="approved"` **without** `committed-at`:
   - `op=="create"` → write the proposal `.vellum` to `content/<target-path>.vellum` (honoring a
     `review.kdl` `target-path` override); **refuse to overwrite** an existing file (a `create` colliding
     with an existing page is a flagged error, not a silent clobber). Create missing folders (e.g.
     `Bestiary/` — opportunistic, umbrella §7). **Normalize the create frontmatter `date` to a full ISO
     timestamp (E4):** the proposer emits `date: 2025-8-28` (single-digit, non-zero-padded — YAML keeps it a
     bare string, unlike every corpus page's `date: 2026-06-05T16:40:21-04:00` from `extra["date"]`); apply
     rewrites it to ISO so akasha's date sort/format behaves. *(Rewrites are unaffected — they preserve the
     existing ISO date verbatim.)*
   - `op=="rewrite"` → **overwrite** `content/<target-path>.vellum` with the proposal `.vellum` (full
     preserve-and-append body, P4.6).
   - For each `registry-decision.state=="approved"`, apply the matching manifest `registry-add` to
     `entity.kdl` via `merge_seed` (non-clobbering; `seed --check` stays green). Honor any human-set
     `target-path` as the entity `page`.
   - Stamp `committed-at` into `review.kdl` for every page written (idempotence). Print a summary
     (created / rewritten / registry-added / skipped-already-committed).
2. **Validate, then regen the akasha snapshot** — RESOLVED (B2): the host entry is **`uv run
   akasha-snapshot`** (`apps/akasha-backend/pyproject.toml` `[project.scripts] akasha-snapshot =
   "astra_akasha_backend.snapshot:main"` → pure-Python `write_snapshot()`; no bun, no dagster env). **But
   `main()` SKIPS the TS structural validator** the dagster asset runs (`validate_corpus()` → `subprocess
   bun libs/ts/vellum-lang/scripts/validate-corpus.ts`). So apply must **validate first** (bun is on the
   host): run the validator (or `validate_corpus()`) over the corpus to fail-fast on a malformed heartwood
   `.vellum` **before** regen + commit, then `uv run akasha-snapshot`. `OTEL_SDK_DISABLED=true`.
3. **git** — `git add` the **specific** paths only (`apps/akasha-backend/content/<written>`,
   `apps/akasha-backend/snapshot/akasha-snapshot.json`, `ontology/ontology-entity/entity.kdl`,
   `apps/heartwood-backend/proposals/<date>/review.kdl`); **`git fetch` + rebase** local onto origin/main
   (the timer moves origin under long sessions — P4.15/Phase-1 gotcha; a merge commit fails commitlint);
   `git commit` (Conventional: `feat(akasha): heartwood write-back <date> — N pages (c create, r rewrite)`)
   + push.
4. **Redeploy akasha** — `(cd deploy && docker compose up -d --build akasha-frontend)` (the exact
   linguist-commit-timer line, so the new snapshot+content bake into the image and go live).

**Timer coordination (P4.15 — decision for the recipe):** the linguist-commit timer currently watches only
`apps/linguist/**` and redeploys akasha on linguist content changes; it will **not** redeploy on a heartwood
corpus commit. So **apply does its own akasha redeploy** (step 4). *(Optional follow-up: teach the timer to
also redeploy when `apps/akasha-backend/content` changes, as a backstop — but apply is self-sufficient; not
required for acceptance.)* Apply must be safe to run while the timer fires (path-scoped add + fetch/rebase).

## 9. Config + deploy

- **config.kdl** — a `heartwood` block: `service-name "astra.heartwood"`, `port 10371` (verified free —
  10360–10370 taken), `public-origin "https://heartwood.iridi.cc"`. Mirrored in `libs/py/config/.../models.py`
  (`HeartwoodConfig`) **and** `libs/ts/config/src/config.ts` (`Heartwood` Zod) — the both-schemas rule;
  config-lib tests updated.
- **Dockerfile** — `apps/heartwood-frontend/Dockerfile` from the ledger template (backend-less). The
  **11-sibling manifest ripple:** add `COPY apps/heartwood-frontend/package.json apps/heartwood-frontend/` to
  every existing frontend Dockerfile (alphabetical) so `bun install --frozen-lockfile` validates the full
  workspace. `pyproject.toml exclude` += `"apps/heartwood-frontend"` (uv rejects a manifest-less `apps/*`).
- **Compose** (`deploy/docker-compose.yml`) — a `heartwood` unit (`10371:10371`, healthcheck, `restart:
  unless-stopped`, `networks: [signoz-net]`) **with `user: "1000:1000"` + the bind-mounts (the heartwood
  departure):**
  ```yaml
  user: "1000:1000"   # B1 — every bun/dagster container runs as ROOT by default (no USER directive
                      # in any frontend Dockerfile); without this, container writes to proposals/ land
                      # 0:0 and the host (uid 1000, josh) can't git-commit or stamp review.kdl (the
                      # vellum-render/dist EACCES class). 1000:1000 = the host repo owner → host-owned writes.
  volumes:
    - /ruby/data/experiments/astra/apps/heartwood-backend/proposals:/repo/apps/heartwood-backend/proposals:rw
    - /ruby/data/experiments/astra/apps/akasha-backend/content:/repo/apps/akasha-backend/content:ro
    - /ruby/data/experiments/astra/apps/akasha-backend/snapshot:/repo/apps/akasha-backend/snapshot:ro
  ```
  (the dagster-pipeline-volumes precedent; absolute host paths). **`user: "1000:1000"` is load-bearing**
  (B1, §15) — it is the ONLY way the host-applies half works; no `user:` precedent exists in compose, so it
  must be added deliberately. The write server-fns must also use **atomic temp+rename** (the `proposals/` dir
  is `1000:1000 drwxrwxr-x`). **The surface reads at runtime from these mounts** (P4.7) — unlike the other
  frontends, content is not baked into the image. Backend-less → no SOPS env needed for the surface.
- **Caddy** (`sites.caddyfile`) — `heartwood.iridi.cc { import astra_site; reverse_proxy localhost:10371 }`.
  **Try the `*.iridi.cc` wildcard first** (the ledger surprise — no manual DNS; ACME-DNS mints the cert).
  **No `local_only` editor gate** (D5 — the whole surface is public; the write power is the narrow mount).
- **Deploy** — `just up` (or targeted `compose up -d --build heartwood`) + `just caddy-reload` + verify
  (`[[deploy-apply-with-just]]`).

## 10. Telemetry (from day one — `telemetry-built-in`)

- **Frontend:** `init_telemetry`/RUM via `@astra/observe` (the strider/ledger seam) — `service.name=
  astra.heartwood`; SSR spans per route; browser RUM (`astra.heartwood-rum`). The write server-fns emit
  `astra.heartwood.review.write{fn,outcome}` spans/counters (strider `writeLayerFn` pattern). 0-error SSR
  spans in SigNoz is part of acceptance.
- **Apply (host-side):** `OTEL_SDK_DISABLED=true` (can't reach the in-cluster collector; the Phase-2/3
  host-script precedent). Apply prints a structured summary (pages written, registry-adds, skipped); git +
  redeploy outcomes logged to stdout.

## 11. Acceptance criteria (Phase-4 gate — end-to-end live, P4.4)

Phase 4 is **DONE** when, end to end, on the committed `2025-8-28` change-set:
1. **Surface live** — `heartwood.iridi.cc` serves the review surface (SSR spans, `service.name=
   astra.heartwood`, 0 errors in SigNoz); the change-set renders as PR-style cards.
2. **Editorial loop** — the human can **edit a draft in-browser** (CodeMirror + live gothic; the edit
   persists to the proposal `.vellum`), **place** a `needs-placement` page (folder picker → concrete
   `target-path`), **reject** a bad proposal (tagged), **approve** ≥1 `create` + ≥1 `rewrite`, and the
   choices persist resumably in `review.kdl`.
3. **Write-back runs** — `just heartwood-apply 2025-8-28` writes the approved `.vellum`s into
   `apps/akasha-backend/content/` (creating `Bestiary/` as needed), applies ≥1 approved `registry-add` to
   `entity.kdl` (`seed --check` green), regenerates the snapshot, commits + pushes (path-scoped, rebase-safe),
   and redeploys akasha.
4. **Live on akasha** — **≥1 created page and ≥1 rewritten page are live and correct on `akasha.iridi.cc`**;
   the rewrite shows the human's original prose **plus** the appended passage (preserve-and-append verified
   live); crossrefs resolve or are knowingly-broken.
5. **Idempotent + green** — re-running `just heartwood-apply 2025-8-28` is a no-op (`committed-at`); both CI
   lanes green locally (`bun --filter '*' typecheck && bunx biome ci . && bun --filter '*' test && bun
   --filter '*' build`; `uv run ruff check && ruff format --check && ty check && pytest`).

Per-page judgment stays the stakeholder's (like Phase 3) — the gate is *the loop closes end-to-end*, not a
metric. **Fallback:** if the bind-mount write-back proves unsafe/awkward in deploy (uid/permissions, timer
collision), fall back to a **local-only apply** posture (the surface still public-read; approve+apply from a
local/dev instance against the host repo — the strider-editor posture) — recorded as a decision, not a silent
scope cut (`[[no-silent-scope-cuts]]`).

## 12. Slice plan (each independently CI-green; commit per slice, push on completion)

- **S1 — config + scaffold + deploy skeleton.** `heartwood` config namespace (kdl + both schemas + tests);
  `apps/heartwood-frontend` from the ledger/vellum shell (router, `__root`, observe, `server.ts`); the
  11-sibling Dockerfile ripple + Compose unit **with `user: "1000:1000"` + the bind-mounts** + Caddy block +
  uv exclude; an SSR smoke route + telemetry wired. **Must ship CI-green (the new-app gotchas):**
  `src/ssrSmoke.test.ts` (E2 — a new bun app with zero tests reds `bun --filter '*' test`, the ledger
  precedent); the **committed `src/routeTree.gen.ts`** (E3 — git-tracked + the committed-vs-generated drift
  gate); `--configLoader runner` in the dev/build scripts. **Deploys an empty shell on 10371** — proves the
  edge + the mounts. **Verify the bind-mount uid first (B1):** with `user: "1000:1000"`, confirm a container
  write to `proposals/` lands `1000:1000` host-owned (this is the novel seam — if it doesn't, the §11
  local-only fallback triggers).
- **S2 — read the change-set.** `manifest.ts` (Zod + `@bgotink/kdl` reader, kebab→camel) + `loadReview`
  server-fn (manifest + bodies + corpus) + the `/` session index + a **read-only** `/review/$date` rendering
  each `page` as a gothic card (Reading tab: facts, lints, status; gothic `DocumentView`). The fixture
  round-trip test (assert the `2025-8-28` counts). UnplacedPanel/SkippedPanel/RegistryPanel as read-only audit.
- **S3 — the editor + diff.** Port the vellum editor base as the **EditorIsland** (ClientOnly CodeMirror +
  live Preview) into the card's Edit tab; `writeProposalBody` server-fn (traversal-guarded, atomic); the
  `voiceLint.ts` TS mirror (live, page-type-aware); `diff.ts` + the Diff tab (additive). **Add the biome
  path-override (E1):** the vellum editor carries a `biome.json` override (`**/vellum-frontend/src/domain/
  editor/**` → `noNonNullAssertion`/`noAssignInExpressions`/`useSemanticElements` off); the glob won't follow
  the move, so add an equivalent block for the heartwood editor path or `bunx biome ci .` reds. Tests: the
  lint mirror over the calibration strings, an additive-diff case, a traversal-guard reject.
- **S4 — decisions + placement + conflicts.** `reviewState.ts` (Zod model + KDL read/write) + `writeDecision`
  server-fn; approve/reject(tagged)/defer footer; `PlacementPicker` (folder picker + inbound-link
  suggestions); `ConflictCard` (Accept/Reject, blocks approve until adjudicated). Tests: `review.kdl`
  round-trip, resumability (manifest ∪ review → pending), a **synthetic `conflict` fixture** (P4.10 is
  unexercised on `2025-8-28` — don't ship it dead).
- **S5 — `just heartwood-apply` (host write-back).** `review.py` (Python review.kdl reader — the **shared
  cross-language round-trip** with the TS writer is the gate) + `apply.py` (corpus write create/rewrite,
  `entity.kdl` `merge_seed`, `committed-at` stamp, `--dry-run`) + `astra-heartwood-apply`; the justfile recipe
  (apply → **validate (`bun …/validate-corpus.ts`) → `uv run akasha-snapshot`** → path-scoped commit +
  fetch/rebase/push → akasha redeploy). Atomic review.kdl stamp (host-owned via `user: "1000:1000"`).
  Idempotence test.
- **S6 — end-to-end acceptance (§11).** Approve ≥1 create + ≥1 rewrite from `2025-8-28`; run apply; verify
  the pages live on `akasha.iridi.cc` + the surface live on `heartwood.iridi.cc`; SigNoz spans for both;
  idempotent re-run. Update `[[heartwood-0020-gotchas]]` with the load-bearing gotchas (the bind-mount seam,
  the apply recipe, the timer coordination).

## 13. Out of scope (Phase 5)

**Cross-session rejection memory** (faerrin `RejectionStore` — suppress previously-rejected claims; value
lands at backfill scale); **backfill over all ~40 faerrin sessions** (~$4, the chronicle-backfill template) to
bootstrap the corpus + registry; **sensor/schedule automation** (new sessions auto-produce proposals →
auto-stage for review); any **relaxation of the always-human-gated posture** (umbrella §7 — revisit only if
trust is earned); a **TriageView** (raw facts → canon/uncertain/noise — astra's facts are pre-refined by
Phase-2 Stage 2.5; revisit only if needed); **transcript provenance/citations** in the surface (P2.6
deferred; git history is the record per umbrella §7 "no provenance marking"); the optional **timer
content-watch backstop** (§8).

## 14. Risks / notes

- **THE novel seam: the rw bind-mount of `proposals/`.** No other frontend mounts repo dirs. **Resolved
  (B1, §15):** containers run as **root** by default, so without `user: "1000:1000"` the writes land `0:0`
  and the host can't commit/stamp (the `apps/vellum-render/dist` EACCES class). The compose unit pins
  `user: "1000:1000"` (= the host repo owner) + the server-fns write atomically; **S1 verifies a container
  write lands `1000:1000`** before building further. Keep the mount **narrow** (`proposals/` rw,
  corpus/snapshot **ro**). If still unworkable → the §11 local-only fallback.
- **Timer ↔ apply push collision (P4.15).** The 15-min linguist-commit timer pushes from the same repo →
  apply must `git add` specific paths + fetch/rebase before push (a merge commit fails commitlint). Apply
  does its own akasha redeploy (the timer won't, today).
- **`ssr:false` / hydration seams.** CodeMirror is client-only → mount the EditorIsland behind `ClientOnly`
  (the harrow/vellum precedent); mind `noUncheckedIndexedAccess` on the verbatim editor port (the harrow
  gotcha). The review list itself is SSR.
- **Conflicts built-but-unexercised** (0 on `2025-8-28`) → test `ConflictCard` + `conflict-res` on a
  synthetic fixture so it isn't dead-on-arrival (S4).
- **Cross-language `review.kdl` contract** — written by TS, read by Python apply. A drift between the two
  parsers silently breaks write-back → a **shared fixture round-trips both ways** (the S5 gate).
- **`create` colliding with an existing corpus page** (resolution missed an existing page under a different
  surface form, the Phase-3 §16 residual) → apply **refuses to overwrite on `create`** (flag, don't clobber);
  the human rejects/re-places. Cross-page dedup is Phase 5.
- **Snapshot regen host env** — apply calls akasha-backend python host-side; akasha-backend is a uv member,
  so the env exists (chronicle/Phase-2 host runs prove it). Confirm the exact regen entry in S5.
- **`already-known`/`unplaced`/`skipped` are audit, not actionable** in the surface — render read-only; build
  edit affordances only for `page`/`registry-add`/`conflict`.
- **No drift gate on `proposals/` or the corpus content** (LLM non-determinism + human edits) — structural/
  round-trip tests only; never a CI diff gate on prose.

## 15. Adversarial completeness pass

An independent challenge (`Plan` agent, verified against the live repo + the real `2025-8-28` change-set)
ran before implementation and drove the revisions above.

**Blockers — resolved in-spec:**
- **B1 — the bind-mount writes ROOT-owned files.** Every frontend/dagster Dockerfile runs as **root** (no
  `USER` directive anywhere; proof: recent container-written `apps/linguist/data/2026-6-22.json` is `0:0`
  vs host-written `2026-6-8.json` `1000:1000`). Without a fix, container writes to `proposals/` land `0:0`
  and the host (uid 1000) can't `git commit` or stamp `review.kdl` (the `vellum-render/dist` EACCES class).
  → **`user: "1000:1000"` on the heartwood compose unit** (§9; no `user:` precedent exists — added
  deliberately) + atomic temp+rename writes. This is THE load-bearing fix for the host-applies half.
- **B2 — wrong snapshot-regen entry / skipped validation.** The real entry is **`uv run akasha-snapshot`**
  (pure-Python `write_snapshot()`), not `astra-akasha-snapshot`; and `main()` **skips** the TS structural
  validator (`validate_corpus()` → `bun …/validate-corpus.ts`) that the dagster asset runs. → apply
  **validates (bun, on the host) then regens** (§8 step 2), failing-fast on a malformed `.vellum`.
- **B3 — TS-side KDL emit is net-new.** `@bgotink/kdl` is **parse-only** repo-wide; the only KDL *writer* is
  strider's hand-rolled `editorHelpers.ts` `kdlString`/`kdlNode`. → base the `review.kdl` writer on that
  (§5b), not an unproven `format` call; the both-ways fixture is the gate precisely because emit has no prior
  art.

**Edge cases — folded into the slice plan:**
- **E1** — the vellum editor's `biome.json` path-override won't follow the port → add an equivalent for the
  heartwood editor path (S3) or `biome ci` reds.
- **E2** — a new bun app with zero tests reds `bun test` → S1 ships `ssrSmoke.test.ts` (ledger precedent).
- **E3** — `routeTree.gen.ts` is git-tracked + a drift gate → commit it (S1).
- **E4** — `create` proposals carry a non-ISO `date: 2025-8-28` (bare string) vs the corpus's full ISO →
  apply normalizes the create `date` on write (§8 step 1).

**Verified non-issues (the spec's worries that hold up):**
- **Preserve-and-append confirmed** — `proposals/2025-8-28/org-iconoclasm-index.vellum` (`op="rewrite"`)
  contains the existing `content/Org/Iconoclasm/index.vellum` frontmatter + body **verbatim** + one appended
  paragraph → the additive-diff claim (P4.6) is sound.
- **Bestiary/ without an index renders** — `Phenomena/`/`Rules/` already ship index-less; `crossref.py` makes
  folder→`/index` optional + "report, never fatal." (Count correction: **4** `Bestiary/*` creates, not 5.)
- **Timer ↔ apply is low-risk** — the linguist-commit timer path-scopes to `apps/linguist/**` + the
  mouthpiece snapshot; it **never** commits `apps/akasha-backend/snapshot` → apply's path-scoped add +
  fetch/rebase is adequate (P4.15).
- **Port 10371 free**; the Python `manifest.py parse_manifest` reuse is real.

**Residual (handle in implementation; not blockers):**
- A `create` colliding with an existing corpus page (resolution missed a surface-form duplicate, the Phase-3
  §16 residual) → apply **refuses to overwrite on `create`**; the human rejects/re-places. Cross-page dedup
  is Phase 5.
- A stale registry `page` pointing at a missing corpus file on a `rewrite` → the proposer already degraded it
  toward a create (Phase-3 §16); apply treats a missing rewrite target as a flagged create, never crashes.
- Conflicts unexercised on `2025-8-28` → the synthetic-fixture test (S4) keeps `ConflictCard` from shipping
  dead.

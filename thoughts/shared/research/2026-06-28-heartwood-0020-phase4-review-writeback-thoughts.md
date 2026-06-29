---
date: 2026-06-28
subsystem: heartwood
slot: "0020"
phase: 4 (review surface + write-back)
kind: scope (pre-implementation research, verified against the live repos)
status: scoping — decisions P4.1–P4.18 settled this session; question-free → ready for the NLSpec
author: Claude (Opus 4.8) + Josh
builds_on:
  - thoughts/shared/research/2026-06-27-heartwood-0020-thoughts.md   # umbrella (D1–D10)
  - thoughts/astra/specs/0020-heartwood-phase3-proposer-spec.md      # the change-set this phase consumes
  - thoughts/shared/memory/heartwood-0020-gotchas.md
---

# heartwood (0020) — Phase 4 scope: the review surface + write-back

Phase 4 is the **human gate made real**. Phases 2–3 are read-only and done: a session's transcript →
committed facts → a committed **change-set** (`apps/heartwood-backend/proposals/<date>/manifest.kdl` +
sibling `.vellum` bodies). Phase 4 builds the bespoke PR-style review app at **`heartwood.iridi.cc`** that
renders that change-set, lets the human **approve / edit / reject** each proposed page (and adjudicate
conflicts, place ambiguous nouns, accept registry additions), and then **writes the approved pages back
into the akasha corpus** — regenerating the akasha snapshot, committing, and redeploying akasha so the
edits go live. This is the first heartwood phase that writes anything; everything before it staged.

It is also the phase that **proves the whole subsystem exists for a reason**: the loop only closes when an
LLM-proposed page, vetted by a human, lands on `akasha.iridi.cc` as indistinguishable hand-authored lore
(the "no provenance marking" decision, umbrella §7).

> **The standing lesson that frames this phase (`[[heartwood-0020-gotchas]]`):** this feature **failed
> twice in faerrin** — including a full PR-review surface (`pkg/heartwood-review`, deleted in faerrin
> `e2cb11e` "failed experiment"). The Phase-3 acceptance verdict was **creates pass, rewrites were
> hardened to preserve-and-append** — so the prose risk is now largely retired *by construction*. Phase 4
> ports faerrin's hard-won **review-and-editorial workflow** (the part worth keeping) onto astra's
> committed-KDL + host-apply substrate; it does **not** re-litigate prose generation.

---

## 1. Where Phase 4 sits (what's done, what this adds)

- **Phase 1 (ontology infra)** ✅ — `world` field; `astra-lexicon`; `ontology-entity` typed registry +
  `resolve()`. *Phase 4 writes back into this registry (`entity.kdl`) when a `registry-add` is approved.*
- **Phase 2 (extraction)** ✅ — `apps/heartwood-backend` → committed `facts/<date>.json`.
- **Phase 3 (prose proposer)** ✅ — `proposer/` sub-package → committed `proposals/<date>/{manifest.kdl,
  <id>.vellum}`. **This is Phase 4's input.** The acceptance change-set for `2025-8-28` is on disk
  (verified: **50 `page` nodes / 50 `.vellum` bodies** + `manifest.kdl`).
- **Phase 4 (this)** — the review surface + write-back. **Read-only ends here.**
- **Phase 5 (deferred)** — cross-session accumulation + backfill over ~40 sessions (~$4) + sensor/schedule
  automation + cross-session rejection memory. Phase 4 reviews **one session at a time**.

---

## 2. Decisions (settled this session — the doc is question-free)

The umbrella settled D1–D10. The four load-bearing Phase-4 forks were resolved with the stakeholder this
session (P4.1–P4.4); the rest (P4.5–P4.18) fall out of the verified research below and are recorded so the
spec inherits them.

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| **P4.1** | **Write-back execution model** | **Browser decides, host applies.** The public container app records approve/edit/reject into a committed **`review.kdl`** (via a narrow **rw bind-mount of `apps/heartwood-backend/proposals/`** only). A host-side **`just heartwood-apply <date>`** recipe reads approved decisions → writes `.vellum` into the corpus, applies `registry-add`s, regenerates the akasha snapshot, commits + pushes, redeploys akasha. | A containerized public, no-auth server-fn can't safely reach the host repo/git/docker (strider's editor *proves* this — it writes ephemeral container fs). The split keeps host powers on the host (the **linguist-commit-timer precedent**) and the surface stateless-but-for-its-narrow-mount. No docker socket / full-repo mount in a public container. |
| **P4.2** | **Review-surface richness** | **Full in-browser editor.** Port the vellum-frontend editor base (CodeMirror + live gothic `DocumentView`) with faerrin's **Edit / Reading / Diff** tabs — the human edits a proposed `.vellum` *in place* before approving. | D2's stated intent ("approve / **edit** / reject"); the §12 fallback ("Phase-4's surface becomes an editor"). Editing-and-polishing is the realistic worldbuilder workflow; the editor base already renders + edits vellum natively. |
| **P4.3** | **Proposal store / state** | **Per-session `review.kdl`** (committed KDL, repo convention). Resumable per-proposal decisions: `state` (pending/approved/rejected/deferred) + `rejection-reason` + chosen `target-path` + `committed-at` (idempotence). Conflict resolutions + promoted-unplaced inline. **No cross-session rejection memory** (Phase 5). | Matches astra's committed-KDL-at-the-edges convention; ports faerrin's `ReviewState` minus the cross-session `RejectionStore` (whose value lands at backfill scale, Phase 5). We review one session today. |
| **P4.4** | **Acceptance gate** | **End-to-end live on akasha.** Approve ≥1 `create` + ≥1 `rewrite` from the `2025-8-28` set through the surface → `just heartwood-apply` runs the full path → the pages are **live on `akasha.iridi.cc`** + `heartwood.iridi.cc` serves the surface. | Proves the entire loop the subsystem exists for, not just the UI. The stakeholder relocated Phase-2 acceptance to be real/chronological; this matches that bar. |
| **P4.5** | **The edit buffer is the proposal `.vellum` itself** | In-browser edits **overwrite `proposals/<date>/<id>.vellum`** directly (server-fn write to the bind-mount). `review.kdl` stays *metadata only* (no prose duplicated into KDL). `just heartwood-apply` copies the (now-edited) proposal body to the corpus. | Avoids faerrin's `authoredText`-in-state duplication; the proposal body *is* the draft, the edit is the human taking the pen, git records it. One source of prose. |
| **P4.6** | **Rewrite write-back = overwrite the corpus file with the proposed body** | A `rewrite` proposal `.vellum` already contains the **full page** (existing frontmatter + body **verbatim** + the appended passage — P3.9 preserve-and-append). Write-back overwrites `content/<path>.vellum` with it. The **Diff tab** = proposed body vs. the current corpus file (purely additive by construction). | No structured diff is stored (Phase-3 spec §5/P3.9); the git/render diff is the diff. Preserve-and-append makes the corpus write a safe whole-file replace. |
| **P4.7** | **Surface reads proposals + corpus at runtime (not baked)** | heartwood-frontend reads `manifest.kdl`, the proposal `.vellum`s, and the **current corpus body** (for the rewrite diff) at **request time via server-fns** over bind-mounts (`proposals/` rw, `apps/akasha-backend/content/` **ro**, the akasha snapshot **ro** for the slug-set). | Unlike akasha/strider (build-time-baked content), the review surface is inherently dynamic (proposals + `review.kdl` change during review). This is the strider-editor posture (a write server-fn) generalized to also *read* dynamic content. |
| **P4.8** | **Registry-add application is non-clobbering, host-side** | Approving a `registry-add` row appends/updates an entry in `ontology/ontology-entity/entity.kdl` via the existing **`merge_seed` non-clobbering** path; `astra_ontology_entity.seed --check` is the drift gate. Runs inside `just heartwood-apply`, committed in the same change. | Reuses Phase-1's idempotent seed/merge (verified non-clobbering: `source="manual"` survives re-seed). New entities a session discovered become resolvable for the *next* session — but only after this approval (the "world builds on itself" loop closes here, as the gotchas note predicted). |
| **P4.9** | **`needs-placement/` + `unplaced` are human-resolved in the surface** | A proposal under `needs-placement/<name>` (kind/folder unknown) or an `unplaced` fact (ambiguous resolution with candidates) is surfaced with an **editable `target-path`** (a folder/kind picker, faerrin's `CreatePagePicker` ported) + the candidate list. The human sets the final path before approve; write-back honors it. | The proposer deliberately refuses to invent a folder (P3.6/P3.14); placement is exactly the judgment a human review exists for. The chosen `target-path` lands in `review.kdl`. |
| **P4.10** | **Conflicts are adjudicated, not auto-merged** | `conflict` nodes (a cited fact contradicting the existing page — P3.17) render as faerrin's `ConflictCard` (new vs. existing statement): **Accept** (the page becomes a correction; the human weaves it in the editor) or **Reject** (drop the fact; old canon preserved). Recorded in `review.kdl`. | Umbrella hard-problem #7; Phase-3 spec defers adjudication to Phase 4. Never blindly overwrite curated lore. (On `2025-8-28` the manifest emitted **no** `conflict` nodes — so this is built but lightly exercised; verify the card on a synthetic fixture.) |
| **P4.11** | **No auth (D5)** | `heartwood.iridi.cc` is open like every astra site; the write path is the narrow `proposals/` mount + the host-gated apply. The dangerous operation (corpus commit + redeploy) is **host-side and human-run** (`just heartwood-apply`), not a public endpoint. | D5 + `[[strider-editor-auth-accepted]]`. The host-apply split means even an abusive `review.kdl` write only stages decisions a human still has to run apply on. |
| **P4.12** | **Config namespace `heartwood`, port 10371** | New `heartwood` namespace in `config.kdl` + both schemas (py Pydantic + ts Zod): `service-name "astra.heartwood"`, `port 10371` (next free — 10370 = ledger is the current max), `public-origin "https://heartwood.iridi.cc"`. | config-single-source; verified the port ladder (10360–10370 taken). |
| **P4.13** | **App name `heartwood-frontend`** | New bun app `apps/heartwood-frontend` (the Phase-2/3 Python app is `heartwood-backend`). uv-excluded; the 11-sibling Dockerfile manifest ripple; backend-less Compose unit + the narrow bind-mounts; Caddy `heartwood.iridi.cc` block. | Matches the one-subsystem-can-have-two-apps pattern (orator-backend/-controller). |
| **P4.14** | **Render fidelity reuses gothic in-process; vellum-render optional** | Live preview + Reading tab render via **gothic `DocumentView`** in the SSR/client process (the vellum-frontend Preview seam) — no separate render service needed for review. The PNG `vellum-render` service is **not** wired (P3.12's "render-for-review" is satisfied by the live gothic render). | The editor base renders vellum in-process already; a PNG service adds a sibling container for no review value. |
| **P4.15** | **Coordinate with the linguist-commit timer** | `just heartwood-apply` does its own `git add <specific paths>` + commit + push (path-scoped, like `linguist-commit`); before pushing it **fetch+rebase** (the timer moves origin/main under long sessions — a recorded Phase-1 gotcha). The akasha redeploy reuses the timer's exact recipe (`compose up -d --build akasha-frontend`). | The timer already broad-`git add`s `apps/linguist/**` every 15 min and redeploys akasha; heartwood-apply must be path-scoped + rebase-safe so the two don't fight. Decide in the spec whether the timer should also watch `apps/akasha-backend/content` (currently it does not). |
| **P4.16** | **Telemetry from day one** | The SSR app wires `@astra/observe` (RUM + SSR spans, the strider/ledger seam); the write server-fn emits a traced span + counter (strider's `writeLayerFn` pattern). `just heartwood-apply` runs host-side → `OTEL_SDK_DISABLED=true` (can't reach the in-cluster collector; the Phase-2/3 host-script precedent). | `[[telemetry-built-in]]`; `service.name=astra.heartwood`. |
| **P4.17** | **Voice lint is advisory in the surface** | The manifest's `lint` nodes (broken-wikilink etc.) + faerrin's `voice-warnings.ts` (already ported to the backend `proposer/lint.py`) surface as **non-blocking** warnings on each card; a TS mirror re-runs them live as the human edits (page-type-aware suppression). They never block approve. | The human is the gate; lints are a nudge. A TS re-implementation of the lint subset keeps live edits checked (the backend lint is Python; the editor needs a client-side check). |
| **P4.18** | **Residual review-territory items are *handled by the human here*, not auto-fixed** | The known false-link (`Voidheart→voidward`), residual hallucinations, and `~28%` no-`kind_hint` facts are exactly what the review surface exists to catch — surfaced (status/candidates/lints visible), corrected by edit/reject. No new resolver tuning in Phase 4. | The gotchas memo calls these "Phase-4 review territory." Resolve-threshold tuning trades against real garbles (~0.86) — defer. |

**Deferred to Phase 5 (recorded, not silently dropped — `[[no-silent-scope-cuts]]`):** cross-session
rejection memory (P4.3); backfill over all ~40 sessions; sensor/schedule automation (proposals auto-built
on new sessions); any relaxation of the always-human-gated posture (umbrella §7).

---

## 3. Verified research (ground truth — checked against the live repos this session)

Four parallel research passes + direct file reads. Paths inline so the spec goes straight to them.

### 3a. The change-set Phase 4 consumes (`proposals/<date>/`) — VERIFIED on `2025-8-28`

The authoritative contract is the Phase-3 spec §5/§9 (Pydantic `ProposalManifest` ↔ `manifest.kdl`). Read
the real `apps/heartwood-backend/proposals/2025-8-28/manifest.kdl` to confirm the shapes Phase 4 must parse:

- **`proposal "<date>"` head** — `show=`, `world=` attrs; children are the nodes below.
- **`page "<target-path>"`** — attrs `op` (`create`|`rewrite`), `canonical`, `kind` (`person|place|org|
  deity|phenomenon|creature|item`| absent), `status` (`resolved`|`unknown`), `page-type` (`lore|stub|
  deity-statblock|timeline|flavor-pre`), `body="<id>.vellum"`, optional `placement-note=`. Children:
  - `fact "<claim>"` — the NEW cited claims (the grounding set; shown as bullets for verification).
  - `conflict "<claim>"` — a fact that contradicts the existing page (P3.17). *(None on `2025-8-28`.)*
  - `lint "<type>" message=… hit=…` — residual voice/link warnings (e.g. `broken_wikilink` for `tram`,
    `Smiler at the Undertable`, `Undertable`, `city walls` — 4 on `2025-8-28`).
- **`unplaced subject=… claim=…`** with child `candidate "<name>" score="…"` rows — ambiguous facts the
  proposer refused to place (4 on `2025-8-28`: `Embercall Industries`, `Othello` ×3, `Void 2`).
- **`skipped target-path=… reason="already-known"|"non-prose-page"`** — audited non-rewrites (8 on
  `2025-8-28`, all `already-known`).
- **`registry-add canonical=… kind=… suggested-path=…`** — proposed new entities (18 on `2025-8-28`).

**KDL↔Pydantic naming (Phase-3 spec §5):** props are kebab-case; the reader applies `astra_config.kdl.
snake()` explicitly (the `entity.py` walk does **not** auto-convert). Phase 4's **TS** reader must do the
same kebab→camel mapping; a round-trip test is the gate. **There is a Python parser already** (the proposer
emits + a structural test reads it) — but the *frontend* is TS, so Phase 4 needs a **Zod-validated KDL
reader** for `manifest.kdl` (parse with `@bgotink/kdl`, the build-time devDep strider already uses for
layers — `[[strider-layers-kdl]]`).

### 3b. The proposal bodies — `create` vs `rewrite`

- A **`create`** `.vellum` = minimal new frontmatter (`---` with `date`/`tags: []`) + the drafted prose.
  Write-back drops it at `content/<target-path>.vellum` (new file; must not already exist).
- A **`rewrite`** `.vellum` = the **existing file's frontmatter verbatim** + the **existing body verbatim**
  + an appended passage (P3.9 preserve-and-append). Write-back **overwrites** `content/<target-path>.vellum`.
  The **Diff** is `proposed` vs the **current corpus file** — additive only.

### 3c. The akasha write-back target (verified machinery)

- **Corpus:** `apps/akasha-backend/content/` — folders `Divinity/ Geography/ Org/ Phenomena/ Rules/` +
  root `index.vellum`/`Timeline.vellum`. **No `Bestiary/` yet** — the `2025-8-28` set proposes 5 `Bestiary/*`
  creates, so write-back **creates the folder** (umbrella: a new section is just a new folder; opportunistic
  Bestiary, §7). **Filename = page title = crossref target**; `index.vellum` = a container page.
- **Snapshot asset:** `akasha_corpus_snapshot` (`apps/akasha-backend/src/astra_akasha_backend/assets.py`)
  → `validate_corpus()` + `write_snapshot()` → `snapshot/akasha-snapshot.json` (pages' frontmatter +
  crossref edges + unresolved; **no bodies**). Invoked via `dagster asset materialize` or a host CLI.
- **Crossref** (`crossref.py`): exact path-key, folder→`/index`, else filename-stem (shortest-path
  tiebreak); **no fuzzy/alias**. Phase 4's broken-wikilink lints reflect this exactly.
- **Live deploy:** `apps/akasha-frontend/scripts/build-content.ts` reads the snapshot (graph) + raw corpus
  bodies (rendered through gothic to `generated/bodies.ts`) at **build time** → a content edit is live only
  after **snapshot regen + `compose up -d --build akasha-frontend`**. The akasha Dockerfile `COPY`s
  `apps/akasha-backend/{snapshot,content}` — both must be current at build.
- **The linguist-commit timer** (`deploy/systemd/linguist-commit.{timer,service}` + `justfile`
  `linguist-commit`): every 15 min, path-scoped `git add apps/linguist/{transcripts,data,timeline}` →
  commit `--no-verify` → push; **if linguist content changed → `just akasha-seed` + `compose up -d --build
  akasha-frontend`**. heartwood-apply reuses the redeploy line and mirrors the path-scoped-commit + push
  discipline (P4.15).

### 3d. The review-surface base — `apps/vellum-frontend` + strider's write seam

- **Editor base** (`apps/vellum-frontend/src/domain/editor/`): `VellumEditor.tsx` (multi-doc store +
  autosave), `Editor.tsx` (uncontrolled CodeMirror 6 + `vssMarkdown`/`vellumHighlighting`/`slashComplete` +
  `gothicTheme`), `Preview.tsx` (`parseDocument(source,{mode})` → gothic `DocumentView` — the WYSIWYG
  render Phase 4 reuses for Reading/live-preview), `docStore.ts` (localStorage — Phase 4 swaps this for the
  proposal-backed store). The `/editor` route is `ssr:false` (CodeMirror is client-only). Deps already in
  the workspace: `codemirror`, `@astra/gothic`, `@astra/vellum-lang`, `@astra/site-kit`.
- **Write seam** (strider, the template): `apps/strider/scripts/writeLayer.ts` (pure: validate filename
  regex + size cap + **path-traversal guard** + **no-overwrite `wx` flag**) + `src/domain/components/
  Editor/writeLayerFn.ts` (`createServerFn({method:"POST"})` + a traced span/counter + the
  "no-auth-by-design, edge-gated" comment). Phase 4's write server-fn mirrors this to write
  `proposals/<date>/{<id>.vellum, review.kdl}` (traversal-guarded to the mounted `proposals/` root).
- **Shell** reused as-is: `server.ts` (`createSsrServer`), `vite.config.ts` (`gothicFontsPlugin` +
  `--configLoader runner`), `router.tsx`, `__root.tsx`, `scripts/generate-routes.ts`, `Dockerfile`.

### 3e. faerrin's deleted review surface — what to port (and not)

Recovered from faerrin git history (`git show e2cb11e^:pkg/heartwood-review/...`). **Port the editorial
workflow; do not port the prose pipeline** (it's why the experiment failed — and astra's is Phase 3).

- **`ProposalCard.tsx`** (570 lines) — the decision surface: **Edit / Reading / Diff** tabs, source facts
  as bullets, approve (enabled only when prose authored + `create` has a `target-path`) / reject (tagged
  reason picker) / defer; status colors. **Port the structure.**
- **`ConflictCard.tsx`** — Accept/Reject a contradicting fact (P4.10). **Port.**
- **`CreatePagePicker.tsx`** — folder picker + inbound-link suggestions for `create`/`needs-placement`
  (P4.9). **Port (adapt to astra's folder taxonomy + slug-set from the snapshot).**
- **`voice-warnings.ts` + `page-type.ts`** — already ported to the backend `proposer/lint.py`; Phase 4
  needs a **TS mirror** for live-edit checks (P4.17).
- **`rejection-reasons.ts`** — the tags (`out-of-voice / not-canon / wrong-page / hallucinated /
  already-known`). **Port** into `review.kdl`'s `rejection-reason`.
- **State model** — faerrin's `ReviewState` (per-proposal decisions, resumable, `committedAt` idempotence)
  + `commit-impl.ts performCommit` (filter approved → write → commit → mark committed). **Port the shape**
  onto astra's `review.kdl` + `just heartwood-apply` (P4.3/P4.5). **Drop** faerrin's `RejectionStore`
  (cross-session memory — Phase 5) and its **provenance ledger** (umbrella §7 decided **no provenance
  marking**; git history is the record).
- **TriageView** (raw facts → canon/uncertain/noise) — *optional*; astra's facts are already refined
  (Phase 2 Stage 2.5). Recommend **omit** in Phase 4 (the manifest is already curated); revisit if needed.

### 3f. Config + deploy ripple (verified recipe)

- **config.kdl** + `libs/py/config/.../models.py` (`HeartwoodConfig`) + `libs/ts/config/src/config.ts`
  (`Heartwood` Zod) — port 10371, the both-schemas rule.
- **Dockerfile** `apps/heartwood-frontend/Dockerfile` (template from ledger; backend-less) + the
  **11-sibling manifest ripple**: add `COPY apps/heartwood-frontend/package.json …` to every existing
  frontend Dockerfile (the `--frozen-lockfile` gate). `pyproject.toml` `exclude` += the app.
- **Compose** `deploy/docker-compose.yml` — a backend-less `heartwood` unit (port `10371:10371`,
  healthcheck, `restart: unless-stopped`) **plus the narrow bind-mounts (the heartwood departure):**
  `apps/heartwood-backend/proposals:…:rw`, `apps/akasha-backend/content:…:ro`, the akasha snapshot `:ro`.
- **Caddy** `sites.caddyfile` — `heartwood.iridi.cc { import astra_site; reverse_proxy localhost:10371 }`;
  the **`*.iridi.cc` wildcard means the new subdomain should just work** (no manual DNS — the ledger
  surprise, `[[ledger-0018-gotchas]]`; try the wildcard first).
- **Deploy** — `just up` (or targeted `compose up -d --build heartwood`; backend-less → no SOPS needed for
  the surface) + `just caddy-reload`.

---

## 4. The architecture (the browser-decides / host-applies split)

```
PUBLIC: heartwood.iridi.cc  (container, no auth)        HOST: the repo + git + docker + dagster
─────────────────────────────────────────────          ─────────────────────────────────────────
  /                  session index (list proposals/<date>/)
  /review/<date>     the change-set as PR-style cards
     ├─ render proposal (gothic DocumentView)
     ├─ Edit tab (CodeMirror) ──writes──▶ proposals/<date>/<id>.vellum   (rw bind-mount)
     ├─ Diff tab  (proposed vs content/<path>.vellum, ro mount)
     ├─ place needs-placement / unplaced  (folder picker)
     ├─ adjudicate conflicts (Accept/Reject)
     └─ approve / reject / defer ──writes──▶ proposals/<date>/review.kdl (rw bind-mount)

                                          ──── the human then runs, on the host: ────
                                          just heartwood-apply <date>
                                            1. read review.kdl (approved decisions)
                                            2. create → write content/<path>.vellum (no-overwrite)
                                               rewrite → overwrite content/<path>.vellum (full body)
                                            3. approved registry-add → entity.kdl (merge_seed, non-clobber)
                                            4. regen akasha snapshot (materialize akasha_corpus_snapshot)
                                            5. git add <those paths> ; fetch+rebase ; commit ; push
                                            6. compose up -d --build akasha-frontend   (live)
                                            7. stamp committed-at back into review.kdl
```

**Why this shape (P4.1):** the only host-privileged step (git commit + snapshot + docker redeploy) is a
**human-run recipe**, never a public endpoint. The container's only write power is its narrow `proposals/`
mount. This is the linguist-commit-timer pattern (host owns commit+redeploy) applied to a human trigger.

---

## 5. The `review.kdl` schema (the proposal store — P4.3/P4.5)

One file per session, committed: `apps/heartwood-backend/proposals/<date>/review.kdl`. **Metadata only** —
prose lives in the proposal `.vellum` (P4.5). Sketch (settle exact field names in the spec; both-ends
round-trip test is the gate):

```kdl
review "2025-8-28" {
    decision id="org-iconoclasm-index" state="approved" target-path="Org/Iconoclasm/index" \
             decided-at="2026-06-28T…" committed-at="2026-06-28T…"
    decision id="needs-placement-aaron-cross" state="approved" \
             target-path="Org/The Scale/People/Aaron Cross"   // human placed it
    decision id="bestiary-goblinoid" state="rejected" rejection-reason="not-canon" decided-at="…"
    decision id="phenomena-zorbon" state="deferred"
    conflict-res claim="Iconoclasm functions as an orphanage." resolution="accepted"
    registry-decision canonical="Threshold Authority" state="approved"
}
```

- `state` ∈ `pending|approved|rejected|deferred`; `rejection-reason` ∈ the faerrin tag set.
- `target-path` overrides the manifest's `target-path` when the human re-places (`needs-placement`/
  `unplaced`); write-back honors `review.kdl` over `manifest.kdl`.
- `committed-at` set by `heartwood-apply` → **idempotence** (never re-write an already-applied page).
- A proposal absent from `review.kdl` = `pending` (resumable: the surface reads manifest ∪ review).

---

## 6. Slice breakdown (proposed — refine in the spec)

Mirrors the per-slice CI-green rhythm. Frontend slices are bun-lane; the apply recipe is host/py-lane.

- **S1 — config + scaffold + deploy skeleton.** `heartwood` config namespace (kdl + both schemas);
  `apps/heartwood-frontend` from the ledger/vellum shell; the 11-sibling Dockerfile ripple + compose unit
  (with the bind-mounts) + Caddy block + uv exclude; SSR smoke + telemetry wired. *(Deploys an empty shell;
  proves the edge + mounts.)*
- **S2 — read the change-set.** Zod-validated TS KDL reader for `manifest.kdl` (`@bgotink/kdl`) + a
  server-fn that lists `proposals/<date>/` + loads a manifest + proposal `.vellum`s + the current corpus
  body (ro mount). The `/` session index + a read-only `/review/<date>` rendering each `page` as a gothic
  card (facts, lints, status). Round-trip parse test.
- **S3 — the editor + diff.** Port the vellum editor base (CodeMirror + Preview) into the card as
  **Edit/Reading/Diff** tabs; the write server-fn (strider seam) persists edits to `proposals/<date>/
  <id>.vellum`; the TS voice-lint mirror (live, page-type-aware). Diff = proposed vs corpus.
- **S4 — decisions + placement + conflicts.** approve/reject(tagged)/defer → `review.kdl` (write server-fn);
  the `CreatePagePicker` for `needs-placement`/`unplaced` (folder picker + slug-set from snapshot);
  `ConflictCard`. `review.kdl` Zod round-trip + resumability.
- **S5 — `just heartwood-apply` (host write-back).** The recipe: read `review.kdl` → write corpus `.vellum`
  (create no-overwrite / rewrite overwrite) → apply `registry-add` to `entity.kdl` (`merge_seed`) → regen
  snapshot → path-scoped commit + fetch/rebase/push → redeploy akasha → stamp `committed-at`. Idempotent +
  dry-run flag. Host-run (`OTEL_SDK_DISABLED`).
- **S6 — end-to-end acceptance (P4.4).** Approve ≥1 create + ≥1 rewrite from `2025-8-28`; run apply; verify
  the pages live on `akasha.iridi.cc` + the surface live on `heartwood.iridi.cc`; SigNoz spans for both.

---

## 7. Acceptance gate (P4.4)

Phase 4 is **DONE** when, end to end:
1. `heartwood.iridi.cc` serves the review surface (SSR spans in SigNoz, `service.name=astra.heartwood`).
2. The `2025-8-28` change-set renders as PR-style cards; the human can **edit a draft in the browser**,
   **place** a `needs-placement` page, **reject** a bad proposal (tagged), and **approve** the rest.
3. `just heartwood-apply 2025-8-28` writes the approved `.vellum`s into `apps/akasha-backend/content/`
   (incl. creating `Bestiary/`), applies ≥1 `registry-add` to `entity.kdl`, regenerates the snapshot,
   commits + pushes (path-scoped, rebase-safe), and redeploys akasha.
4. **≥1 created page and ≥1 rewritten page are live and correct on `akasha.iridi.cc`** (rewrite shows the
   human's original prose **plus** the appended passage — preserve-and-append verified live; crossrefs
   resolve or are knowingly-broken).
5. Re-running apply is a **no-op** (idempotence via `committed-at`); both CI lanes green locally.

Judgment stays the stakeholder's (per-page, like Phase 3) — the gate is *the loop closes*, not a metric.

---

## 8. Risks / watch-items (carry into the spec)

- **The bind-mount is the novel deploy seam.** No other frontend mounts repo dirs rw. Verify the container
  writes land on the host path (uid/permissions — the dagster volumes write as the container user; check
  the proposals dir isn't left root-owned, the `apps/vellum-render/dist` gotcha). Keep the mount **narrow**
  (`proposals/` only rw).
- **Timer ↔ apply collision (P4.15).** The 15-min linguist-commit timer pushes from the same repo. Make
  apply path-scoped + fetch/rebase before push; decide whether the timer should also redeploy on
  `apps/akasha-backend/content` changes (today it only watches `apps/linguist/**`) — likely **yes**, so a
  heartwood-apply commit also auto-redeploys akasha if apply's own redeploy is skipped.
- **Two CodeMirror/SSR seams.** The editor route is `ssr:false` (client-only); the rest SSR. Mind the
  `noUncheckedIndexedAccess` + hydration seams the harrow/vellum ports hit.
- **Conflicts are built-but-unexercised** (no `conflict` nodes on `2025-8-28`, P4.10) — test the
  `ConflictCard` on a synthetic fixture so it isn't dead-on-arrival.
- **`already-known` skips + `unplaced`** are *audit*, not actionable in the surface (read-only display) —
  don't build edit affordances for them (the human acts on `page`/`registry-add`/`conflict` only).
- **akasha snapshot regen on the host** needs the akasha-backend python env (it's a uv member) — confirm
  `just` can materialize the asset host-side (chronicle/Phase-2 backfills run host-side, so the env exists).

---

## 9. Next step

This scope doc is **question-free** (P4.1–P4.18 settled; the four forks resolved with the stakeholder).
Per `resolve-open-questions-before-next-stage`, advance to the **NLSpec** (`octo:spec` →
`thoughts/astra/specs/0020-heartwood-phase4-review-writeback-spec.md`), built on this doc + the Phase-3
change-set contract. Then implement with `octo:embrace` — telemetry from day one, port faerrin's review
workflow (not its prose pipeline), reproduce both CI lanes locally before pushing, and update
`[[heartwood-0020-gotchas]]` with the load-bearing gotchas (the bind-mount seam, the host-apply recipe,
the timer coordination).

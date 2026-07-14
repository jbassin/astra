# RESUME — pick up astra work here

A living handoff doc. To resume in a fresh session, the prompt can simply be:
**"Read `thoughts/shared/RESUME.md` and continue."**

Keep the **Current state** section below updated as work lands (it's the only part that goes stale —
everything else points at durable docs). Update it when you finish a slice/subsystem.

---

## Orient first (read before doing anything)

1. **`CONTRIBUTING.md`** (root) — the practical guide: dev process, exact CI commands, working-style
   rules, the gotchas catalog. Primary onboarding doc.
2. **`CLAUDE.md`** — authoritative conventions.
3. **`thoughts/astra/plans/0000-astra-migration-roadmap.md`** — phases + the decisions ledger A–I.
   Note **Decision I**: frontends are **SSR Compose services behind Caddy**, not prerendered static.
4. **`thoughts/shared/memory/MEMORY.md`** + its memories — especially the feedback memories
   **`verify-before-acting`** and **`no-silent-scope-cuts`**.

## How to work (hard rules — see the feedback memories)

- **Reuse what exists; don't reinvent** — mirror the nearest already-built astra subsystem/lib for any logic.
- **Verify before acting** — check the real repo/config/source; don't assume or run on a default.
- **Build the spec's scope in full; never silently collapse/defer** to fit budget — surface the trade-off
  and ask. Only defer what the spec explicitly sanctions.
- **Commit each CI-green slice** (Conventional Commits) and **push on chunk completion**, after
  reproducing CI locally. Don't accumulate uncommitted work; don't watch the GHA run (confirm push + one
  status check).
- **Reproduce CI locally before pushing:**
  ```
  uv run ruff check && uv run ruff format --check && uv run ty check && uv run pytest
  bun --filter '*' typecheck && bunx biome ci . && bun --filter '*' test && bun --filter '*' build
  ```
  (scope to the lane/app you touched).

---

## Current state — UPDATE THIS SECTION (as of `242ee0c`, 2026-07-14 — codex (0029) P3 SPEC FINAL; ▶ `octo:embrace` P3 S1; heartwood ON HOLD)

> **✅ codex (0029) P3 (faceted browse + search) — SPEC FINAL `242ee0c`**
> (`thoughts/astra/specs/0029-codex-p3-browse-search-spec.md`, D29-32..38; staff-orchestrator
> + in-house research agents — no external octo providers on this host, sanctioned fallback).
> **Empirical basis, not estimates:** a live Pagefind 1.5.2 build over the REAL 46,192-entity
> corpus (33 s, 49.1 MB bundle, ~470–535 KB cold-start / 35–100 KB warm query, **~3.8 GB
> native-indexer RSS → index build is HOST-ONLY**, `just codex-search-index`, never
> CI/Docker); a full-corpus facet-derivation analysis (big-12 facet sets pinned; trait
> case-fold 1,082→644 mandatory; facets only on Foundry-merged entities; superseded
> (`remasteredAs`≠∅) = 11,012; level spans -2..28); Pagefind-at-scale literature (filters are
> string-equality only; prefix fallback ≠ typo tolerance; `addCustomRecord` takes structured
> filters/meta).
> - **Stakeholder decisions (batched + resolved 2026-07-14):** 5e.tools-depth facets
>   everywhere (data-derived) · omnibar + `/search` page · legacy hidden by default behind a
>   site-wide toggle · full rows client-side, filter locally · extractor gap closed for all 5
>   categories (background/heritage/ancestry/condition/class) · `creature.family` populated
>   from AoN.
> - **Adversarially reviewed, 3 blockers + 5 minors + 4 nits ALL folded:** (B1) TanStack's
>   default search parser eats a bare `+` via the URLSearchParams convention (verified) →
>   sigil-free includes / `-` excludes; (B2) superseded = 11,012 measured, not P2's 7,152
>   legacy-pair figure; (B3) S1 owns a shared `facetKeys.ts` allowlist so emit doesn't depend
>   on S3's facetDefs. Plus toggle-flap precedence (URL wins on initial load only), collision
>   disambiguation extended to search surfaces, explicit empty states + sort decision,
>   StaticMount registered unconditionally (per-request fail-soft).
> - **▶ NEXT: `octo:embrace` P3 S1** (emit extensions — transform-only, no stakeholder
>   dependency): facetKeys allowlist, 5-cat extractor gap, family join, IndexRow facets +
>   superseded, compact `_index.json`, fixture/report regen, determinism 3×. Slices S1–S5;
>   **P2 acceptance H (page review) folds into P3's S3 stakeholder gate** (M7/M11 expected
>   behaviors ride along).
> - [[codex-0029-gotchas]] carries the full P3-spec section (measured Pagefind numbers, the
>   facet-derivation anchors, the URLSearchParams codec find, the octo-provider fallback).
> - heartwood still ⏸ ON HOLD (unchanged below); other open items unchanged (webhook
>   rotation, Class-A alerting breadth, scribe ASR cost telemetry).

---

### Previous section (2026-07-14, earlier same day) — P2 BUILT (superseded above)

## (was) Current state (as of `c9d1d3b`, 2026-07-14 — codex (0029) P2 BUILT, all 4 slices; ▶ acceptance H = stakeholder page review; heartwood ON HOLD)

> **✅ codex (0029) P2 (entity pages) — ALL FOUR SLICES BUILT + PUSHED in one autonomous
> overnight run** (staff-orchestrator + sonnet engineers, one reviewed commit per slice;
> spec `thoughts/astra/specs/0029-codex-p2-entity-pages-spec.md` status → BUILT):
> **S6 `b174b15`** (P1.6 transform addendum D29-19..21: npc-only import, 150 pregens excluded;
> typed `stats` + strike/spellcasting EmbeddedItem fields, schemaVersion 2; `_index.json`
> rename rescuing `ancestry/index`+`archetype/index` — corpus now **46,192** files == manifest
> exactly; determinism 3×) · **S1 `031a7fb`** (total 18-kind CodexNode→React renderer + B1
> glyph shim + B2 block-in-`<p>` guard + embed inlining + statblock/facet/citation/edition
> components; 88-category totality test + 6 byte-exact goldens) · **S2 `72f224e`** (strider
> shell + D29-23 corpus reader w/ traversal guard + fixture fail-soft; `/{category}/{slug}`
> routes w/ `@legacy`/non-ASCII round-trip; real-corpus SSR proven incl. summoner M7) ·
> **S3 `c9d1d3b`** (throwaway `/` + `/{category}` listings, feat = 4.44 MB ≈ spec estimate;
> akasha Popover port; **acceptance A–G all met with evidence** — all-88-category row-count
> loop, Playwright hover + zero hydration errors, real SigNoz `astra.codex` spans,
> hermeticity gate). Codex member: 909 tests; repo 1,937; both lanes green; all pushed.
> - **▶ NEXT: acceptance H — stakeholder review of the rendered pages** (`pnpm dev` or
>   `pnpm start` in `apps/codex` against the real corpus; the §5 C spot-set:
>   `creature/red-dragon-adult`, a carve-out creature, `spell/heal(@legacy)`,
>   `class/summoner`, `rules/counteracting`, `creature/ixamè`, `ancestry/index`, the
>   brokenRef `warfare-army/tiger-lord-berserkers` page). **Two flagged expected behaviors
>   to eyeball (spec M7/M11): embed second layer renders as links, and AoN-joined creatures
>   show statblock twice (structured header + AoN prose)** — if he wants dedup that's a
>   follow-up decision. After H sign-off: `octo:spec` P3 (faceted browse+search).
> - Post-S6 facts P3 must carry: corpus 46,192; `blockquote` corpus-extinct (fixture asserts
>   extinction both ways); one upstream-typo fail-soft (`hazardStatsHtmlFailed=1`).
> - [[codex-0029-gotchas]] carries the full P2 section (client-bundle leak class, built-server
>   fixture-root marker-walk, per-request-Zod spec deviation caught in review, the
>   inlineAction cost-map correction, session-limit/API-error agent resumes).
> - heartwood still ⏸ ON HOLD (unchanged below); other open items unchanged (webhook
>   rotation, Class-A alerting breadth, scribe ASR cost telemetry).

---

### Previous section (2026-07-13) — P1 COMPLETE incl. P1.5; exit gate CLOSED (superseded above)

## (was) Current state (as of `defd586`, 2026-07-13 — codex (0029) P1 COMPLETE incl. P1.5; exit gate CLOSED; ▶ spec P2; heartwood ON HOLD)

> **✅ codex (0029) P1 — COMPLETE incl. the P1.5 AoN-primary rework; EXIT GATE CLOSED
> 2026-07-13.** The stakeholder reviewed the transform report (published as a Claude artifact,
> `codex-p1-report-review`) and re-decided the corpus policy live → spec **§8 addendum
> `12ea536` (D29-14..18)**: **AoN-primary** — keep every AoN-only + merged entity; equivalence
> joins ({weapon,armor,shield}↔equipment · class-feature↔27 class-subsystem cats ·
> action↔{relic,tactic,feat} level-guarded · spell↔ritual · domain "X Domain"→"X"); drop every
> other Foundry-only entity incl. the four Foundry-only categories (2,233 dropped) **except the
> creature/hazard carve-out** (2,242+660 kept). Built same day by the staff-orchestrator +
> sonnet engineer: **S5a `eadb218`** (url-duplicate dedup, 982 docs — all equipment/item-bonus
> ES parent-child duplicates) · **S5b `7ccc5c5`** (equivalence joins + normalizations) ·
> **S5c `0210b1c`** (drop pass + report drop-accounting + fixture regen) · **S5d `defd586`**
> (orchestrator-review fix: resolution-time link repoint — joinBrokenRef 890→2,634→**0**,
> 6,616 repoints incl. the legacy-twin silent-mislink).
> - **Corpus now: 46,326 entities / 627.7 MB.** domain 100% / weapon 95.2% / armor 90.6% /
>   shield 99.2% / spell 99.7%; STOP residue = only the 3 accepted-asymmetry categories
>   (creature-ability 9%, hazard 42.8%, warfare-army 31.8% — measured zero-AoN-counterpart).
>   550 hermetic tests; determinism 3×; both CI lanes green; all pushed.
> - **▶ NEXT: `octo:spec` P2 (entity pages) against the REAL post-P1.5 corpus.** P2 inputs to
>   carry: the post-drop category set (boon/pfs-boon/kingdom-feature/effect gone), postDrop
>   broken residue (530+40, report-visible), 1,830 residual collisions, D29-16's accepted
>   naming narrowing (domain pages titled "X Domain"), license unknown=235 still to trace.
> - **[[codex-0029-gotchas]] carries the P1.5 section** (raw-NUL-bytes-make-source-git-binary,
>   resolution-time-not-patch-time link repoint, post-drop reconciliation, the empirically
>   REFUTED creature dedup theory, the timer-pushes-main find).
> - heartwood still ⏸ ON HOLD (unchanged below); other open items unchanged (webhook rotation,
>   Class-A alerting breadth, scribe ASR cost telemetry).

---

### Previous section (2026-07-13, earlier same day) — P1 S1–S4 built, pre-review (superseded above)

> **▶ codex (0029) P1 — ALL FOUR SLICES BUILT + PUSHED in one overnight run** (staff-orchestrator
> + sonnet engineers, one reviewed commit per slice): S1 `108571d` (member scaffold + both real
> snapshots — AoN 43,684 docs/93 cats, Foundry 28,636 @ pf2e-8.3.0, counts+hashes pinned in
> `corpus-manifest.json`) · S2 `40b2447` (CodexNode/CodexEntity schema, sluggify port
> 28,636/28,636 agreement, enricher grammar + HTML parser, assembly + journals — 25,781 entities,
> zero unknown-markup) · S3 `8465625` (AoN markup grammar 29 tags, url→id link table, 243-book
> licenseMap w/ ZERO unknown residue, facets — 43,631 metas, zero hard failures) · S4 `8d66293`
> (join + deterministic emit + report + 1.8 MB asserted-coverage fixture + `just codex-refresh` +
> README). Plus `98bbef9` fix(ontology): pre-existing red main (heartwood apply hadn't re-seeded
> entity.kdl). 503 hermetic tests; both CI lanes green; determinism gate proven (3 runs).
> - **Corpus: 50,952 entities / 97 categories / 656 MB** (spec estimated 100–200 MB — feed the
>   real number into P5's COPY-vs-bind-mount decision). Transform 15.4 s.
> - **▶ P1 EXIT GATE (the only open item): stakeholder review of
>   `apps/codex/data/corpus/report.md`** — headline: **9 both-source categories sit <50% joined
>   (spec §6 STOP: re-decide join keys with Josh BEFORE P2, no fuzzy-matching)** — `domain` 0%
>   (Foundry "X Domain" vs AoN "X", one systematic rule would fix), armor 18%/weapon 27%/
>   shield 14% (Foundry named tiered variants AoN doesn't split), class-feature 41%/
>   creature-ability 9% (granularity mismatch), hazard 43%, action 44%, warfare-army 32%.
>   Dragons prove the D29-7 normalization (13.8%→98.1%); spells 91.7%; creature overall 57.6%.
>   Also flagged: 2,494 residual `-2` collisions partly an AoN slug-index dedup artifact;
>   S2 excluded the `criticaldeck` journal pack beyond D29-8's literal list (same rationale).
> - **After the review:** `octo:spec` P2 (entity pages) against the REAL corpus; the
>   [[codex-0029-gotchas]] memory carries every load-bearing find (no-system.slug/basename-is-
>   slug, non-unique AoN urls, the "(Remastered)" licenseMap override, crossref-vs-embed
>   disambiguation limit, the 3 emit-gate bug catches).
> - **Acceptance H note:** `just codex-refresh` ran end-to-end post-commit — the resulting diff
>   was ONLY the two `fetchedAt` timestamps (both re-fetches byte-identical: pinned tag stable,
>   AoN un-drifted in 11 h) — reverted rather than committing timestamp churn.
> - **Docs (unchanged):** spec `thoughts/astra/specs/0029-codex-p1-ingest-spec.md` (D29-1..13);
>   viability `thoughts/shared/research/2026-07-12-codex-0029-viability-thoughts.md` + scope
>   `…/2026-07-12-codex-0029-thoughts.md` (decisions C-1..C-8: public-but-noindexed, CUP gray
>   tier, hybrid corpus, remaster-primary + legacy toggle, all categories, gitignored corpus +
>   committed fixture, TS ingest no Dagster, no auth gate).
> - **Phases:** P1 ingest ✅ (pending report review) → P2 entity pages (M) → P3 faceted
>   browse+search (M) → P4 rules browser (S-M) → P5 deploy (S).

---

### Previous section (2026-07-12, same day) — heartwood ON HOLD after the first real apply (still current for heartwood)

> **⏸ heartwood 0020 — ON HOLD (stakeholder call, 2026-07-12), with the D1 create-half PROVEN
> LIVE.** Josh worked the review surface for real: 11/58 cards decided (2 approved / 9 rejected
> w/ reasons), hand-wrote both bodies in the editor, and `just heartwood-apply 2025-8-28` ran —
> **`fd6e47e` wrote `Bestiary/Auger` + `Bestiary/Ugathal` into the corpus (123 pages validate
> clean, snapshot regenerated) and both render live at `akasha.iridi.cc/Bestiary/{Auger,Ugathal}`**
> (case-preserved path URLs; SSR HTML grep-verified through the edge; akasha-frontend rebuilt).
> - **First-real-apply bug found + FIXED (`ebdef37`):** the recipe's path-scoped `git add` staged
>   only `review.kdl`, not the now-human-edited proposal `.vellum` bodies → the unstaged edits
>   aborted the rebase step mid-recipe ("cannot rebase: You have unstaged changes"). Recipe now
>   stages the whole `proposals/<date>` dir. Recovery was: fold the bodies into the write-back
>   commit (amend, was unpushed) → rebase → push → manual `docker compose up -d --build
>   akasha-frontend`.
> - **▶ WHEN RESUMING heartwood:** the D1 **rewrite-half is still open** — 0 rewrites approved
>   (19 rewrite cards exist), 47/58 cards undecided at
>   `https://heartwood.iridi.cc/review/2025-8-28`. `apply.py` skips undecided cards and stamps
>   `committed-at` (idempotent), so approve ≥1 rewrite → re-run `just heartwood-apply 2025-8-28`
>   closes D1. Phase 5 (backfill ~40 sessions + automation) stays gated behind that.
> - **▶ NEXT: nothing code-in-flight.** Other open items unchanged: webhook rotation, Class-A
>   alerting breadth, scribe ASR cost telemetry.

---

### Previous section (2026-07-12, same day) — facts-only rework COMPLETE (superseded above)

> **✅ heartwood 0020 FACTS-ONLY REWORK — COMPLETE, scope→spec→build→deploy→live-gate in one
> session.** Stakeholder redirect: the machine must NOT write wiki prose — review cards show only
> the extracted FACTS and the human authors every body in the in-browser editor. Docs commits
> `adc63ac` (scope) + `88fb0e6` (spec, adversarially reviewed — 2 blockers folded in) · S1
> `f3a834b` (backend: `draft.py`/`voice.py` deleted, `lint.py`→`page_type.py`, zero LLM calls,
> manifest drops lint/conflict nodes) · S2 `3eb306c` (frontend facts-first + guards + regenerated
> `2025-8-28`: **58 pages — 39 create / 19 rewrite, 0 skipped**; creates skeleton-exact, all 19
> rewrite bodies byte-identical to the corpus) · S3 deployed via `just up` + live gate PASSED
> (SSR facts-first on all 58 cards; Playwright 7/7: approve guards, the B2 flush-on-unmount race
> closed, decision persisted to `review.kdl` + survived reload — then prove-and-reverted, the
> change-set is PRISTINE). Spec `thoughts/astra/specs/0020-heartwood-facts-only-rework-spec.md`
> status COMPLETE; **[[heartwood-0020-gotchas]] has the rework section** (the debounced-save race
> + the remount-reseed sibling, the `astra.heartwood-frontend` SigNoz name, the
> subagent-restarted-timer incident).
> - **▶ NEXT: the D1 content acceptance, now human-penned** — Josh writes ≥1 create + ≥1 rewrite
>   from the staged facts at `https://heartwood.iridi.cc/review/2025-8-28`, approves them, then
>   `just heartwood-apply 2025-8-28` → verify live on akasha. Phase 5 (backfill ~40 sessions,
>   extraction-cost-only now + automation) stays gated behind it.
> - Other open items unchanged: webhook rotation, Class-A alerting breadth, scribe ASR cost
>   telemetry.

---

### Previous section (2026-07-11) — 0028 COMPLETE; 0027 CLOSED (superseded above)

## (was) Current state (as of 2026-07-11 evening — 0028 COMPLETE; 0027 CLOSED)

> **✅ portal-player (0028) — COMPLETE, scope→spec→build→deploy→live-gate in two days, gate
> A–H PASSED 2026-07-11 with the stakeholder.** S1 `8655edb` · S2 `a889034` · S3 `a59d53c` ·
> live-gate fixes 0.4.1 + 0.4.2 (deployed, module updated by the GM via Foundry UI). The
> player key exposes exactly 5 read-only tools on `/mcp`; markdown at the server; spec
> `thoughts/astra/specs/0028-portal-player-spec.md` status COMPLETE carries the full gate
> record; **[[portal-player-0028-gotchas]] is THE reference** (the source-vs-live field-
> ownership catalog — hydrated Roll instances / heroPoints source-only / actor-level spell
> DC — the env-name crash-loop, the F non-vacuous exclusion proof, onboarding + rotation
> recipes).
> - **Player onboarding:** `claude mcp add --transport http portal-player
>   https://portal.iridi.cc/mcp --header "Authorization: Bearer <portal_player_api_key>"`
>   (key in SOPS; it transited chat 2026-07-11 stakeholder-sanctioned — rotate anytime via
>   `sops set` + `just up`).
> - **▶ NEXT: nothing code-in-flight.** Long-standing open items unchanged: heartwood Phase-4
>   content acceptance (stakeholder-paused); nice-to-haves (webhook rotation, Class-A alerting
>   breadth, scribe ASR cost telemetry, feats summary-default symmetry if ever wanted).
> - **Scope doc:** `thoughts/shared/research/2026-07-11-portal-player-0028-thoughts.md` — verified
>   vs repo (per-request McpServer ⇒ per-key tool scope = cheap conditional in the `mcp.ts:499-512`
>   auth branch; 8-file key plumbing; zero Dockerfile ripple), vs the live world (party actor +
>   4 PCs + familiar Othello; `toObject()` has NO combat stats — AC/saves/skill totals/ability
>   scores are ALL runtime-derived), and vs the live container source (v13 ChatMessage schema —
>   `author` not `user`; serialized-Roll JSON is render-complete; pf2e `flags.pf2e.context`
>   taxonomy; **`game.messages` is UNCAPPED client-side** ⇒ pagination = module-side
>   filter+slice, cursor `(timestamp,_id)`).
> - **Spec:** `thoughts/astra/specs/0028-portal-player-spec.md` — D28-1..7 stakeholder-resolved
>   (derived stats from the live prepared Actor, fail-soft; **public-rolls-only baked module-side**
>   — `whisper.length===0 ∧ !blind`; PC predicate `type ∈ {character,familiar}`; item tri-scope
>   world+party-embedded+compendium with `ownership.default ≥ 2` on world items) + D28-8..14
>   spec-level (PLAYER_TOOL_NAMES scope machinery; `auth` telemetry attr; version lockstep →
>   0.4.0 at S3; module-skew = typed error). 4 slices: S1 key+scope (Foundry-free) · S2
>   party+player · S3 item+rolls+lockstep · S4 deploy+live gate A–H.
> - **✅ Spec FINALIZED — adversarial review RUN + FOLDED IN (same session).** 2 blockers fixed:
>   (B1) pf2e `metagame_secretChecks` ON lets a SECRET check land public-shaped
>   (`whisper=[] ∧ !blind` with only `flags.pf2e.context.secret=true` marking it — verified
>   `pf2e.mjs:23942`) → D28-3 is now a THREE-prong filter incl. the `context.secret` backstop;
>   (B2) compendium packs are NOT inherently public (per-pack ownership, GM-restrictable) →
>   D28-5 pack-visibility gate. Plus: closed `BridgeErrorCode` enum + `Bridge#onMessage`
>   silent-drop turns unknown error codes into TIMEOUTS under rollback skew → S3 maps
>   unknown-code responses to `foundry-error` (forward-proofs all future additive codes) +
>   rollback-symmetry rule in Risks; the "~10 KB" section cap was asserted-not-derived → D28-11
>   hard 12k-char cap + group-summary fallback, S2 measures Argyle; acceptance-F vacuous-pass →
>   S4 stages a GM-hidden item; D28-8 `AuthContext {scope, method}` two-field split. **▶ RESUME
>   AT: `octo:embrace` S1** (key + scope machinery, Foundry-free).
> - Housekeeping DONE 2026-07-11: `deploy/sops/secrets.enc.yaml` (the 0027 S4
>   `foundry_portal_gm_password` sops-set) committed deliberately; the `routeTree.gen.ts` regen
>   flap restored from HEAD.
>
> **✅ 0027 headless-gm CLOSED 2026-07-11 — the ≥24h soak PASSED** (SigNoz `astra.portal-headless`
> over 2026-07-09T00:00Z→2026-07-11, ~2.2 days: zero in-window ERROR — the only 5 ERRORs predate
> the soak and are the `bda23ee` viewport noise; WARNs all demoted page-console world noise per
> `6fd8d5e`; ONE clean self-heal 2026-07-11T00:10Z, join→in-world ~0.5s, relaunches=0, after a
> Foundry-side kick; two transient socket re-establish WARNs healed with no state change; portal
> server 0 ERROR, bridge stable). Spec status → COMPLETE (all A–H); memory finalized.

---

### Previous section (2026-07-08) — 0027 S4 live gate run (soak-close pointer folded into the entry above)

## (was) Current state (as of `6fd8d5e`, 2026-07-08 evening — 0027 S4 live gate RUN)

> **▶ headless-gm (0027) — S4 LIVE GATE RUN, acceptance A/B/C/D/F + G-signals ALL PASSED;
> ▶ REMAINING: the ≥24h soak (started ~2026-07-08T23:56Z) + acceptance E.** The gate ran with
> the stakeholder at the table: SOPS `foundry_portal_gm_password` set; the flagged `options.json`
> `"world":"faerrin"` edit applied (docker-as-root, backup `options.json.bak-2026-07-08`,
> container `foundry_faerrin`, data dir `/emerald/data/apps/apps/foundry_faerrin/data`); user
> "Portal" created (id `xlC6LfQ7godJVVFf`); module → 0.3.0 + `bridge-user-id` set.
> **Live results:** zero-tab read+write as Portal ✅; `bridge-status` `userName:"Portal"` ✅;
> THE oscillation observed for real (six connects/13s in the pre-setting window) then dead ✅;
> `docker restart` → in-world in ~5s ✅; world-down politeness during the GM's real Setup
> session (zero /join attempts) ✅; noCanvas smoke create/delete, zero debris ✅; three signals
> in SigNoz, no ERROR since the fixes ✅. **Two live fast-follows:** viewport 1600×900 `bda23ee`
> (Foundry's 1366×768 minimum console-error paged Class A) + page-console demote-to-warn
> `6fd8d5e` (world noise must never trip the error/fatal alert; `module_console{level}` keeps
> the real level). **Live gotchas** (detail in [[headless-gm-0027-gotchas]]): set
> `bridge-user-id` BEFORE headless-up; a mis-pasted setting value (console shows ids WITH
> quotes) = `not-designated` on every tool call while `bridge-status` still shows connected —
> the setting reads live, no F5 to fix.
> **Acceptance E PASSED (2026-07-09T00:03–00:11Z, stakeholder-approved bounce ×2):** auto-launch
> proven (restart → `faerrin` active ~20s, zero human action) — and the first bounce exposed a
> REAL bug: `classify()` was passive, so the restart left a stale dead DOM stuck `world-down`
> forever (Foundry pushes only reach live sockets; the earlier Setup-session recovery only worked
> because that page was live). Fixed `c553290` (re-navigate before classifying any
> non-`/game`/non-`/join` page); the second bounce proved the self-heal live — stale `/game` →
> Foundry kicks to `/join` → re-login, in-world in ~36s, joins=2, relaunches=0, no recreate.
> **▶ To close 0027: ONLY the ≥24h soak** (check SigNoz `astra.portal-headless` after
> ~2026-07-10T00:00Z: no relaunch loop, no unexpected ERROR, bridge stable), then spec →
> COMPLETE + finalize the memory.
>
> _(Original S1–S3 checkpoint, superseded by the gate run above:)_ the stakeholder sanctioned
> the 0025-parked idea: a supervised
> headless-Chromium GM session (dedicated Foundry account) as a Compose unit, so portal MCP tools
> work 24/7 with zero human tabs open.
> - **Docs (committed):** scope `thoughts/shared/research/2026-07-08-headless-gm-0027-thoughts.md`
>   (`5699ab5`, verified vs live host + module code + the live server's own `foundry.mjs`); spec
>   `thoughts/astra/specs/0027-headless-gm-spec.md` (`68ab06b`, D27-1..14 all resolved,
>   adversarially reviewed). Stakeholder decisions: **D27-1** world auto-launch via a one-line
>   `options.json` `"world":"faerrin"` edit (verified currently `null` — a container restart
>   strands at /setup today); supervisor NEVER touches /setup, no admin key in SOPS; **D27-2**
>   strict designated dialer (`bridge-user-id` world setting, no fallback); **D27-3** public edge
>   `btl.iridi.cc`; **D27-4** account "Portal", full GM, password → SOPS
>   `foundry_portal_gm_password`.
> - **S1 `32f509b`** — module designated-dialer gate + `dispatchQuery` re-check + new
>   `not-designated` error code; `AuthMeta`/`BridgeStatus` gain optional `userId`/`userName`
>   (bridge-status now proves WHO holds the bridge); module+server 0.3.0 lockstep.
> - **S2 `f281283`** — new nested member `apps/portal/headless` (@astra/portal-headless, port
>   10373): supervisor state machine (join/in-world/world-down/broken; world-down = polite
>   backoff-idle, ZERO login attempts) hermetic behind an injected PageAdapter (18 tests, fake
>   timers); Playwright driver (noCanvas localStorage seed on every (re)launch, `page.on(console)`
>   warn/error → telemetry — the ONLY way a misconfigured bridge-user-id is visible); `/health`
>   (ok = process+browser only; world-down is NOT unhealthy); config block `portal-headless` +
>   BOTH schema mirrors.
> - **S3 `4914111`** — Dockerfile (vellum-render Chromium recipe × portal-server unbuilt-TS idiom)
>   + compose unit (`shm_size: 1gb`, healthcheck per D27-11) + the 12-sibling manifest-COPY
>   ripple. **Proven against non-live targets:** unreachable origin → `broken`, bounded backoff,
>   no crash-loop; local /setup fixture → `world-down`, zero `/join` hits in the fixture log.
> - **▶ S4 NEXT — needs Josh at the table:** (1) create user "Portal" (Gamemaster) in-world;
>   (2) `sops set foundry_portal_gm_password`; (3) the flagged `options.json` edit (root-owned →
>   docker-as-root); (4) set module `bridge-user-id` to Portal's id + F5 his tab; (5) "deploy it"
>   → `just up` + GM module update + F5; (6) exit gate A–H incl. zero-tab tool calls,
>   `bridge-status` userName "Portal", no-oscillation with his tab open, restart resilience,
>   Return-to-Setup politeness, noCanvas smoke, **≥24h soak** before closing the spec.
> - ⚠️ **Surfaced to Josh (pre-existing, NOT 0027):** the host Caddy admin API (`localhost:2019`)
>   is unauthenticated and serves the full config incl. a plaintext Cloudflare DNS token —
>   `/emerald/data/reverse-proxy` territory; recommend `admin off`/unix-socket when convenient.

---

### Previous section (same day) — portal-authoring 0026 COMPLETE (superseded above)

> **✅ portal-authoring (0026) — COMPLETE, same-day scope→spec→build→deploy→live-acceptance.**
> Portal is now a full content-authoring surface against the live pf2e "Faerrin" world: **8 new
> tools (18 total)** — `create-actor` (hand-authored NPC/hazard statblocks + embedded strikes),
> `create-item` (effects/auras/spells/spellcasting entries w/ rule elements; `baseUuid` hybrid
> clone+patch, D-1 supersedes 0023 D5), `apply-condition` (incl. the source-verified NON-dialog
> persistent-damage path), `create-light`, `create-macro`, `update-document` (dot-path, full PC
> edit access + derived-path deny-list), `delete-document` (refuses anything without the D-6
> `flags[astra-portal]` stamp), `execute-macro` (own `allow-macro-execution` module setting).
> S1 `ccaadbe` · S2 `f1c8431` · S3 `c7a3958` · S4 deploy+docs; module version 0.2.0; spec
> `thoughts/astra/specs/0026-portal-authoring-spec.md` status COMPLETE (exit-gate nuance on two
> unit-only guards recorded there + in [[portal-authoring-0026-gotchas]]); scope doc
> `thoughts/shared/research/2026-07-07-portal-authoring-0026-thoughts.md` is THE pf2e authoring
> reference (validation split, RE fail-soft, aura two-item, spell↔entry linking, PC source-vs-
> derived). Live loop verified through the public edge with the GM present; full `portal.audit.*`
> trail in SigNoz. **Operational gotchas for next time** (session MCP tool-list snapshot →
> `/mcp` reconnect; `portal-module-install` EACCES → docker-as-root cp; classifier gates on
> `just up`/`execute-macro`/non-session deletes) in [[portal-authoring-0026-gotchas]].
> **▶ NEXT: nothing code-in-flight** — heartwood Phase-4 content acceptance remains the
> stakeholder-paused main-track item; nice-to-haves unchanged (webhook rotation, Class-A alerting
> breadth, scribe ASR cost telemetry) + new small ones: fix `portal-module-install` perms, GM
> hand-deletes the pre-stamp 0023 Goblin Warrior debris, optionally live-prove the two unit-only
> guards.

---

### Previous section (same day) — portal-oauth 0025 COMPLETE, all A–H (superseded above)

> **✅ portal-oauth (0025) — COMPLETE. Acceptance F closed 2026-07-08T01:03Z: the stakeholder
> connected claude.ai for real** — its own DCR client (`748f3034-…`) registered → consent-ok →
> token-issued in the live audit trail; tool calls work from claude.ai chats. Portal is now
> reachable from Claude Code (static key), claude.ai (OAuth), and the Foundry module (WS bridge).
> **▶ NEXT: nothing is code-in-flight** — heartwood Phase-4 content acceptance remains the
> stakeholder-paused main-track item; nice-to-haves unchanged (webhook rotation, Class-A alerting
> breadth, scribe ASR cost telemetry).
>
> **What 0025 is:** claude.ai custom connectors are OAuth-only (the `static_headers` beta isn't on
> the account), so portal-server now runs a single-user **OAuth 2.1 authorization server** on the MCP
> SDK's own `mcpAuthRouter` toolkit: DCR with a claude.ai+loopback redirect allowlist, a consent
> page keyed on the existing `portal_mcp_api_key` (no new SOPS keys), opaque sha256-hashed tokens
> (1h access, rotate-on-refresh), JSON state persisted on the new `artifacts/portal-oauth` bind
> mount (connections survive redeploys — live-proven). `/mcp` is dual-auth (legacy static key OR
> OAuth token — the Claude Code config is untouched); 401s carry the `WWW-Authenticate:
> resource_metadata` discovery header. S1 `b6de520` · S2 `fa988ff` · S3 deploy; spec
> `thoughts/astra/specs/0025-portal-oauth-spec.md` status COMPLETE; gotchas
> [[portal-oauth-0025-gotchas]]. **Live-verified through the public edge:** discovery docs, full
> DCR→consent→PKCE→token→tool-call flow, refresh rotation + old-refresh `invalid_grant`,
> persistence across a container restart, SigNoz `portal.oauth.*` audit events, legacy bearer
> still green — then the real claude.ai connect on top (acceptance F).
>
> **Assessed + DECLINED (end of session, stakeholder call — don't re-scope unprompted):** making
> portal work with NO GM tab open. The only viable shape is a supervised **headless-Chromium GM
> session as a Compose unit** (vellum-render browser-in-container precedent; needs a dedicated GM
> account, `FOUNDRY_WORLD` auto-launch, a login/rejoin supervisor, and a small module setting so
> two GM sessions don't oscillate over replace-adopt). Direct server-side integration is a dead
> end (no Foundry API; LevelDB process-locked; socket.io client reimplementation too fragile).
> Revisit only if the stakeholder asks — the sketch lives in this entry + [[portal-oauth-0025-gotchas]].

---

### Previous section (same day) — portal 0023 live acceptance CLOSED (2026-07-07 evening)

> **✅ portal (0023) — COMPLETE, ALL ACCEPTANCE A–H MET.** All 6 slices built + pushed
> (`87f633f`…`18cecff`), deployed live at `portal.iridi.cc`, and — this session — the GM (Josh)
> installed + configured the module in the launched "Faerrin" world and the **live acceptance E/F/G
> passed through the public edge**: `bridge-status` connected (Faerrin / pf2e 7.12.2 / Foundry
> 13.351); reads = Monster-Core "goblin" search + full-actor `get-document` + `get-current-scene`
> (`engine-heart`) + `search-world`; writes = import Goblin Warrior → token on the active scene
> (tokenCount 7→8) → journal create, `cap-exceeded` rejection at quantity 11 (cap 10), every write
> audit-logged (`portal.audit.*`, span-linked); SigNoz traces+logs+metrics flowing, 0 unexpected
> errors. Spec status → COMPLETE; acceptance gotchas in [[portal-0023-gotchas]].
>
> **Acceptance-session findings:** the module dials only on the `ready` hook — after setting WS URL
> + bridge key the GM must **reload (F5)** or the bridge stays offline with zero server-side WS
> attempts; `search-compendium`'s `type` param means pack `metadata.type` (`"Actor"`), not the pf2e
> subtype (`"npc"`) — the zod schema lacked `.describe()` so an MCP client guessed wrong and silently
> got `[]` (**fast-follow SHIPPED same session, `e3de7bf`:** per-field `.describe()` across all
> LLM-facing tool schemas + a real-client tools/list test; rebuilt + redeployed + edge-verified —
> the bridge shows offline afterwards only because the world was shut down, by-design liveness);
> `import-from-compendium`'s `folder` must already exist (typed
> `not-found`, it doesn't create one). Acceptance debris left in the world for Josh to eyeball then
> delete: actor "Goblin Warrior" (`KSKAiNDEg0nJ2YOx`), its token on `engine-heart`, journal
> "Portal 0023 acceptance".
>
> **▶ NEXT: no subsystem is code-in-flight.** Open items — heartwood Phase-4 **content acceptance**
> (human-gated D1: approve ≥1 create + ≥1 rewrite on `heartwood.iridi.cc` → `just heartwood-apply
> 2025-8-28`; Phase 5 backfill gated behind it; ON HOLD by stakeholder); nice-to-haves (rotate the
> Discord alert webhook, broaden Class-A alerting to
> frontends, scribe Groq ASR cost telemetry). MCP client config for portal:
> `https://portal.iridi.cc/mcp` + Bearer `portal_mcp_api_key` (Claude Code: `claude mcp add
> --transport http portal … --header "Authorization: Bearer <key>"`).

---

### Previous session (archive) — mouthpiece 0024 script rework + scribe hallucination gate (2026-07-07 day — COMPLETE + LIVE)

> **✅ mouthpiece 0024 — script rework BUILT + DEPLOYED + LIVE** (S1 `7eec3d4` → S5 `66799a5` + deploy;
> spec `thoughts/astra/specs/0024-mouthpiece-script-rework-spec.md`): Stage 2 is now **clean+enrich**
> (windowed OOC filter → compact `kept_ranges` + floor; one enrich call → synopsis + wikiRefs), Pass A
> debates the full cleaned transcript + a deterministic being.kdl roster block; threads/mega/one-shot
> DELETED; the `digest.json` + top-level `synopsis` contract held (zero downstream edits). 2026-6-29
> re-rendered + published ("The Canary in the Undercroft"). **THE finding: Whisper's confidence
> heuristic (no_speech_prob ∧ avg_logprob) measurably MISSES the you/thank-you hallucination family
> (1,041 segments survived it live) — the TEXT prong (`HALLUCINATION_TEXT_RE` in `astra_llm`, shared
> scribe+mouthpiece) is what kills it.** Scribe two-prong gate shipped (`e23ca0c`/`9068d44`);
> 2026-7-6 re-transcribed clean (5,821→4,777 lines, family=0) + its episode re-rendered + replaced
> live ("The Heart in the Basement", 31 min). Full detail in [[mouthpiece-0024-gotchas]].

---

### Previous session (archive) — portal 0023 build+deploy (superseded by the acceptance close above)

> **▶ portal (0023) — ALL 6 SLICES BUILT + PUSHED + DEPLOYED LIVE (`87f633f` S1 · `f015063` S2 ·
> `a498a35` S3 · `1023381` S4 · `d554527` S5 · `18cecff` S6), live at `portal.iridi.cc`.**
> Verified live that session (post `just up` + `just caddy-reload`): all 18 astra containers healthy
> after the 12-image rebuild (the manifest ripple touched 11 siblings — all 9 public edges still
> 200); `portal.iridi.cc/health` 200; `/module/module.json` renders absolute manifest/download URLs
> from config public-origin; `/module/portal.zip` 200 (37.9 KB, fflate-packaged in-process); `/mcp`
> = 401 unauth, full 10-tool list + `bridge-status` → typed `{"connected":false}` with the bearer;
> SigNoz `astra.portal` spans flowing 0-error. Cert minted itself off the `*.iridi.cc` wildcard
> (~60s of TLS handshake failures — normal, same as ledger). Orchestrator review fixes (recorded in
> [[portal-0023-gotchas]]): the bridge replace-adopt leaked the prior heartbeat interval; module
> reconnect backoff resets only after a ≥10s healthy hold. Known flakes hit: repo-wide `pnpm run
> lint` OOM (use `--threads=4`), the heartwood `routeTree.gen.ts` regen flap, both pre-existing.

---

### Previous session (archive) — portal 0023 scope + spec (superseded by the build above)

> **▶ portal (0023) — an MCP for the FoundryVTT campaign instance. SCOPE + SPEC DONE;
> NO CODE YET. Resume at implementation S1.**
>
> **What it is:** a TypeScript **MCP server** (Streamable-HTTP, a Compose unit behind Caddy at
> `portal.iridi.cc:10372`) + a **custom astra-owned FoundryVTT module** that dials out to it, so an LLM
> client (Claude Code + Claude Desktop) can **search** the pf2e compendium + world entities and
> **create** (import statblocks, drop tokens on the active scene, items, journals) against the live
> **pf2e "Faerrin"** world. Feasibility = **GREEN** (reference impl `adambdooley/foundry-vtt-mcp`, MIT,
> verified v13–14, proves the pattern).
>
> **Docs produced this session (both committed):**
> - Scope: `thoughts/shared/research/2026-07-06-portal-0023-thoughts.md` (verified vs the live host).
> - Spec: `thoughts/astra/specs/0023-portal-spec.md` — **6 slices S1–S6**, decisions **D1–D14**,
>   verified footprint, acceptance A–H, risks, adversarial pass.
>
> **Verified against reality this session (don't re-derive):**
> - Live instance: `felddy/foundryvtt:13.351`, **pf2e 7.12.2**, world `faerrin`, public `btl.iridi.cc`,
>   on Compose project `apps` / network `apps-network` (**separate stack, same host** as astra's
>   `signoz-net`). World currently `null` (idle at /setup) — **liveness is the headline constraint.**
> - **Nested-member fix EMPIRICALLY PROVEN** (the one gating structural risk): `apps/portal/{server,
>   module,shared}` needs **two** one-line edits — add `- "apps/portal/*"` to `pnpm-workspace.yaml`
>   (pnpm `apps/*` is single-level → else undiscovered) **AND** add `"apps/portal"` to the uv
>   `exclude` in `pyproject.toml` (uv hard-errors on the manifest-less parent, even `--dry-run`). With
>   both, `pnpm -r ls` finds all three + `uv sync` exits 0. (See [[portal-0023-gotchas]].)
> - Next free port **10372**; the Dockerfile manifest-COPY ripple hits every sibling TS Dockerfile.
>
> **Locked decisions (stakeholder-chosen — see the spec + [[portal-0023-gotchas]]):** custom module
> bridge (not the ThreeHats relay); **clone-from-compendium ONLY, zero hand-authored pf2e schemas**
> (D5, the crux); Streamable-HTTP MCP + a WS the module dials; two-hop API-key auth; **creates ON by
> default** (D8, gated by isGM ∧ bridge-key ∧ per-request cap + full audit); nested `apps/portal/*`
> layout; **install by Manifest URL** (`portal.iridi.cc/module/module.json`; Caddy `/module/*` route;
> Foundry fetches server-side, no CORS).
>
> **▶ NEXT — implement via `octo:embrace` against the spec, slice by slice:**
> - **S1 (skeleton, Foundry-free):** create the 3 members + apply the two proven config edits; confirm
>   `pnpm -r ls` + `uv sync` green; add the `portal {}` config block + mirrored Pydantic/Zod schema +
>   two SOPS keys. **S2 (bridge + MCP skeleton, Foundry-free):** telemetry-first, WS server w/ two-hop
>   auth, Streamable-HTTP `/mcp`, `bridge-status` tool. **S1–S2 need no live Foundry — start here.**
> - **S3–S6 need the GM to launch "Faerrin" on `btl.iridi.cc` + install the module** (manual step;
>   coordinate with the stakeholder). S3 = module + end-to-end bridge proof; S4 = read tools; S5 =
>   write tools; S6 = deploy + install-by-manifest-URL + live loop + memory.
> - **Watch the linguist-commit timer** — it touched the tree mid-session this session (`M
>   dagster/Dockerfile` + today's linguist files → the `da8152f`/`5cff55f` background commits). Keep a
>   clean index during portal commits; `systemctl --user stop linguist-commit.timer` if doing manual git.

---

### Previous session (archive) — 0022 vite+ cutover (COMPLETE, all 15 slices built + deployed + live)

> **✅ VITE+ CUTOVER (0022) — ALL 15 SLICES BUILT, R1–R6 COMPLETE.** S9–S14 landed in the session
> between the S1–S8 checkpoint and this one (vellum-render on Node 24, bun type-surface fully out,
> pnpm cutover, oxlint+oxfmt landed + gate-swapped biome out, orator-controller on tsdown). **S15 (vp
> adoption, D7) this session:** `vite-plus@0.2.2` exact-pinned as a root devDependency (the REAL npm
> package from `voidzero-dev/vite-plus` — `vp` on npm alone is an unrelated namesquat); `pnpm install
> --frozen-lockfile` is the entire CI install story, no new action/curl step. `vp run -r <task>`
> orchestrates `ts-typecheck`/`ts-test`/`ts-build` in CI; `ts-lint` stays direct oxlint/oxfmt;
> `tsc --noEmit` is unchanged as the actual typecheck gate (D8). `vp migrate` was run, reviewed, and
> **fully reverted** — it aliased `vite`→`@voidzero-dev/vite-plus-core` via a pnpm catalog (undermining
> the D9 exact-pin) and its own format step crashed on this repo's workspace-TS config-import pattern.
> Found-only-by-running gotcha: a root `package.json` script sharing a task's name self-collides with
> `vp run -r <task>` (raced itself into an `ENOTEMPTY` crash) — fixed by removing the root
> `typecheck`/`test`/`build` scripts entirely. Full detail in [[viteplus-cutover-0022]]; spec status →
> COMPLETE, all acceptance criteria A–N met.
>
> **✅ DEPLOYS UNPARKED + LIVE-VERIFIED (this session — stakeholder granted `just up`).** Full-stack
> rebuild + live batch ran at S9 and again at the S11 exit gate: 17 containers healthy, the 8-page
> real-WebGL visual spot-check (pixi shaders painting, zero console errors), Range/206
> head/mid/suffix + 416 + HEAD through the public edge on both audio hosts (criterion D live half),
> vellum-render `/render` real PNG via the edge, weal-overlay `/feed` SSE, weal-bot Discord reconnect
> + 10 macros read via postgres.js, SigNoz traces+logs+metrics 0-error (criterion M). The final
> `just up` after S15 ran too — live images == HEAD, all services healthy, edges 200. The S15 GHA
> run (28628654215) is GREEN with ts-typecheck/test/build executing under `vp run -r` (criterion L).
> **0022 is CLOSED — all acceptance criteria A–N met.** Still human-only (non-blocking): an
> interactive Discord roll round-trip, orator voice-join, in-player seek. The next main-track item
> is the (long-standing, stakeholder-paused) heartwood Phase-4 content acceptance — below.
>
> _(Prior checkpoint, superseded but kept for the session-by-session trail:)_

> **🆕 VITE+ CUTOVER (0022) — S1–S8 BUILT + CI-GREEN + PUSHED; ▶ RESUME AT S9 (vellum-render).**
> Spec: **`thoughts/astra/specs/0022-viteplus-cutover-spec.md`** (its status header carries the
> commit-per-slice map `09bfc42`…`70c6ee1`). Landed this session (staff-orchestrator + sonnet
> implementation agents, one reviewed commit per slice):
> - **R1/S1** — vite exact-pin `8.1.3` ×12 members + plugin-react ^5.2 (NOT 6.x — extra rolldown/babel
>   peers) + tailwind ^4.3.2 + vitest ^4.1.9 + jsdom ^29 + the 7-tsconfig baseUrl fix. ⚠ **Storybook 8.6
>   transitively PINNED vite@6.4.3** (duplicate-vite = the #7614 trigger) → D14's "verify" escalated to
>   a **required** ^10.4.6 bump (zero config changes). VR fixtures 0.000% drift; strider README updated.
> - **R2/S2–S3** — zero `bun:test` repo-wide (all 50 files → vitest). 3 production root-locators moved
>   `import.meta.dir`→`.dirname` (vitest's module runner has no `.dir`; bun supports `.dirname`). The 3
>   parked test files were ALL resolved later (migrate ×2 deleted at S5/S8; weal-overlay server.test.ts
>   unparked green at S8 incl. the SSE round-trip).
> - **R3 S4–S8** — site-kit `createSsrServer` on **srvx + `send`** (new `sendFile.ts` bridge, three
>   documented traps; 16-assertion integration test) + **`nodeTsResolve.mjs`** `--import` hook
>   (extensionless AND directory imports — load-bearing for EVERY node-runs-TS entry); ledger pilot;
>   weal-bot + orator-backend on **postgres.js** (D11 `= any($1)` restored + a new shape test; both dead
>   migrate.ts deleted); **THE S6 Range/206 gate PASSED locally against the real corpus** (sha256-exact
>   head/mid/suffix slices on 250 MB + 45 MB mp3s, 416/HEAD/200 all correct); all 7 SSR frontends +
>   weal-overlay + orator-backend on Node 24 (D12 mixed-stage Dockerfiles: bun build / node:24-slim
>   runtime; D13 `node -e` healthchecks — top-level await works); ytdlp/probe on node:child_process;
>   napi voice prebuilds load clean; 9 TS parameter-property files fixed (found by RUNNING — grep missed
>   one). Root `overrides` pins `@types/node ^24` (bun-types transitively pulled a broken 26 pre-release).
> - **Also fixed:** py-test was red on main BEFORE this work — the 0021 tuning (`01216e1`) left a stale
>   `CONTINUITY_BUDGET == 6_000` test pin; fixed to 26_000 in its own commit after the S1–S3 push
>   surfaced it (the TS lane was fully green).
>
> **⚠ DEPLOYS PARKED (the whole session):** the permission classifier denies `just up` (production
> stack). All code is safely in git; **the live stack still runs bun-era images** (nothing live changed).
> Needs ONE deploy window: `just up` (full rebuild), then the batched live verifications — per-frontend
> visual spot-check (pixi/shader pages in a real WebGL browser), **Range/206 + player seek through the
> public edge** (mouthpiece + akasha — criterion D's live half), weal-bot Discord roll round-trip +
> history read, orator voice-join + 87-track read, vellum-render `/render` PNG via the edge, and a
> SigNoz three-signals spot-check (criterion M).
>
> **▶ RESUME AT: S9 (vellum-render on Node; its CI-VR container/steps swap stays parked until S11), then
> S10 (bun-runtime cleanup: `types:["bun"]` out, `@types/bun` out — re-evaluate the @types/node override
> there — `.node-version`, grep-zero), then R4/S11 (pnpm, one slice), R5/S12–S13 (oxlint+oxfmt; the
> reformat + gate-swap is ONE slice, never split), R6/S14–S15 (tsdown + vp; vp-in-CI is HARD, D7).**
> The linguist-commit timer was STOPPED during the session and restarted at this checkpoint.
> Full gotchas: [[viteplus-cutover-0022]].
>
> _(Prior main-track item unchanged: heartwood Phase-4 content acceptance is ON HOLD by stakeholder
> decision — below.)_

> **PIPELINE REORDER (0021) — BOTH CHANGES DONE + DEPLOYED + LIVE-VERIFIED.** The pipeline is now
> reordered to: craig zip lands → **transcribe ∥ merge audio (parallel)** → chronicle → mouthpiece
> (with chronicle output as recap context + an ordering gate). Two independent changes, both live.
>
> **✅ Change B — DONE (S1 `f66f48e` / S2 `0d52198` / S3 `454d55a` + `just up` deploy).** Mouthpiece now
> opens each recap with "previously, on this show" continuity (3 most-recent same-show prior episodes +
> best-effort season arc) injected at the **script stage** (new `continuity.py`, mirrors `threads_block`,
> byte-identical prompt when empty, own `CONTINUITY_BUDGET`), built from new linguist selectors
> (`load_episode_summary`/`recent_prior_entries`/`season_for`) via the **package-path convention** (no new
> config). The `linguist_output_sensor` now **gates** a session's paid run on chronicle readiness
> (`episodes/<date>.json` exists OR carve-out `show_for_date None`), with the load-bearing invariant:
> **partition-registration moves to `ready` sessions only** (a gate-closed session stays un-partitioned so
> it's re-discoverable; first-eval adoption still adopts the whole backlog → no paid replay). **Live-
> verified:** deployed clean (cross-app `astra_linguist.chronicle` import loads), re-rendered 2026-6-29's
> `session_script` (GLM, ~19 min) → SigNoz `mouthpiece.continuity_episodes = 3` (filter on the attr —
> raw trace search omits custom attrs), then prove-and-reverted the script (forward-only). Gate logic is
> unit-proven (no naturally-deferred session exists — all backlog is chronicled). Spec status → BUILT.
> **Timer gotcha refined:** the linguist-commit `--user` timer's `git commit` only sweeps STAGED files
> (Change A's race was a just-`git add`ed index); keep a clean index across the timer window. Full
> gotchas in [[pipeline-reorder-0021]].
>
> **🔧 Change B continuity TUNED wider — DONE + DEPLOYED + LIVE (commit `01216e1`, 2026-06-30).**
> Recap "previously on" window widened **3 → 6** prior same-show episodes, and **every** episode now
> carries FULL detail (synopsis + all beats + cliffhanger) — previously only the most-recent episode had
> beats/cliffhanger, capped at 3 beats. `CONTINUITY_BUDGET` 6k→26k (6 full episodes measure ~23k chars /
> ~5.7k tokens — trivial vs GLM-5.2's **1,048,576-token** window; output stays the binding limit at
> `default-max-tokens 16000`). `recent_prior_entries(..., limit=6)` at the `session_script` call site.
> **2026-6-29 re-rendered + REPLACED live** (not prove-and-revert this time): new script *"The Canary in
> the Piston Room"* (164 turns, GLM ~5.4 min) → real ElevenLabs v3 audio (`dialogue` mode, 36.3 min /
> 34.8 MB) via the in-container re-render recipe (`dagster asset materialize --select
> session_audio_clips,session_episode --partition 2026-6-29`) → `just mouthpiece-publish` + `-seed` +
> frontend redeploy; verified live (new title in SSR HTML, /audio 206 = new size). Deeper threads
> (Obratz's death, tithe-as-system, ink-ribbon quest, Harlequin's origin) surface as **selective
> callbacks, not recitation**. `dagster-code` rebuilt so future episodes use the 6-window (forward-only).
> Full gotchas in [[pipeline-reorder-0021]].
>
> **✅ Change A — DONE (commit `6dc4a63`, all 4 slices, live).** The stakeholder wants the
> pipeline reordered to: craig zip lands → **transcribe ∥ merge audio (parallel)** → chronicle →
> mouthpiece (with chronicle output as context) → two independent changes.
>
> **✅ Change A — DONE (commit `6dc4a63`, all 4 slices, live).** Split scribe's sequential
> `session_outputs` → four assets: `session_tracks` (verify+extract+roster-filter → persist tracks to
> `cfg.tmp_path/<date>/tracks/`) → `session_audio` ∥ `session_transcript` (both `deps=session_tracks`)
> → `session_cleanup` (fan-in `deps=[audio,transcript]`, rm-rf after both succeed). New pure
> `extract_session_tracks` (atomic `.partial`→`os.replace`); `process_session` removed; spans
> `scribe.{extract,merge,transcribe,cleanup}`; counter +1 on transcript only. Output paths
> `saved/<date>/{audio.mp3,script.json}` FROZEN (linguist + akasha-seed untouched); **no schema/config
> change** (`tmp_path` was configured-but-unused). 19 scribe tests green; py CI reproduced locally.
> **Deployed via `just up`; live-verified** by a synthetic Craig fixture run (the `2026-6-27` incoming
> zip is degenerate — no `.aac`): SigNoz shows the four spans and `scribe.merge` ∥ `scribe.transcribe`
> overlap (transcribe started before merge ended), outputs at frozen paths host-owned, `tmp/<date>`
> cleaned, linguist's `scribe_output_sensor` fired on `script.json`, counter once. Fixture + downstream
> debris torn down. Spec status → BUILT. **⚠️ The commit is MISLABELED** as
> `chore(linguist): auto-commit…` — the linguist-commit `--user` timer raced my `git commit`, swept my
> staged files into its own commit, and **pushed it** before I could amend; per never-force-push I
> accepted it (tree identical). Code is correct + live. (Pause the timer next time:
> `systemctl --user stop linguist-commit.timer`.) Full gotchas in [[pipeline-reorder-0021]].
>
> **▶ NEXT: 0021 is COMPLETE** — both changes built, deployed, and live-verified; no remaining pipeline-
> reorder work. The other open main-track item is unchanged: **heartwood Phase-4 content acceptance**
> (the human-gated D1 gate — below). Scope/spec/memory for 0021:
> `thoughts/shared/research/2026-06-30-pipeline-reorder-0021-thoughts.md`,
> `thoughts/astra/specs/0021-pipeline-{scribe-parallel,chronicle-context}-spec.md` (both BUILT),
> [[pipeline-reorder-0021]].
>
> _(Below: prior sessions — the heartwood Phase-4 content acceptance gate remains the other open
> main-track item; nothing changed there this session.)_

> **✅ DEPLOY: volumes externalized to a gitignored `artifacts/` + containers run as 1000:1000 — DONE +
> DEPLOYED + verified live + pushed (`6cd6c45`, 2026-06-30).** One commit (5 files: `.gitignore`,
> `deploy/docker-compose.yml`, `dagster/Dockerfile`, `apps/vellum-render/Dockerfile`, `justfile`). The 6
> astra named volumes (3 audio + 3 Postgres) are now **bind mounts under `/artifacts/`** (gitignored), and
> all 13 astra app/Dagster containers run as **`user: "1000:1000"`** so pipeline writes land host-owned
> (the heartwood `user:1000` precedent, applied stack-wide). **SigNoz kept its own named volumes** (vendored,
> disposable telemetry — by decision). Container paths unchanged → **no config.kdl edit**. Migration ran
> live (copy volume→bind via root throwaway containers; chowned 334 pre-existing root-owned files to 1000),
> verified: all containers healthy as 1000 (incl. vellum-render Chromium), Postgres data intact on the bind
> mounts, container writes now land `1000:1000`, audio serves 206, edge 200, SigNoz 7 services 0-error.
> **Bonus fix folded in:** `linguist/timeline` is now in the Dagster mount anchor (was package-relative but
> unmounted → container-written chronicle output never reached the host). **The 6 old named volumes are
> RETAINED as backup (~25G)** — reclaim when comfortable: `docker volume rm astra-{akasha,mouthpiece,orator}-audio
> astra-{dagster,weal,orator}-pg`. Full gotchas in **[[deploy-artifacts-run-as-user]]**.
>
> _(Diagnostic this session, no code change:)_ **Chronicle didn't run for 2026-6-29** — root cause = the
> deployed `dagster-code` image was **stale** (predated chronicle `390298e` which added `session_episode_summary`
> to `scribe_output_sensor`'s target), so the live sensor run materialized only `session_transcripts` +
> `correction_candidates`. It won't self-heal (sensor is one-shot per partition; the hourly schedule only runs
> the aggregate). Today's rebuilds fixed the image; **2026-6-29 is the lone orphaned session** — backfill by
> materializing `session_episode_summary` for it (now lands host-owned via the new timeline mount). Noted in
> [[chronicle-0019-gotchas]].
>
> **✅ TELEMETRY COVERAGE PASS DONE + DEPLOYED + verified live (2026-06-30).** A repo-wide
> "add spans/logs/metrics across all services" once-over: a 3-agent audit (cross-checked vs live SigNoz)
> → 5 phases + a fix, each a CI-green commit (`a7a6a25` P1 correctness/identity · `1673a45` P2 TS services
> · `24b2111` P3 Python depth · `cda5814` P4 heartwood-frontend · `262f5e0` P5 orator-controller→public
> OTLP · **`88e6057` the metrics fix**), then **`just up`** (whole stack) + a SigNoz spot-check confirming
> **all three signals flowing live**. **⭐ The spot-check caught a latent bug: TS metric instruments created
> at module scope before `initTelemetry` are PERMANENT no-ops** (JS metrics has no deferred proxy provider;
> traces+logs do) → fixed with **`lazyCounter`/`lazyHistogram` in `@astra/observe`**; this had silently
> zeroed every TS metric for the repo's life. Verified live: `astra.orator.api.requests{unauthenticated}=5`
> exact match. Full detail + the load-bearing gotchas in **[[telemetry-coverage-pass]]** (+ the warning is
> now in [[telemetry-built-in]]). No open follow-ups that block; nice-to-haves noted in the memory (broaden
> Class-A alerting to frontends; scribe Groq ASR cost still invisible). **▶ Main-track next step is unchanged:
> heartwood Phase-4 content acceptance** (below).
>
> _(Prior side-quest, still true:)_ **✅ Stack-wide Discord alerting BUILT + LIVE + verified (`95735d4`/`f6e452e`).** The
> craig-sync FUSE wedge (2026-06-29) silently stalled the pipeline ~6h with zero alerts; the wedge fix +
> watchdog shipped earlier (`cd60af6`/`30929b5`). Now alerting is complete (`95735d4`): three failure
> classes — **Class A** SigNoz `discord-ops` channel + `astra error/fatal logs` rule (in SigNoz's DB, not
> git); **Class C** `deploy/systemd/alert-notify.sh` + `astra-alert@.service` `OnFailure=` on craig-sync +
> linguist-commit (curls Discord direct, survives SigNoz down); **Class B** `astra-watchdog.{service,timer}`
> (15m, mount probe + timers-armed, debounced). Install = **`just alert-install`** (already run live).
> All three live-tested end-to-end. **Two open follow-ups:** (1) the **webhook transited chat again** →
> Josh may want to **rotate** it (delete+recreate in Discord, `sops set alert_discord_webhook_url`, re-make
> the SigNoz channel); (2) broaden Class A later (only `astra.{pipeline,orator-backend,weal-bot}` emit logs
> today — add an exceptions/trace-error-rate alert for the frontends). Full detail + gotchas in
> [[astra-alerting-setup]]. **▶ Main-track next step is unchanged: heartwood Phase-4 content acceptance** (below).

---

### heartwood / migration state (unchanged this session, as of `db42c1a`, 2026-06-28)

> **The faerrin→astra migration is COMPLETE (see the 🎉 section below).** **`heartwood` (0020) — Phases 1–3
> DONE; Phase 4 (review surface + write-back) BUILT + the SURFACE LIVE.** Phase 4 = 6 CI-green slices
> (`7484900` S1 … `142af2e`/`db42c1a` S5): a public PR-style review app `apps/heartwood-frontend` at
> **`heartwood.iridi.cc`** (port 10371) + the host-side write-back `apply.py`/`review.py` + `just
> heartwood-apply`. **LIVE-VERIFIED** (`https://heartwood.iridi.cc/review/2025-8-28` → 200, 50 cards, SigNoz
> `astra.heartwood` 0-error SSR spans). All build work committed + pushed. **▶ NEXT — the ONLY remaining
> step: the human-gated CONTENT ACCEPTANCE** (Josh approves ≥1 create + ≥1 rewrite in the live surface →
> `just heartwood-apply 2025-8-28` → verify live on akasha). That is the **D1 gate by design — a human
> approves before anything touches the curated wiki — not an autonomous step.** Scope+spec at
> `thoughts/{shared/research/2026-06-28-heartwood-0020-phase4-review-writeback-thoughts.md, astra/specs/0020-heartwood-phase4-review-writeback-spec.md}`;
> gotchas `[[heartwood-0020-gotchas]]`.

### heartwood (0020): LLM-maintained akasha setting wiki — Phase 3 DONE (prose proposer); Phase 4 (review+write-back) next (2026-06-28)

A net-new **multi-phase** subsystem: GLM-5.2 reads play-session transcripts and maintains the akasha
**setting wiki** (the "nouns"), proposing changes for **human-gated PR-style review** at a bespoke
**`heartwood.iridi.cc`** (vellum-editor base). Umbrella `…/2026-06-27-heartwood-0020-thoughts.md` (D1–D10,
5 phases, §7 open-Qs resolved). **Phases:** (1) ontology infra ✅; (2) **extraction engine** ✅ DONE;
(3) **prose proposer (make-or-break house-voice) ← NEXT**; (4) review surface + write-back; (5) backfill/automation.

**Phase 1 — DONE** (`139db9f`…`e0458f9`): `world` field on `Campaign` + `faerrin_campaign_slugs()`; new
**`astra-lexicon`** lib (`defs.yaml→defs.kdl`, linguist refactored no-behavior-change); **`ontology-entity`**
typed registry (311 seeded) + `resolve()` (`Y'shael→Ichel`). Spec `…-phase1-registry-spec.md` BUILT.

**Phase 2 — extraction engine: DONE + pushed; acceptance CLOSED (first TSD session `2025-8-28`).**
- Scope `…/2026-06-27-heartwood-0020-phase2-extraction-thoughts.md` (`dae7561`), spec
  `thoughts/astra/specs/0020-heartwood-phase2-extraction-spec.md` (`9d768d0`). Decisions **P2.1–P2.11**
  question-free; **P2.1 REVISED the umbrella: PCs ARE wiki-eligible** (no PC special-casing).
- New app **`apps/heartwood-backend`** (pkg `astra-heartwood-backend`, module `astra_heartwood`), read-only:
  world-filter → **filter** (drop OOC/combat/play-by-play) → **extract** noun-facts → **resolve()** →
  **refine** (Stage 2.5) → committed `facts/<date>.json`. Mirrors chronicle's asset shape.
  - **S1** (`a908184`) scaffold + world filter (verified **40 ingested / 3 world-drop / 1 EXCLUDED_DATES**).
  - **S2** (`ee8ea04`) Stage-1 filter pass (windowed keep/drop, keep-when-in-doubt, dropped-span audit).
  - **S3** (`c148c47`) Stage-2 `call_structured` noun-fact extractor (grounding contract, atomic claims).
  - **S4** (`9591ac9`) resolution + emit + `session_noun_facts` Dagster asset + code-location wiring.
  - **S2.5** (`a1225fb`) **fact-refinement pass + wiki-worthiness taxonomy** (added after the first live
    run + stakeholder feedback): drops non-wiki facts by typed category (event / ability / possession /
    mechanical (gold/levels/stats) / nonsensical) and **canonicalizes resolved names** (a mislabel like
    `Y'shael` never surfaces — kept facts OR audit; deterministic safety-net backstop). `RefinedOutFact`
    records the category. EXTRACT grounding tightened (no mechanics/abilities/inventory/gold/events; no
    inferred relationships). Plus `fix(llm)` (`98ef460`, malformed tool-JSON retry — a shared-lib gap that
    crashed run 2) and `feat(lexicon)` (`8f25f60`, `Bertha Ford → Berth Four`).
- **Acceptance run + 3 infra fixes (2026-06-28, this session, `608fc63`…`e0508ad`):** acceptance was
  **relocated from the held-out 2026-6-8 to the FIRST `through-a-song-darkly` session `2025-8-28`** — process
  the campaign in chronological order so later sessions can key off the world built up earlier (stakeholder
  call). The re-run surfaced **three infra bugs**, each fixed CI-green + pushed before it completed:
  (1) **`fix(llm)` `608fc63`** — GLM occasionally returns `finish_reason=stop` with NO tool call on a forced
  tool; extended the bounded client retry (which only covered malformed JSON) to also retry this (shared lib).
  (2) **`fix(heartwood)` `a0e13ee`** — GLM-5.2 **reasoning tokens share the `max_tokens` budget**, so 8k
  truncated the exhaustive fact list even per chunk → raised `EXTRACT`/`REFINE_MAX_TOKENS` 8k→16k +
  `EXTRACT_CHUNK_WORDS` 16k→4k. (3) the artifact: **`feat(heartwood)` `e0508ad`** committed
  `apps/heartwood-backend/facts/2025-8-28.json` — **149 facts / 38 refined-out / 95 dropped**; resolution
  page-aware (**47 existing-page updates / 72 known-no-page / 25 new / 5 ambiguous**); taxonomy clean (event
  21 / nonsensical 9 / ability 4 / possession 4); no raw mislabels leaked. **Stakeholder judged §11 = good
  pass → Phase-2 acceptance CLOSED.** The stale untracked `facts/2026-6-8.json` was discarded.
- **NB — full backfill is Phase 5**, gated behind Phases 3–4 (cross-session accumulation needs Phase-4
  write-back + re-seed; backfilling extraction-only now would just be reprocessed later). The page-awareness
  the stakeholder asked about: the **registry is seeded from the akasha wiki snapshot** (`ontology-entity/
  seed.py`) so resolution already sees existing pages (resolved+page=update / resolved+no-page=new-page /
  unknown=net-new) — but heartwood's OWN per-session facts are NOT fed forward until Phase-4 write-back.
- **Known residual (Phase-4 review territory, not a Phase-2 blocker):** the `Voidheart→voidward` confident
  false-link (resolve-threshold tuning, trades against catching real garbles at ~0.86) + residual factual
  hallucinations + ~28% of facts with no `kind_hint`.

**Phase 3 — prose proposer: DONE + pushed (all 5 slices + a stakeholder-directed rewrite hardening; 2026-06-28).**
- Scope `…/2026-06-28-heartwood-0020-phase3-proposer-thoughts.md` (`cb86823`), spec
  `thoughts/astra/specs/0020-heartwood-phase3-proposer-spec.md` (`7ec629b`). **The faerrin prior art FAILED
  TWICE** ("voice may be partially unlearnable by LLMs"); Phase 3 ports its anti-slop assets (`DRAFT_SYSTEM`
  spine, GOOD/BAD calibration, the machine tell-lint, page-type suppression). Read-only — no corpus writes /
  no review surface / no deploy (those are Phase 4).
- **New sub-package `apps/heartwood-backend/src/astra_heartwood/proposer/`** (committed `proposals/<date>/`):
  group facts → target pages → `call_text` draft → tell-lint → bounded revise → assemble `.vellum` → emit
  `{manifest.kdl, <id>.vellum}`. Slices: **S1** (`f9e3ce0`) models/grouping/placement/KDL manifest; **S2**
  (`7f8dd89`) tell-lint (ported faerrin `voice-warnings.ts`); **S3** (`49c20e1`) draft stage + `voice.py`;
  **S4** (`c51cffe`) revise + assemble + emit + the `session_page_proposals` Dagster asset; **S5** (`e3a57f8`)
  telemetry + dagster wiring + **the Dockerfile fix** (a latent Phase-2 gap: `dagster/Dockerfile` never
  COPY'd `apps/heartwood-backend`, so `uv sync --frozen` would break — Phase 2 only ran host-side).
- **Live acceptance on `2025-8-28` + stakeholder §11 read + rewrite hardening:** first run (`0dfb6e0`) =
  51 pages, near-zero residual prose tells on CREATES (genuine house voice) but the **merged REWRITES
  flattened** — 3 of 12 converted 2nd-person→3rd, 9 of 12 shrank the human's prose (the full-body-replace
  P3.9). Stakeholder §11 = **"pass creates, harden rewrites"** (the spec §12 fallback). Fixed by revising
  P3.9 to **PRESERVE-AND-APPEND** (`9c1bbd8`): keep the existing frontmatter + body verbatim, append a short
  passage in the page's named POV; a deterministic `pov_shift` warning + the bounded revise re-draft in the
  right POV. Re-run verified (`8624ff7`): all 3 formerly-flattened 2nd-person pages preserve POV, every
  rewrite is additive (ratio >1.0), residual = 4 broken-wikilink warnings only. A full run costs **~$0.10**
  (GLM-5.2, ~58–65 short `call_text` calls; measured live).
- **▶ NEXT: Phase 4 — scope it.** The `heartwood.iridi.cc` human-review surface (vellum-editor base) +
  approve/edit/reject + **write-back** (corpus writes, akasha snapshot regen, commit, redeploy) + applying
  the proposed registry additions. Phase 4 also owns: a render-for-review tool (P3.12), a `heartwood` config
  namespace, and the residual review-territory items (resolve-threshold false-links, hallucination spot-check).
  **Phase 5** = cross-session accumulation + backfill over all ~40 sessions (~$4) + sensor/schedule automation.
- **Gotchas memory:** `[[heartwood-0020-gotchas]]`.

### chronicle (0019): automatic Show → Season → Episode campaign timeline in akasha (2026-06-27 session — DONE + LIVE)

A net-new akasha section at **`akasha.iridi.cc/chronicle`** — GLM-5.2 structures the actual-play
transcripts into Show → Season → Episode. Scope→spec→implement gates:
`thoughts/shared/research/2026-06-27-akasha-chronicle-0019-thoughts.md` +
`thoughts/astra/specs/0019-chronicle-spec.md`. Memory: [[chronicle-0019-gotchas]]. **All 7 slices +
review follow-ups built, CI-green, pushed, deployed, live-verified (Playwright).**
- **Pipeline (linguist):** `session_episode_summary` (per-session asset, GLM `call_structured` →
  Rich `EpisodeSummary`) + `campaign_timeline` (aggregate, hourly schedule, skip-when-unchanged
  `inputs_hash`) → committed `apps/linguist/timeline/{episodes/<date>.json,seasons.json}`. Season
  grouping outputs compact **boundaries** (not episode-lists) to avoid mid-JSON truncation on the
  33-ep show. **NOT the dspy judge** — plain GLM-5.2. Slices S1–S3 (`a509cba`/`390298e`/`1548120`).
- **Backfill** S4 (`85eeec0`): all **44** matched sessions summarized on the host (~$2–3, SigNoz);
  `apps/linguist/scripts/backfill_chronicle.py` (resumable).
- **Frontend** S5/S6 (`5f7c730`/`7b86c6e`): `build-content.ts` → `src/generated/chronicle.ts`;
  routes `/chronicle` (shows index) + `/chronicle/$show/{index,$episode}`; gothic `Chronicle.tsx`.
- **Deploy** S7 (`349c435`/`5e51d92`): linguist-commit timer + akasha Dockerfile both gained
  `apps/linguist/timeline`.
- **Review follow-ups (`f5ac5c9`…`b111f70`):** excluded the mislabeled session **2025-8-11** (a
  different campaign false-matched via 96× "Argyle" → `EXCLUDED_DATES`; data is now **43 episodes / 13
  seasons**, main show 32/5); **removed the force-graph** on chronicle pages (`PageLayout graph={false}`
  + `#quartz-body.no-right` 2-col); **condensed show cards** (synopsis blurb) → **nested episode detail
  page** with full beats/entities/cliffhanger/transcript link; **nested Chronicle in the Looking Glass
  Explorer** (injected subtree, `TreeNode.href`, season-nested episode slugs for auto-open/active);
  **dropped the now-redundant standalone Chronicle sidebar link**.
- **Gotcha that bit:** the **linguist-commit systemd timer fires every ~15 min** and auto-committed my
  regenerated `timeline/` data mid-session (+ auto-redeployed akasha with new data but OLD frontend) —
  after a frontend change you must commit the code + redeploy yourself; don't trust the timer's redeploy
  to have your latest code. The exclusion code reaches the live pipeline only on `docker compose build
  dagster-code` (fine — 2025-8-11 won't re-materialize).

### Animated backgrounds as an astra signature style — @astra/backdrop (2026-06-26 session — DONE + LIVE)

Made the animated abstract page background (harrow's starfield, strider's balatro) a **shared signature
style** and added one to **mouthpiece, ledger** (pixi shaders) + **akasha** (CSS). 6 commits
(`6858066`…`4232fc7`), all CI-green, deployed (targeted `docker compose build/up`), **live-verified by
Playwright/swiftshader screenshots + SigNoz 0-error SSR spans**. Memory [[backdrop-signature-style]].
- **New lib `@astra/backdrop`** (`6858066`): `ShaderBackground` (SSR-safe mounter — renders null until
  mounted so the canvas is absent from SSR HTML; dynamic-imports pixi; **ONE Application per page**) +
  `createShaderBackground` factory (the pixi-v8 full-screen-rect + Filter idiom, generalised) + a catalog
  (`starfield` harrow-verbatim, `mouthpieceResonance`, `ledgerAurora`) with gothic-palette RGB + noise GLSL
  in `shaders/common.ts` and a per-shader `uIntensity` knob. **harrow migrated onto it** (dogfood, dropped
  its local component + direct pixi dep). **strider left as-is** (balatro entangled with its faction-tint).
- **mouthpiece** (`9a07220`) + **ledger** (`01caa29`) mount `<ShaderBackground spec={…}>` in `__root`.
- **THE constraint: two live pixi Applications on one page CONFLICT** (confirmed from strider). akasha
  already runs a webgpu force-graph → it gets a **CSS-only animated nebula** (`c979545`) instead of a pixi
  shader (no 2nd WebGL context; graph untouched).
- **Tuning** (`4232fc7`): first pass rendered too faint (swiftshader under-renders + diffuse fbm) → bumped
  ledgerAurora intensity 0.8→1.5 + akasha nebula alphas. Easy to dial further (one uIntensity / the alphas).
- A **new TS lib needs NO Dockerfile ripple** (frontends `COPY libs/ts` wholesale, unlike a new app).

### ledger (0018): the astra landing page (2026-06-26 session — DONE + LIVE ON PUBLIC EDGE)

Built **ledger**, a net-new **landing page** at `ledger.iridi.cc` — one homepage with a gothic card grid
linking the five player-facing sites (strider/akasha/mouthpiece/harrow/vellum). A **backend-less SSR frontend
on the strider template** (port **10370**, `astra.ledger`), the **simplest frontend in the repo** (a sibling
of harrow, no content files, one route). 3 CI-green slices pushed + deployed + edge-reloaded + **live-verified
public** (HTTP/2 200 over TLS, all 5 cards, `astra.ledger` SSR spans in SigNoz, 0 errors). Spec
`thoughts/astra/specs/0018-ledger-spec.md`, memory [[ledger-0018-gotchas]]. User decisions: new subdomain (not
apex); player-facing links only; clean gothic grid (no pixi). Commits:
- **s1 config** (`e6aeaea`): `ledger` namespace (10370) in kdl + both schemas + tests; added a `public-origin`
  to strider's block so the link registry can read every site's URL from config.
- **s2 app** (`cab6ebe`): the app on the harrow shell — `build-content` joins a ledger-owned registry
  (title/blurb/order) to each linked site's config `public-origin` → generated `sites.ts` (**no hardcoded
  URLs**, config-single-source); the grid route + SiteCard; `sites.test.ts` parity gate + SSR smoke; uv exclude.
- **s3 deploy** (`ae8b27e`): Dockerfile + the **9-sibling manifest ripple**; Compose `ledger`@10370; Caddy
  `ledger.iridi.cc`; targeted `docker compose up -d --build ledger` (backend-less → safe); `caddy-validate` +
  `caddy-reload`. **THE edge surprise: the brand-new subdomain JUST WORKED — `*.iridi.cc` is a wildcard, so no
  manual DNS record was needed** (prior frontends needlessly deferred DNS); Caddy ACME-DNS minted a real
  Let's Encrypt cert. See [[ledger-0018-gotchas]].

### harrow: animated yellow/black starfield background (2026-06-26 session — DONE + LIVE)

Added a fixed, full-viewport animated **starfield** behind every harrow page (the user asked for "a shader
background like strider's, yellow and black like a starfield"). One commit `5f3865f`, both TS-lane gates
green locally, deployed via targeted `docker compose up -d --build harrow` + **live-verified on
`harrow.iridi.cc`** (home/gallery/spreads all 200, container healthy on :10369). Memory
`[[harrow-0017-gotchas]]` (starfield note appended).
- **Pattern = port strider's balatro page background**, NOT reinvent: reused the Pixi-v8 mounting idiom from
  `apps/strider/src/components/PixiHost/balatroBackground.ts` — a reusable `Filter` (GlProgram +
  `defaultFilterVert`) on a full-screen `Graphics` rect scaled to the renderer, driven by a `uTime` uniform
  from the app ticker, the high-DPR **`vTextureCoord` (not `gl_FragCoord`)** fix, uniform-driven palette,
  full cleanup-on-unmount. The *shader* is new (a drifting 3-layer parallax starfield: hashed star grid +
  twinkle + an fbm amber nebula haze on warm-black space), the *scaffold* is strider's.
- **Harrow is simpler than strider → self-contained component.** No `PixiContext`/`panel`/`world` (harrow has
  no on-canvas content like strider's hex map) — `StarfieldBackground.tsx` owns one `Application` + the shader
  mesh. New files under `apps/harrow/src/components/StarfieldBackground/` (`.tsx` + `starfieldBackground.ts` +
  `.module.css`). Canvas `position:fixed; inset:0; z-index:-1; pointer-events:none`.
- **SSR-safe:** pixi is **dynamically imported** inside the effect and the component mounts inside
  `<ClientOnly>` in `__root.tsx`, so nothing pixi/WebGL evaluates during SSR (the canvas is correctly ABSENT
  from SSR HTML — verified). Harrow's `body` is already transparent (only `html` paints `--color-void`), so
  the field shows through and content stays interactive + readable.
- **Deps/CI:** added `pixi.js@^8.18.1` (matching strider; no `pixi-filters` needed — core `Filter`/`GlProgram`
  only). `balatroBackground.ts` needs no biome override (the uniforms cast passes), so neither does the harrow
  port. Build code-splits the shader into its own chunk; pixi stays out of the SSR bundle. Verified visually in
  a real WebGL browser (Playwright/swiftshader) before deploy — temp playwright dep + scripts cleaned up,
  `bun.lock` net diff is just the `pixi.js` line.
- **Deploy note:** harrow is backend-less (no SOPS secrets), so a plain targeted `docker compose up -d --build
  harrow` is safe (the silent-MOCK/SOPS-env trap only bites secret-needing services). No edge change —
  `harrow.iridi.cc` already routes to :10369.

### harrow (0017) — ported the external tarot reader into astra (2026-06-26 session — DONE + LIVE ON PUBLIC EDGE)

Brought the standalone app at `/ruby/data/experiments/tarot` ("Harrow", a React 18 + Vite 5 SPA tarot deck
reader) into astra as a **backend-less SSR frontend on the strider template** — a sibling of strider. **All 6
slices built + pushed + deployed + LIVE on `harrow.iridi.cc`** (`1aa0c81`…`a2c9a5e` + edge cutover
`4b3ad33`); healthy on **10369**, `service.name=astra.harrow` SSR spans in SigNoz (0 errors). Scope `thoughts/shared/research/2026-06-26-harrow-0017-thoughts.md`,
spec `thoughts/astra/specs/0017-harrow-spec.md`, memory [[harrow-0017-gotchas]]. Decisions: full gothic
re-skin; `harrow`/`harrow.iridi.cc`; build-time generated content; client-side draw/flip; views→routes; no
backend/DB/volume; deck hues via gothic identityStyle; deck + 29-predicate-label parity gates.
- **s1 scaffold** (`1aa0c81`): `apps/harrow` from the mouthpiece/strider shell; `harrow` config namespace in
  kdl + Zod + Pydantic (port 10369); uv `exclude`; SSR smoke.
- **s2 content pipeline** (`fdf2851`): 24 `.card` + 1 `.spread` copied byte-identical → `content/`; ported
  `parseCard`/`parseSpread` into `build-content.ts` → generated `cards.ts`/`spreads.ts`; **deck parity gate**.
- **s3 domain logic** (`aabb34f`): draw/fortune/tags/predicates/decks lifted verbatim; **predicate-selection +
  fortune-template gates** (13 tests total).
- **s4 gallery + nav** (`dc72a66`): `/gallery` + masthead nav; CardRow/CardFront/Icon/CardName re-skinned to
  gothic; deck/flip/shimmer utilities into globals.css.
- **s5 interactive** (`1cdd02e`): `/` client-only draw→flip→reveal behind `<ClientOnly>`; `/spreads` +
  `/spreads/history`; FlipCard (native `<button>`), CardSpread, useCardReveal, predicate-named shimmer title.
- **s6 deploy** (`a2c9a5e`): Dockerfile (simplest — no snapshot/volume) + the 8-sibling manifest ripple;
  Compose `harrow`@10369; Caddy `harrow.iridi.cc`; `docker compose build/up` + live-verified + SigNoz spans.
- **Edge cutover** (`4b3ad33`): `harrow.iridi.cc` was a **host takeover** (the old deploy owned it → DNS
  already existed). Removed the old stanza (→`localhost:10204`) from the shared `/ruby/data/reverse-proxy/Caddyfile`
  (backed up), `just caddy-validate` + `caddy-reload`; **live-verified `https://harrow.iridi.cc`** serves the
  migrated app (all routes 200). Duplicate-site conflict avoided (parent imports astra's sites.caddyfile).
- **Leftover (open, not blocking):** the **old harrow container still runs unrouted on `localhost:10204`**
  (saffron `/emerald/data/experiments`, image `reg.iridi.cc/tarot`) — the deferred old-deploy teardown
  (stop/remove container + image + `upload.sh`). Awaiting user go-ahead.

### Longer debate episodes via chunked Pass B (2026-06-26 session — DONE + LIVE)

The GLM debate episodes were stuck ~15 min; making them longer first **hung for 46 min**. Root cause: **Pass B
(structured typeset) is the scaling bottleneck, not Pass A.** Pass A (free-text debate) is fast (~57s for 6.7k
words); Pass B trying to emit a 6k+ word transcript as ONE tool call hangs. Fixed + re-rendered 2026-6-22 as
**"Rust, Numerology, and the Sea Shanty Below"** (266 turns / ~5.6k words, **34.1 min** real ElevenLabs
`mode=dialogue`, was 15.6). Memory `[[mouthpiece-glm-debate-switch]]`. Two code commits + the render:
- **`867eee7`** `feat: chunk Pass B typesetting`: `script.py` typesets Pass A in word-bounded SEGMENTS
  (`_split_transcript` + `PASS_B_CHUNK_WORDS=2200`), concatenates turns (title from first segment); short
  transcripts stay a single call (unchanged). Plus `astra_llm.client REQUEST_TIMEOUT_S=300` per-attempt (a hang
  → fast fail; there was NO client timeout before) and a bounded length prompt + raised digest beats (~18-25 →
  produced 24). 85 mouthpiece tests (+3 chunking).
- **`4e0000f`** `feat: render the 34-min chunked debate`: snapshot durationMs/audioVersion + audio volume +
  frontend all updated; live-verified (SSR title + 266 transcript rows + audio Range 206 @ 32.78 MB). debate-v1
  preserved as `*.debate1.bak`.
- **Gotchas (in the memory):** a stuck in-container `dagster asset materialize` is **root-owned → unkillable
  from the host as uid 1000**; `docker compose restart dagster-code` clears the orphan (preserves env).
  `signal.alarm` can't interrupt a blocked C socket read (litellm `timeout=`/httpx can). The 46-min hang cost
  only **~$0.15** (hung in retry sleeps, not token-runaway). **THE auto-publish timer race:** the
  `linguist-commit` timer (15 min) runs `mouthpiece-publish` + commit + seed + redeploy on any snapshot change,
  and raced our manual re-render — it committed the new title+transcript with the STALE (pre-render) duration +
  redeployed with old audio (the `chore(mouthpiece): auto-publish` commits `2269276`/`66ab7de`). Finish the
  render, then re-publish/seed/redeploy to correct it (or disable the timer during a manual re-render).

### Re-rendered the most recent mouthpiece episode as a GLM debate (2026-06-26 session — DONE + LIVE)

End-to-end redo of the most recent session (**2026-6-22**) on the now-deployed GLM 5.2 debate pipeline →
**"The Jurisdiction of Vibes"** (59 sparring turns, two-host Bram/Maeve, **15.6 min**, real ElevenLabs v3
`mode=dialogue`). Snapshot committed+pushed (`fd48ea4`), audio reseeded, mouthpiece-frontend redeployed.
**Live-verified:** home + episode page SSR the new title, `/episodes.json[2026-6-22]`=new title, audio Range
206 (14.9 MB new render). Memory `[[mouthpiece-glm-debate-switch]]` + `[[mouthpiece-two-host-gotchas]]`.
- **HOW (load-bearing):** `episodes/` is **root-owned by the container** → the host can't write digest/script
  (PermissionError); re-render by **materializing in the dagster-code container**:
  `docker compose exec -T dagster-code sh -c 'cd /opt/dagster/app && dagster asset materialize --select <assets>
  --partition <date> -f definitions.py'`. Split for a spend gate: first `session_digest,session_script` (GLM,
  cents) → review the script → then `session_audio_clips,session_episode` (ElevenLabs, $). Back up the current
  artifacts to `*.2host.bak` IN the container first (also can't from host). The dagster-code image already has
  the GLM debate code (rebuilt via `just up` earlier this session) + `OPENROUTER_API_KEY`/ElevenLabs env.
- **Publish (host-side):** `just mouthpiece-publish` (snapshot regen) → commit+push the snapshot → `just
  mouthpiece-seed` (new mp3 overwrites in the volume) → `docker compose up -d --build mouthpiece-frontend`.
- **⚠️ Drift gotcha caught:** the committed snapshot title can **lead** the live script/audio — the snapshot
  already said "The Jurisdiction of Vibes" (from the earlier A/B publish) while the live script+audio were
  still the calm "Sandwich Yoink Bonus" (a `publish` happened without a matching render). A snapshot title
  is no proof the episode was actually rendered; check `durationMs`/`audioVersion` + the on-disk mp3.

### linguist dspy judge → GLM 5.2 (2026-06-26 session — COMPLETE + PUSHED + CI-GREEN + DEPLOYED LIVE)

Retuned the transcription-correction judge (gate J) off Anthropic haiku/sonnet onto **GLM 5.2**, matching
mouthpiece's switch — and **recompiled the artifact live** (the compiled `judge.compiled.json` is
model-specific). One commit `199e5ab`, both lanes green locally (84 py tests + 6 ts), CI in_progress at push.
Memory `[[linguist-gate-j-dspy-judge]]` (full facts) + `[[mouthpiece-glm-debate-switch]]`.
- **Models:** `surface-model-judge` + `surface-model-escalate` both `openrouter/z-ai/glm-5.2` (config.kdl +
  py/ts schemas). Since judge == escalate, the **borderline-escalation tier is now INERT** (machinery kept,
  dormant, zero runtime cost; `judge_session` only escalates when the two models differ). User chose KEEP-inert
  over removing the tier. A new `test_judge_session_no_escalation_when_models_match` locks it in.
- **Key bridge:** new `astra_llm.ensure_openrouter_env()` mirrors `ensure_anthropic_env` (resolves
  `llm.openrouter-api-key` → `OPENROUTER_API_KEY`); `optimize.py` + `judge.py`'s production path call it.
- **Retrain:** live MIPROv2-medium compile on GLM, **$7.32** spend. Held-out eval **beats the haiku baseline**
  (gold set has grown to 580 train / 144 val): confirm **P 0.915→0.936, R 0.607→0.779**, restraint 0.946→0.935,
  optimizer metric 69.4→**81.25**. Re-run any time: `uv run python -m astra_linguist.surface.optimize --live`.
- **✅ DEPLOYED LIVE via `just up`** (2026-06-26): the dagster-code image rebuilt with the GLM-judge code
  (un-cached `COPY apps/linguist` + `uv sync` rebuild of astra-linguist/llm/config), container recreated, code
  location loaded cleanly (no import errors). `OPENROUTER_API_KEY` was already on the `*dagster-env` anchor
  (mouthpiece switch), so no env change. The next `correction_candidates` materialization uses the GLM judge.
- **Follow-up sanity sweep + substrate-smoke fix (`0bbf3f0`):** audited every model string in the repo.
  **Final inventory — chat: GLM 5.2 (`openrouter/z-ai/glm-5.2`) everywhere** (mouthpiece digest/script/mega/
  session, linguist judge+escalate, substrate smoke, `astra_llm.DEFAULT_MODEL`); **ASR: `groq/whisper-large-v3`**
  (scribe); **TTS: `eleven_v3`** (mouthpiece ElevenLabs). **No claude-* / gpt / gemini call anywhere** — Anthropic
  is now vestigial (key ref + 3 `claude-*` pricing rows + `ensure_anthropic_env` retained **as a fallback, by
  request**). The sweep caught a real leftover: the substrate smoke called the GLM default model but still
  bridged the Anthropic key (`ensure_anthropic_env`) — fixed to `ensure_openrouter_env`; its offline test's
  env-override moved `ANTHROPIC_API_KEY`→`OPENROUTER_API_KEY` (verified faithfully with a failing-`sops` shim on
  PATH, per `[[mouthpiece-glm-debate-switch]]`). Manual gate, no redeploy needed.

### mouthpiece → GLM 5.2 + debate format (2026-06-26 session — COMPLETE + PUSHED + CI-GREEN + DEPLOYED LIVE)

Switched the recap podcast off Anthropic onto **GLM 5.2** (open-weight MoE, via OpenRouter) AND changed the
format from the calmer two-host recap to a **two-co-host DEBATE**. Driver: Anthropic stopped offering Fable
(US-gov restriction) + GLM 5.2 is cheaper than Haiku while benchmarking near Opus, and stakeholders wanted a
debate format anyway. Validated by a local A/B (regenerated the 2026-6-22 episode three ways) — the
debate-direction GLM output is what stakeholders approved. Five commits, both CI lanes green
(`3d8b768` is green on GHA), deployed via `just up`. Memory `[[mouthpiece-glm-debate-switch]]`.
- **`87d10dc`** config: `llm.default-model` → `openrouter/z-ai/glm-5.2` + `openrouter_api_key` secret ref
  (mirrored in both schemas + `astra_llm.DEFAULT_MODEL`; config-lib tests). (linguist judges stayed Anthropic
  at the time — **later moved to GLM 5.2 too**, see the 2026-06-26 linguist section below.)
- **`f0a4599`** the debate prompt: rewrote Pass A (`build_improv_system_prompt`) from relaxed-tavern/deadpan-foil
  to a two-position DEBATE (pushback is the rhythm, concede-then-counter); relaxed Pass B's overlap-tag rule.
  One-shot `build_script_system_prompt` left as-is (asset always runs `two_pass=True`). **Forward-only** —
  published episodes keep their scripts (per-episode hosts, `[[mouthpiece-two-host-gotchas]]`).
- **`866aacd`** deploy: `openrouter_api_key` encrypted into `deploy/sops/secrets.enc.yaml` + `OPENROUTER_API_KEY`
  added to the `*dagster-env` compose anchor (litellm reads it from env; `[[deploy-sops-injection]]`).
- **`a92794f`** GLM pricing row in `astra_llm.pricing` (so SigNoz cost isn't 0) + smoke fixup.
- **`3d8b768`** CI fix: the substrate smoke shells to `sops` when the key env-override is wrong, and **CI has
  no `sops`** → it red after the first push even though local pytest passed (I HAVE sops, which masked it).
  **THE gotcha: to reproduce the substrate-smoke CI faithfully, mask `sops` off PATH** (`[[mouthpiece-glm-debate-switch]]`).
- **Deferred (optional):** a real in-cluster end-to-end proof (materialize `session_digest`+`session_script`
  for a test partition) — the local A/B proved the model, this would prove the deployed wiring. Not done (real
  API spend + writes an episode dir).
- **NB the 3 akasha commits `7c5fa7b`/`625acd9`/`2367812`** (heart.iridi.cc → akasha-frontend; removed 20 root
  entity pages + retired cutover-parity gates; de-linked dead crossrefs) landed in a prior session that didn't
  `/save`; recorded here for completeness.

### strider map: balatro hex tint + timeline UX overhaul (2026-06-24 session — COMPLETE + PUSHED + LIVE)

Three strider product changes, each CI-green + `docker compose up -d --build strider` + live-verified on
`strider.iridi.cc`. Memory `[[strider-balatro-timeline-gotchas]]`.

- **Per-faction balatro field** (`82aa7e2`): the hex map shimmers with a faction-tinted balatro swirl —
  **one** filter over `factionHexLayer`, not per-hex. New shader **`tintFromTexture`** mode derives its 3
  palette stops per-pixel from each hex's own colour (saturation ~1.35×, low-contrast `base*0.72`…`base*1.03`,
  `uLightScale` 0.08). **THE gotcha:** a filter round-trips the layer through an offscreen texture, so the
  thin **horizontal** hex-grid strokes (flat-top hexes → horizontal top/bottom edges) drop out at certain
  zooms — fix = `filter.resolution = app.renderer.resolution` + `antialias="on"`. Grid stays readable via
  the deep-shadow stop + the unfiltered `factionBorderLayer` on top. Page background + tithe unchanged.
- **Current-first timeline + bounded play-once** (`de13a02`): the home map no longer replays the whole
  vox-log on every visit (was ~18s, grew unbounded). Now lands on the **current state**; a **play-once**
  catch-up of only the layers added since last visit (tracked in `localStorage` key `strider:vox-log-seen`,
  capped to last `MAX_PLAYBACK_LAYERS=10`, older snap in) auto-plays once; **constant dwell** (acceleration
  removed); **`⟲ REPLAY`** plays the full log on demand, **`SKIP ⏭`** jumps to now, arrows unlocked
  (stepping cancels playback).
- **Scrubber + precomputed fold snapshots** (`e052694`): dot indicator → a draggable **range slider**
  (+ `index/total`). New `domain/lib/timelineFrames.ts` `buildTimelineFrames()` derives every cursor's full
  state once (memoized on the layer set) → MapView does an **O(1) `frames[layerIndex]` lookup** instead of
  re-folding `layers.slice(0,index)` per step (was O(n²) over a replay). Flip animation reads the prev frame.

### mouthpiece → TWO hosts + a calmer script (2026-06-24 session — COMPLETE + PUSHED + LIVE)

Product change to the recap podcast (not migration): consolidated **3 hosts → 2** — **Pip rolled into
Maeve** (she keeps her Juniper voice, absorbs his needling), and the script prompts rewritten for two
voices with **far fewer interruptions**. Code `c2309df`, live snapshot `bad00bb`. Memory
`[[mouthpiece-two-host-gotchas]]`.
- **Back-compat = per-episode hosts.** `HostConfig.c`/`VoiceConfig.c` optional, `SpeakerId` keeps `"C"`;
  `episodes_index` carries each episode's OWN host block (`_read_hosts` + `SessionInput.hosts` +
  `build_index(s.hosts or hosts)`). Verified live: the 8 published episodes stay three-host (Pip intact),
  only 2026-6-22 is two-host. `being.kdl` dropped `pip` + rewrote `maeve` → regenerated
  `being.canonical.json`; faerrin prompt-fidelity tests **deleted** (deliberate divergence).
- **2026-6-22 re-rendered LIVE as two-host** "The Sandwich Yoink Bonus" (real ElevenLabs v3, 26 min):
  placed the approved script + materialized only `session_audio_clips`/`session_episode` (no Stage-3
  re-gen); published snapshot + `just up` (whole stack now on two-host code → future episodes are
  two-host); `linguist-commit.timer` re-enabled. **Two deploy traps recorded in the memory** (dagster
  runs image-baked code → rebuild needed; plain `docker compose up -d <svc>` drops SOPS env → silent
  MOCK-TTS). Backups of the old 3-host artifacts are in `episodes/2026-6-22/*.3host.bak`.

### Session audio into astra (2026-06-24 session — COMPLETE + PUSHED + LIVE)

akasha transcript audio is now served **same-origin by astra** at `akasha.iridi.cc/audio/<date>.mp3`,
replacing the surviving faerrin `static-audio.iridi.cc` — and **the whole faerrin caddyfile import was
removed** from the shared proxy (faerrin fully decommissioned at the edge). Memory
`[[akasha-session-audio-dependency]]`; scope `thoughts/shared/research/2026-06-24-akasha-session-audio-thoughts.md`.
Four CI-green slices (`9aea97d` serving seam → `976db90` build-time normalize (decision A) → `2fced17`
`just akasha-seed` + timer wiring → recipe-fix for the nested-dir gotcha):
- **D2 pattern:** `akashaFrontend.audio-dir` (3 schemas) + `createSsrServer` `staticMounts` + `akasha-audio:ro`
  volume; no edge change for serving (catch-all proxy passes `/audio/*`). **Decision A:** `transcript.ts`
  `loadTranscripts` normalizes `audio` → `/audio/<date>.mp3` (new `audioSrc`), so the 78 committed transcripts
  need no re-gen; linguist `STATIC_AUDIO_BASE`→`AUDIO_BASE="/audio"`.
- **`just akasha-seed`** (HIST faerrin incremental ∪ LIVE scribe overwrite; wired into the `linguist-commit`
  timer akasha phase). **85 sessions / ~14.4 GB** seeded (the "31 GB" was the whole back-catalog incl. `.aac`
  tracks). **Gotcha:** faerrin mislocated 4 recent sessions under nested `wretch/data/saved/saved/<date>/`
  (why faerrin's own static-audio 404'd 2026-6-8) → seed scans `audio.mp3` at any depth; astra serving
  2026-6-8 **fixes a faerrin-broken gap**.
- **Teardown:** verified all 5 faerrin blocks dead/replaced (eerie 10174 + lark 10175 not listening;
  heart/caster stale static) → removed `import …/faerrin/sites.caddyfile` from `/ruby/data/reverse-proxy/Caddyfile`
  (backed up; `caddy-validate` clean → `caddy-reload`). **Live-verified through the public edge:** akasha
  home/transcript 200, `/audio/{2025-9-11,2026-6-8}.mp3` 206 Range, `static-audio.iridi.cc` now dead. SigNoz
  still shows `astra.akasha-frontend` SSR spans. faerrin's 31 GB `wretch/data/saved` kept as backup.

### Gothic / frontend design polish (2026-06-24 session — COMPLETE + PUSHED + DEPLOYED LIVE)

A critical design pass over how **gothic** renders content + the 4 public frontends (live-captured with
Playwright, each fix screenshot-verified). Audit: `thoughts/shared/research/2026-06-24-gothic-frontend-design-audit-thoughts.md`;
memory `[[gothic-frontend-design-polish]]`. 15 findings, 6 CI-green slices (`0d39ea1` audit … `1c7e507`):
- **gothic** (`e3f7581`): style bare `pre`/`code`/`blockquote`; card fill `bg-panel`→`bg-elevated`;
  padded trait pills; emoji fallbacks. **VR goldens regenerated in the pinned container (0 drift).**
- **akasha** (`da5516a`,`c95ee90`): the **`@layer base` reset fix** (THE cross-cutting gotcha — unlayered
  reset was zeroing all gothic content padding), reading-measure cap + larger prose, centered 404,
  mobile content-first, tag-index/graph-empty/search polish, dropped noise dates.
- **strider** (`d3d8b98`): faction dossier headings (member names in faction color) + reset fix + dead CSS.
- **orator** (`d889053`): compact centered sign-in card.
- **vellum-frontend** (`a9131dd`): reset fix (editor preview) + the cross-cutting gotcha documented in
  `apps/strider/README.md`.
- **akasha content** (`1c7e507`): repaired the Tormeré Situation Room transcript (mis-fenced `:::fields`).
- **Redeployed + live-verified** (`just up`, 2026-06-24): akasha/strider/orator/vellum all healthy on
  their public hosts; Tormeré transcript, faction dossier, orator sign-in confirmed live.
- **`:::deity` construct added** (`14ed961` feat + `99573a6` content + `facf263` render): a divine
  stat-block vellum kind, from a survey of heavy `:::fields` usage. `deity` is a `DOCUMENT_KIND` so it
  gets both brace forms; gothic `DeityCard` renders it **run-in (label inline with value), NOT a
  two-column grid** (`facf263` — the grid mis-aligned between sections + gapped badly). 7 Divinity pages
  migrated + Hierophant Harrow Decks fixed (same fence bug as Tormeré); `deity-mechanical` VR
  fixture/golden. Memory `[[gothic-frontend-design-polish]]` has the "how to add a `:::kind`" recipe.
- **WHOLE corpus → VSS braces** (`d1c6b73` engine + `1751aee` content; deities `76b472c`): closed two VSS
  gaps so every construct has a brace form — **block title is optional** (`@handout { … }`) and
  **`@fields`/`@timeline`** lower to `:::fields`/`:::timeline`. Swept all 21 handouts + fields + timeline
  + 7 deities to `@…{ }`; **zero `:::` openers remain** in the content tree. compileVss lowers to identical
  canonical, so renders are byte-identical (VR fixtures stay canonical → goldens untouched). `.gitattributes`
  maps `*.vellum`→Markdown for GitHub (`76b472c`). All redeployed + live-verified (`just up`).
- **Open/optional:** a first-class dialogue/transcript vellum construct (the Tormeré/Harrow pattern) —
  still surfaced, deliberately not invented ad-hoc.

### Post-migration product work — strider (2026-06-24 session, all COMPLETE + PUSHED + DEPLOYED LIVE)

All on `astra-strider` (10360 / `strider.iridi.cc`), each rebuilt via `docker compose up -d --build strider`
and verified (healthy + local 200 + public-edge 200; the faction panel screenshot-verified).

- **Map content edits** (`1ffe9df`…`bf9bc04`): added the **Final Caliber** skein node at the centre of the
  Radiant Arms base + a skein-connect to iconoclasm's `ears-that-hear-the-truth` (new
  `symbols/final-caliber.svg`); a **tithe** event 3 s before Garrick is removed; then **removed** the
  Tri-Faction Concord + the closing strider-tithe and instead formed the **Team TBD** banner
  (iconoclasm/solari-sub-surface/radiant-arms/alkahest-freight, orange `#E8702E`) on 07-19 10:00, with
  Alkahest struck 07-20 01:02 and Solari 07-20 01:47 (bases + skein nodes; dangling edges skipped at render).
- **✅ Tithe timing fix** (`f183dab`): the wave is now a **fixed-duration** animation (`TITHE_TOTAL_MS`,
  budget-independent — fill travels center→edge over `TITHE_FILL_MS`), fade quicker (`TITHE_FADE_MS`
  720→300), and playback **dwells the full wave** after a tithe layer (`TITHE_DWELL_MS`) so it completes
  before the next layer applies (timing lives in `timeline.ts`, shared by HexMap + useTimelinePlayback).
- **✅ Layers → KDL** (`fe69136` infra + `1fdef3f`; memory `[[strider-layers-kdl]]`). `content/layers/*` are
  now flat **KDL** (op = node name, `slug` positional, `hex q r`/`member` children, `faction=#null`). Parse
  seam keeps `parseChange`+folds unchanged → regenerated `layers.ts` byte-identical (the gate);
  `@bgotink/kdl` build-time devDep; `@astra/content-build` gained `listFilesWithExtension`.
- **✅ Factions → vellum** (`8161283`; memory `[[strider-factions-vellum]]`). `content/factions/*` are now
  **`.vellum`**, one document per faction, rendered build-only via gothic `DocumentView` (no-op crossref);
  member-split/cards gone (personnel = in-document headings); `@astra/vellum-lang` build-time devDep. Plain
  prose renders in gothic mechanical-mode (teal headings). NOT byte-identical — verified visually.
- **✅ Dropped the unused layer `body` field** (`1c51229`): it was parsed/stored/round-tripped but never
  rendered — removed from the schema, `Layer` type, parser/serializer, the 2 files, docs, tests.

### Prior post-migration session — strider map (banner + tithe, COMPLETE + PUSHED + DEPLOYED LIVE)

Two **strider** map "layer changes" added on top of the finished migration, each with its own gotchas memory.

- **✅ Banner / alliance layer change** (`4873609`…`13c2032`, memory `4aa6dfa`). Multiple factions ally and
  combine their land under one **banner** — a new first-class entity `{slug,name,color,symbol?,members[]}`
  with two `Change` ops `banner-form` / `banner-dissolve` (mirroring skein-connect/disconnect; dissolve
  reverts for free). Renders by appending each active banner as a **synthetic pseudo-faction** to the
  faction list, so all the existing pixi fill/hover/click/border-dissolve/flip machinery applies untouched
  (member hexes merge into one banner-colored bloc, inner seams gone). Click → an alliance Modal listing
  constituents; `banner-form` animates as a member→banner color flip; editor `banner` kind (form/dissolve).
  Seed: the **Tri-Faction Concord**. Full facts in `[[strider-banner-alliance-gotchas]]`.
- **✅ Tithe transient event** (`62ddf4e`…`47a6538`, memories `acf4862`/`90b27a7`). A one-shot visual event
  (`{op:"tithe"}`) that **changes no persistent state** — every fold ignores it; it only fires a
  `LayerAnimation`. A wave of flipping purple/black-shader hex tiles **fills** the board center→edge, holds
  briefly (`TITHE_HOLD_MS` 160), then **fades** (`TITHE_FADE_MS` 720). The purple is a **live, animated**
  copy of the page balatro shader (uniform-driven palette, `TITHE_PALETTE`), run as a **filter on a
  container of white flipping tiles, gated by input alpha** (continuous + animated — NOT a baked/tiled
  RenderTexture). Editor `event` kind → `tithe` mode. **Load-bearing pixi v8 gotchas** (filters+masks don't
  compose; RenderTexture-in-ticker is blank; the live-filter recipe; headless-RAF capture caveat) in
  `[[strider-tithe-pixi-gotchas]]`.

---

- **✅ 0013 vellum-frontend COMPLETE — all 7 slices BUILT + PUSHED + DEPLOYED-LOCAL + VERIFIED LIVE**
  (`3835dae`(s1)…`f1171fd`(s7)). The **final** 0011–0013 frontend: faerrin's `vellum` (CodeMirror editor +
  Playwright PNG render service) → **two Compose units** — `vellum-frontend` (SSR editor, **10367**) +
  `vellum-render` (Bun+Playwright, **10368**, the **first browser-in-a-container** in astra). Scope+spec
  gates done (`ab04539`/`0dba4ef`/`5bf93b8`); D2/D4/D5 user-locked. Slices: (1) SSR scaffold + the
  `vellum-frontend`/`vellum-render` config namespaces (both schemas); (2) editor port (`ssr:false` route,
  faerrin `src/app/`→`src/domain/editor/` ~verbatim, gothic `--color-*` remap, ⇄ Syntax dropped per D5); (3)
  full-vellum `:::fields`/`:::timeline`/`[[crossref]]` authoring + the R2 SIGIL-sync gate; (4) the render
  service (warm Chromium, egress-block, Semaphore(2), caps, render span); (5) export wiring (same-origin
  `/render` + dev Vite proxy — round-trip verified); (6) deploy (Chromium Dockerfile, sibling-manifest
  ripple, two Compose units, Caddy `vellum.iridi.cc`, **faerrin's `vellum.iridi.cc` decommissioned**); (7)
  the **visual-regression gate** (goldens regenerated against astra-gothic in the pinned `oven/bun:1.3.14`
  container + a `ci.yml` job, 7 fixtures @ 0.000% drift). **Verified live:** both containers healthy,
  containerized Chromium renders a real PNG, SigNoz has spans for both services. **DNS deferred.** Full
  facts in `[[vellum-frontend-0013-gotchas]]`.
- **🔴 LIVE PIPELINE IS RUNNING + VERIFIED END-TO-END (this session, `851c1c6`…`079c045`).** The Dagster
  pipeline (craig→scribe→linguist→akasha→mouthpiece) ran its **first real end-to-end run** on two Craig
  sessions (2026-6-18, 2026-6-22) → both produced complete `episode.mp3` + transcript; the 42 migrated-seed
  transcripts were never reprocessed. Landed: cascade-sensor **backlog adoption** so sensors re-enable
  without sweeping seed (`851c1c6`); four scribe Groq/ffmpeg fixes (`3400c60`/`628bebe`/`97501e7` + the
  s16/480s chunk cap); transient-provider resilience (litellm `num_retries` `56081e6` + mouthpiece
  `RetryPolicy` `19c945c`); **config.kdl now authoritative for the scribe/mouthpiece models** (`93641e9`);
  a **host-side `linguist-commit` systemd timer** that auto-commits+pushes new transcripts AND
  auto-rebuilds+redeploys **akasha-frontend** (`96e0b96`/`079c045`); akasha cutover gates loosened for live
  growth (`ed3c561`). **akasha-frontend is live with the 2 new sessions** (HTTP 200). All in
  `[[pipeline-live-run-gotchas]]`.
  - **✅ mouthpiece-frontend LIVE-PIPELINE INTEGRATION — DONE + LIVE-VERIFIED** (`a472d54`…`7c25d2f`, this
    session, all 5 steps). The frontend now serves the **full 9-episode corpus** (7 migrated historical ∪ 2
    live), and auto-publishes as the pipeline produces more. (1) `discover_sessions` reads the id from
    `script.json` not the date-keyed dir; (2) `astra_mouthpiece.migrate` (`just mouthpiece-migrate-history`)
    seeds faerrin's flat back-catalog into id-keyed dirs, live-precedence + `_dedup_by_id`; (3) `mouthpiece-seed`
    gathers faerrin-historical then astra-live (live overwrites); (4) `astra_mouthpiece.publish` regenerates the
    committed snapshot from the live corpus (9 eps) + the gates went content-agnostic (superset-of-golden floor,
    "exactly one recap"); (5) the `linguist-commit` timer auto-publishes + redeploys mouthpiece-frontend on a new
    episode (deterministic no-op otherwise). Verified live: 10366 healthy, `/episodes.json`=9, SSR home 9 cards
    incl. live "Six Sandwiches", live episode 200 + audio Range 206. Full facts in `[[pipeline-live-run-gotchas]]`.
- **0012 mouthpiece-frontend — COMPLETE: all 6 slices BUILT + PUSHED + DEPLOYED-LOCAL + VERIFIED LIVE**
  (`032e107`(s1)…`9639bd5`(s6)). The podcast read-surface (faerrin `face` → SSR TanStack), the **third
  0011–0013 frontend** on the strider/akasha template, healthy on **10366**. Scope+spec gates done
  (`399d5cd` scope, `b223abd` spec). **D1–D3 locked; D4–D7 settled in the spec; D6 REVISED mid-build
  (user-approved): the transcript is INLINED into the manifest** so the frontend is a pure single-artifact
  consumer (the backend already owns `strip_audio_tags` + `episode_title`) — the frontend ports NO helpers.
  - **s1 (`032e107`)** `episodes_index` **backend** asset (D1) — globs `episodes_path/<id>/` → one sorted
    `episodes-index.json`; backend owns ALL shaping (id-parse + `mega.date_sort_key` sort + per-arc
    `episode_no` + arcTitle from `campaign.name` + ffprobe durationMs + audioVersion + the inlined stripped
    transcript). 2 documented refinements over face (materialized-session numbering; deterministic recap-last
    tiebreak). Wired into app `defs` + `dagster/definitions.py`. Tested over the 14 golden fixtures.
  - **s2 (`669b50d`)** scaffold from the akasha SSR shell — SLIM deps (no pixi/d3/pagefind/vellum/ontology),
    config namespace `mouthpiece-frontend` (10366) in kdl+Zod+Pydantic, **new-member Dockerfile ripple
    handled** (5 siblings).
  - **s3 (`ecbfcee`)** build-content reads the committed `apps/mouthpiece-backend/snapshot/episodes-index.json`
    (akasha-snapshot pattern + freshness-gate test) → `src/generated/{episodes,transcripts}.ts` (split) +
    `public/episodes.json` (D7 deep-links). Routes read static modules directly (not `useLoaderData`). Dotted
    `$id` losslessly (Risk 2 ✓).
  - **s4 (`887b961`)** gothic re-skin (D3) — masthead/hero/EpisodeCard grid + episode page + speaker-colored
    transcript (3 fixed hosts).
  - **s5 (`4ab82aa`)** the `Player` island (Solid→React 1:1) — MediaSession/scrubbing/localStorage; the
    live-ref fix for React's stale-closure trap; SSR-renders (no ClientOnly); icon PNGs.
  - **s6 (`9639bd5`)** deploy (D2) — `createSsrServer` `staticMounts` (Range-serving audio), `audio-dir`
    config, `mouthpiece-audio` volume + `just mouthpiece-seed`, Compose @10366 + Caddy block. **Verified
    live:** healthy; /, /episode, /episodes.json 200; `/audio/<id>.mp3` HTTP 206 Range (real 24 MB mp3);
    SigNoz `astra.mouthpiece-frontend` SSR spans.
  **Spec-sanctioned deferrals:** `mouthpiece.iridi.cc` DNS (outward-facing; Caddy block authored + validated,
  no `caddy-reload`); the live ElevenLabs pipeline→audio path (manual seed substitutes); grid summed-runtime
  (durationMs=0 in the committed snapshot — the Player's `loadedmetadata` is authoritative, D5). See
  `[[mouthpiece-frontend-0012-gotchas]]`.
- **0011 akasha-frontend BUILT (Phase 5) — ALL 9 slices DONE + PUSHED** (1–9 pushed; HEAD now `0184ed9`,
  four post-slice-9 CI-fix/docs commits: `34b92c3` 0011-COMPLETE docs, `b72ffd4`/`03f0fcd` build-content-test
  + SSR-smoke fixes, `0184ed9` CI-only-test gotchas). The wiki read-surface + the critical-path long pole — **COMPLETE**, deployed locally
  + verified live. **URL-parity cutover gate GREEN** (217 produced slugs == faerrin's contentIndex EXACTLY).
  akasha-frontend is the **second 0011–0013 SSR frontend** on the strider template. **Scope + Spec gates COMPLETE:** scope
  `thoughts/shared/research/2026-06-21-akasha-frontend-0011-thoughts.md`, spec `thoughts/astra/specs/0011-akasha-frontend-spec.md`.
  Two seams **pre-proven**: **N1** Pagefind via the NodeJS Indexing API over in-memory HTML (no prerender),
  **N3** the gothic **`resolveCrossref`** seam (`f13ed5f`). **Slice 1 (`c165b01`):** scaffolded the SSR app from
  the strider template (config namespace 10365 mirrored in both schemas, the shell + RUM seam + SSR smoke,
  placeholder content source, templated Dockerfile, uv exclude). **Slice 2 (`bff194e`):** lifted `slug.ts`
  **verbatim** + `folderIndex` + `site.ts` (input swapped to a snapshot reader, edges **consumed** per N6,
  `gitModifiedDates`/Astro `entry` dropped); generated site module from the committed `akasha-snapshot.json`.
  **THE PARITY GATE IS GREEN** — 141 snapshot slugs **byte-equal** faerrin's 141 non-Script `contentIndex` slugs.
  **Slice 3 (`67dfbd3`):** TanStack SSR **catch-all `$`** route (content / folder-listing `Foo`+`Foo/index` /
  alias) + `index` (home) + `tags/`+`tags/$` + faerrin 404; **`body[data-slug]`** from `__root` (Graph +
  TranscriptPlayer contract); **build-emit** RSS (`index.xml`), `sitemap.xml`, `/static/contentIndex.json` into
  `public/`→`dist/client` (gitignored); **alias `<meta http-equiv=refresh>` stubs via React 19 head hoisting**
  (NOT a 301 — N2). `runtimeSite.ts` reconstructs SiteData from the generated PAGES (reuses site.ts `indexDocs`);
  site.ts made **node-free** (pure basename, so client/SSR-safe) + `buildAliases` added; ported server components
  (Breadcrumbs/ArticleTitle/TagList/Backlinks/PageList + PageLayout/ContentArticle/FolderListing/TagListing);
  added `public-origin` config (both schemas). Routes verified live via the built SSR handler.
  **Slice 4 (`c58517c`):** **vellum body rendering + crossref hrefs** — **build-time**
  `renderToStaticMarkup(gothic DocumentView)` (in build-content, never the client bundle) with the **N3
  `resolveCrossref`** seam: a per-page resolver maps a `[[crossref]]` node → snapshot `edge.resolved` → `slug.ts`
  → `resolveRelative` href (dangling → placeholder). Baked to `generated/bodies.ts` (`BODIES: slug→{html,minutes}`,
  141 pages incl. folder-index bodies, ~295 KB) + injected via `dangerouslySetInnerHTML` into the slice-3
  `data-pagefind-body` article; **ContentMeta** (committer date + reading-time) wired. **gothic `theme.css @source
  "./"`** added — Tailwind v4 skips node_modules, so a DocumentView consumer shipped gothic's utility classes
  (`flex/gap-5/text-accent/decoration-dotted/…`) UNSTYLED; declaring gothic's own source fixes it for all
  consumers (strider re-verified, gothic tests green). Added `@astra/vellum-lang` dep (1-line lock delta).
  CI-green both lanes (typecheck, **33 fe tests**, build, biome; uv ruff/ty/pytest 180). Verified live:
  `:::handout`/`:::fields`/`:::timeline`/prose/GFM render with resolved crossref `<a data-crossref>` links + folder
  bodies + ContentMeta. **Resume at slice 5:** islands → React (Darkmode keep dark-only FOUC inline script,
  ReaderMode, **Popover** — attaches to the slice-4 `a[data-crossref]` links — Explorer from the generated tree;
  per-island unmount teardown, N5). Remaining 6–9: Graph(M2) → transcripts+player(D4,N7) → Pagefind(N1) →
  URL-parity gate (snapshot ∪ transcripts) + deploy. **Decisions:** SSR (I), consume snapshot edges (N6), port
  `matchCampaign` (N7), committer date (N4), DiceDashboard deferred (M3).
  **Slice 5 (`30d6e47`):** **islands → React** — ported faerrin's 4 Solid islands (Darkmode/ReaderMode/Popover/
  Explorer) + built the full **Quartz 3-column page shell** (PageLayout: left sidebar = PageTitle + Darkmode +
  ReaderMode + Explorer; center; right sidebar = SidebarImage + Backlinks moved out of center) + functional
  gothic-toned CSS. All SSR-render + hydrate; **N5 teardown** = `useEffect` cleanup. **Darkmode** is dark-only
  (gothic ships dark unconditionally) — kept for the click path + `themechange` (Graph subscribes); FOUC pre-paint
  `<html saved-theme="dark">` is an inline head script in `__root`. **Popover** binds to `a[data-crossref]` +
  `a.internal`, fetches the target's `.popover-hint`, floats via **@floating-ui/dom** (new dep), re-binds on route
  change. **Explorer** = recursive tree from generated `EXPLORER_TREE` with **SSR-safe collapse** (seed open-map
  from currentSlug only in `useState` init → first client render matches SSR; localStorage merged in a
  `useEffect`); prefix-of-current auto-open; pure state logic in `explorerState.ts` (tested). CI-green both lanes
  (biome, typecheck, **40 fe tests**, build; uv 180). Verified live: sidebars + islands render, Explorer
  auto-opens the current branch.
  **Slice 6 (`c9ab69b`):** **pixi/d3 force-graph (client-only)** — ported faerrin's Solid Graph island to
  React; the imperative pixi/d3 `renderGraph` body lifted **VERBATIM**, only the shell changed
  (onMount→useEffect, onCleanup→cleanup return, ref locals→useRef). The pure data-shaping (link/tag extract +
  depth-limited neighbourhood BFS + node/link assembly) split into **`graphData.ts`** + unit-tested (4 tests),
  mirroring slice-5's `explorerState.ts`. Mounted in PageLayout's right sidebar behind **`lazy()` +
  strider's `<ClientOnly>`** (copied to `src/components/ClientOnly/`) — NOT PixiHost/usePixi (faerrin's graph
  creates its OWN `new Application()` per local/global graph, unlike strider's shared-context HexMap). So pixi
  (getComputedStyle/WebGPU at setup) never reaches the SSR eval path (Risk 5): SSR renders only the reserved
  `.graph-slot`, the graph hydrates client-side. Reads `/static/contentIndex.json` + `body[data-slug]`;
  re-renders on `themechange`; N5 teardown destroys every pixi app + listener on unmount. **Color reality:**
  faerrin colors nodes by PAGE-STATE (current/visited/tag) via Quartz CSS vars read with getComputedStyle —
  NOT per-entity identity colors (I5 ontology-being colors are a slice-7 transcript-speaker concern). Kept
  verbatim; the Quartz var names (`--secondary/--tertiary/--gray/--light/--lightgray/--dark/--bodyFont`) are
  **shimmed to the gothic void palette as CONCRETE hex** in globals.css (a `var()` ref returns unresolved
  from getComputedStyle in some browsers → pixi can't parse it). biome override for the verbatim
  any/non-null-assert/`useIterableCallbackReturn` (tween/Set forEach callbacks) idioms. Verified live: home +
  /Anzu render 200, `.graph-slot` + `data-slug` present in SSR HTML, **no `<canvas>`/pixi server-side**. CI
  green whole repo (biome, typecheck, **44 fe tests**, build all workspaces).
  **Slice 7 (`97e0cec`):** **transcripts (D4/N7)** — reconstitute faerrin's 76 Script pages from linguist
  `data/*.json` and merge into the site graph. **`matchCampaign`** (faerrin content heuristic, adapted to the
  `@astra/ontology` Campaign shape — flat `Role[]`, `role.player` is a slug → billing re-keyed to display
  name; first campaign past threshold-15 in being order wins → `Script/<campaign>/<date>`, else Unsorted).
  **`linker.ts`** (proper-noun auto-linker, longest-first regex over wiki titles+aliases → resolved
  `<a class="internal">` on HTML-escaped text — no remark chain). **transcriptBuild** server-emits faerrin's
  remark-transcript OUTPUT shape (`audio[data-transcript]` + `.transcript-line` rows). **TranscriptPlayer**
  React-ported VERBATIM (renders null, attaches to SSR markup, never reactive — Risk 2). **Speaker colors
  (I5)** `--text<Name>` + per-speaker rules generated from ontology-being → `SPEAKER_CSS` in `__root`. **N7
  PARITY GATE GREEN: reproduces faerrin's 76 Script slugs EXACTLY (1:1).** **Architecture (load-bearing):**
  transcript bodies are ~115 MB (76 × ~1 MB) — too big for in-bundle BODIES, so code-split one lazy module
  per session + loaded server-side via a `transcriptBody` **createServerFn** (full-page nav → loader runs on
  the server; client bundle stays 2.3 MB, transcripts server-only). contentIndex now 217 (141 wiki + 76 tx) =
  faerrin's 217. CI green whole repo (biome, typecheck, **56 fe tests**, build).
  **Slice 8 (`92d551d`):** **search via Pagefind (N1)** — `scripts/build-search.ts` runs AFTER `vite build`
  (dist/client + generated modules exist) and uses Pagefind's **NodeJS Indexing API** (`createIndex` →
  `addHTMLFile({url, content})` → `writeFiles`) over **in-memory** HTML docs (no prerendered static HTML —
  Decision I): wiki bodies from `BODIES`, transcript bodies from the code-split lazy chunks; writes the full
  `/pagefind/` bundle into `dist/client/pagefind` (static-served). Build-time only (the `build` script — NOT
  typecheck/test, so the pagefind binary + 115 MB never load under vitest). `searchDoc.ts` = pure unit-tested
  doc-shape helpers. **Search.tsx** = React port of faerrin's Solid island (sidebar trigger + Ctrl/Cmd-K modal,
  lazy `import("/pagefind/pagefind.js")` via `@vite-ignore` variable path, debounced `pf.search`, result cards;
  N5 teardown), mounted in the left sidebar; gothic `.search-*` CSS. Search is empty under `vite dev` until a
  build (faerrin's caveat). Added `pagefind` devDep. CI green whole repo (biome, typecheck, **59 fe tests**,
  build). Verified live: pagefind indexed **217 pages (217 fragments)**, `/pagefind/pagefind.js` +
  `pagefind-entry.json` serve 200, the Search button SSRs.
  **Slice 9 (`99f6657`) — DONE (the last slice):** **URL-parity cutover gate + deploy.** `urlParity.test.ts`
  asserts the produced slug set (141 wiki ∪ 76 transcripts) **byte-matches faerrin's full contentIndex keys
  EXACTLY (217, no missing/extra/overlap)** — the cutover gate. Deploy: Dockerfile gained `COPY
  ontology/ontology-being` (loadBeing — else the transcript build throws); `akasha-frontend` Compose service
  (ARG APP, 10365, healthcheck, restart unless-stopped) mirroring strider; `akasha.iridi.cc` Caddy block
  (read-only, no /editor; fonts + /pagefind/ self-serve). **Deployed locally + verified live:** image builds,
  container **healthy on 10365**, serves `/` + `/Anzu` + a transcript + `/pagefind/pagefind.js` +
  `/static/contentIndex.json` + `/tags` (all 200), **restart-survives**; **telemetry confirmed via SigNoz MCP**
  — `service.name=astra.akasha-frontend` SSR spans (incl. `SSR GET /Script/Fae-and-Forest/2025-9-11`, the
  server-loaded transcript route). **Deferred (spec-sanctioned):** the public edge (`just caddy-reload` +
  `akasha.iridi.cc` DNS record — outward-facing, like strider/orator/weal-overlay). CI green whole repo (biome,
  typecheck, **61 fe tests**, build). **0011 is COMPLETE.** See `[[akasha-frontend-0011-gotchas]]`.
- **Deploy now fully healthy (this session's detours):** fixed `just up` end-to-end — the dagster image was
  stale Phase-0 (now `uv sync`s the pipeline workspace from repo root, `4ac8b94`); weal Dockerfiles needed the
  full manifest set after the new member (`33377b3`); and — load-bearing — **built the repo-wide SOPS
  secret-injection** the deploy never had (`just up` decrypts on the host + injects UPPER_CASED env; config's
  env-override resolves in-container — `20195ec`). **weal-bot is now LIVE** (real token). See
  `[[deploy-sops-injection]]`.
- **Phases 0–3 COMPLETE:** substrate + shared libs + the full pipeline (scribe → linguist →
  akasha-backend → mouthpiece-backend), all wired in `dagster/definitions.py`.
- **0010 orator BUILT (Phase 4) — all 9 slices DONE + PUSHED** (`98b5618`…`2c2fd10`; the slice-9 chain pushes
  with this docs commit). orator-backend is **deployed locally + verified live** (container healthy on
  `10363`, serves the SPA + `/api/v1/*` + fonts, survives restart) against the **migrated** library; the
  remaining manual step is the public edge (`just caddy-reload` + an `orator.iridi.cc` DNS record — outward-
  facing, like strider/weal-overlay). Scope+spec at
  `thoughts/{shared/research/2026-06-20-orator-0010-thoughts.md, astra/specs/0010-orator-spec.md}`; decisions
  **M1–M5** locked. Lifting faerrin `lark` → **orator-backend** (Bun Compose service) + merging `birdfeed` →
  **orator-controller** (Node/Elgato). Done: (1) **scaffold** both apps + M1 ontology-derived allowlist; (2)
  **Postgres library store** — lark's 9-table schema SQLite→PG + the async `LibraryStore`/`PostgresStore`
  (sync `bun:sqlite`→async Bun `SQL`) + `orator-postgres` Compose unit (10364); (3) **bot+voice+REST** —
  `@discordjs/voice` adapter + the single-session playback engine + the `/api/v1/*` router/library/playback
  routes; (4) **auth** — OAuth2-identify→signed cookie OR Bearer key, session-gated key mgmt, `lark_`→`orator_`
  rebrands; (5) **ingest** — yt-dlp+ffmpeg+R128 + SSE jobs + upload; (6) **data migrator** — lark.sqlite→PG
  (preserve ids) + audio copy (M2, runs at deploy); (7) **operator UI** (`866463c`) — lark's React SPA →
  **`@tanstack/react-router` client SPA** in `orator-backend/src/web/` (code-based router, no routeTree.gen),
  gothic-skinned (Tailwind v4 via `@tailwindcss/vite`), Vite-built to static `dist/` served by the existing
  `serveStatic`; client RUM via a new **public `/api/v1/rum-config`** route (no `createServerFn` — Start-only);
  a `gothicFontsPlugin` copies fonts → `dist/fonts/` so the static dist is self-contained; (8) **orator-controller**
  (`d14557f`) — birdfeed lifted (nav/grid/tags/svg/color pure logic + controller/Slot/plugin) with the
  **configurable origin** (M4: PI Origin field + `normalizeOrigin(settings.oratorOrigin)`; key minting stays
  server-side, plugin only consumes a pasted `orator_` key); Bearer client + 2500ms now-playing poll +
  collection→tag nav (5 named tags + "other") preserved; rollup bundles `bin/plugin.js` (not CI-gated);
  (config scrub `8157a42`) **config-single-source** — dropped the migrator/entrypoint env overrides, kdl now
  holds the real deploy values (port 10363, public-origin, new `data-dir`; mirrored in BOTH config schemas);
  (9) **deploy** (`8b937ca`) — orator-backend Dockerfile (Vite-builds the SPA; ffmpeg+yt-dlp on PATH; davey is
  a **prebuilt napi** module, no compile; all app manifests copied so `--frozen-lockfile` reconciles the shared
  lock), Compose `orator-backend`@10363 + `orator-audio` volume@`/data` (zero config env), Caddy
  `orator.iridi.cc` (self-serves fonts, SSE `flush_interval -1`). **Verified live:** image builds; `docker
  compose config` + `caddy validate` pass; the **M2 migrator RAN** (87 tracks/1 coll/5 tags/87 audio, 0
  missing, loudness preserved, `file_path`→`/data/audio`); orator-backend boots healthy, serves SPA+API+fonts,
  survives restart. Found+fixed a real PG bug en route (`2c2fd10` `listJobsByStatus` — Bun `SQL.unsafe` array
  param → `= any($1)` "malformed array literal"; expand to `in (…)`). **Deferred (spec-sanctioned):** the public
  edge (`just caddy-reload` + `orator.iridi.cc` DNS — outward-facing/manual) + live Discord run (SOPS token) +
  the physical Stream Deck hardware test. CI green both toolchains (121 backend + 36 controller tests). See
  `[[orator-0010-gotchas]]`.
- **0009 weal BUILT (Phase 4) — first bun *service*.** Scope+spec at `thoughts/{shared/research/
  2026-06-20-weal-0009-thoughts.md, astra/specs/0009-weal-spec.md}`. Six CI-green slices (`c40a026`…
  `21d1f18`; last `21d1f18` deploy-wiring is the only UNPUSHED commit): (1) **roller** hand-ported
  faithfully + the **K1 parity harness** (parse/eval-given-faces/plot/property + a serde-codec
  round-trip on the 10 real `mouth.db` `funcs` payloads — the gate); (2) **hosts** — GSR/Rex/Els/
  Whiskers flavor banks lifted into `ontology-being` `weal-host` `lines{}` (py+ts model+reader,
  canonical-JSON parity holds); GSR-only but host-swappable (K8); (3) **Postgres** store + `save_die`
  guards + dedicated `weal-postgres` Compose unit (K9); (4) **discord.js gateway** — full message
  pipeline tested dry via injected deps (acceptance D), I/O shell (gateway/speak/index) typechecked;
  (5) **weal-overlay** — eerie lifted (Bun.serve SPA+SSE, K7), v1-only schema, gothic v4 re-consume,
  client RUM; (6) **deploy** — both Dockerfiles + Compose units + overlay Caddy block (`flush_interval
  -1`). **weal-bot is LIVE** (real SOPS token). **SQLite→PG data migration DONE** (2026-06-23): 8,932 dice +
  10 funcs migrated from `mouth.db` into weal-postgres, ids/player_ids preserved, sequence reset (the 36 live
  rows were truncated first, user-approved). Only remaining nicety: webhook rotation. See
  `[[weal-0009-gotchas]]`.
- **strider (0014) COMPLETE + PUSHED + DEPLOYED LIVE.** The first `apps/*` TS frontend and the canonical
  **SSR-Compose-behind-Caddy template** for 0011–0013. All on `origin/main`. The 7 build slices (`fedd4b8`
  …`a91a72b`): build-content+data-model, pixi hexmap, MapView+routes, editor, SSR Compose deploy
  (`server.ts`/Dockerfile), server `observe`+client RUM. Then this session hardened + shipped it:
  - **Styling fix** (`abbf017`) — the scaffold never wired `@tailwindcss/vite`, so gothic's `@theme`/`@apply`
    shipped raw (black text, no panel bg); add the plugin + the missing `public/` assets.
  - **RUM lib** (`171f28d`) — browser RUM extracted to **`@astra/observe/web`** (`initRum`); frontends import
    it, the `createServerFn` config seam stays per-app.
  - **Host edge** (`e6b3878`, `9374fb4`, `a9a0bf4`, `6a0fdaf`, `15aab1a`) — root **`sites.caddyfile`** is the
    real prod edge (the compose Caddy was dropped): `strider.iridi.cc` (SSR), `otel.iridi.cc` (browser-RUM
    OTLP ingest, CORS for `*.iridi.cc`), `signoz.iridi.cc` (UI). Fonts served from gothic via Caddy (no
    vendored copies; dev middleware for parity). `/editor` + `signoz` gated **local-only**. CF token from
    SOPS via `just caddy-reload`.
  - **Editor → server fn** (`9b87a1b`) — the editor write is now a **`createServerFn`** in the one SSR
    process (the sidecar/`editor-server` is gone). This stack (react-start 1.168) has **no file server
    routes** — `createServerFn` is the server primitive (see `[[tanstack-start-skill]]`).
- **Tooling:** `just up` (rebuild+recreate the stack), `just down`, `just caddy-reload`/`caddy-validate`.
  Apply deploy/edge changes with these — `[[deploy-apply-with-just]]`.
- **Live + verified:** `astra-strider` healthy; the edge serves `/`, `/editor` (local), `/fonts/*`,
  `signoz.iridi.cc` (all 200 via the loopback edge test). **Open:** `otel.iridi.cc` needs a **DNS record**
  before browser RUM spans actually land in SigNoz (cert + reachability); the write server fn isn't itself
  IP-gated (only the `/editor` UI is — **accepted won't-fix**, `[[strider-editor-auth-accepted]]`).
- **strider HARDENING (spec 0016) — COMPLETE: all 7 slices BUILT + PUSHED + LIVE-VERIFIED** (`68fcff0`…`0aaae5f`).
  Readies strider as the *copy* template per the 2026-06-21 review
  (`thoughts/shared/research/2026-06-21-strider-template-review-thoughts.md`); spec
  `thoughts/astra/specs/0016-strider-hardening-spec.md`. **NB renumber:** drafted/committed as "0015" but
  `0015` is the reserved **cutover** plan, so the spec is **0016** (early commit messages still say 0015;
  6b onward use 0016). Done + pushed: (1) idiom/correctness — frontend `verbatimModuleSyntax:false`, router
  error/not-found boundaries, `/editor` `ssr:false`, dead-code + the misapplied `noFocusedTests` ignore;
  (2) tests — `build-content` parsers, `writeLayer` guards, an SSR render smoke (`scripts/ssrSmoke.ts` via
  `src/ssrSmoke.test.ts`, builds-if-needed) + `ssr.fetch`-exists insurance; (3a) one source of hex geometry
  (`hexCorners`/`HEX_SIZE`/`HEX_NEIGHBORS` in hexUtils; pixiScene derives); (3b) shared region paint + skein
  helpers (`mapPaint.ts`, `connKey`/`connectionEndpoints` in skeinGeometry, `strokePolyline` in pixiScene);
  (4) perf — incremental hex updates (reuse unchanged / recreate changed → flip contract intact) + reused
  hover GlowFilter (pixi-filters subpath = 0 B; rollup already tree-shakes); (5) observability — `writeLayerFn`
  traced (span+counter+log), `@astra/observe` preload flushes on SIGTERM/SIGINT, dropped dead CONTENT_HASH,
  rewrote stale layer docs to SSR/server-fn; (6a) extracted **`@astra/content-build`** (generic markdown→
  modules pipeline + `defineContentSource`/`buildContent`), strider consumes it. All CI-green locally;
  **renderer changes (3–4) visually verified in dev.** Nitro+bun migration deferred (non-nightly).
  **6b DONE + PUSHED + LIVE-VERIFIED** (`a03f06c`, `0ac2cec`): extracted **`libs/ts/site-kit`**
  (`createSsrServer`, `startRum` on `./web`, `contentWatchPlugin`/`gothicFontsPlugin`/`generateRouteTree`,
  `loadSiteConfig`); `strider { service-name; port }` in **config.kdl** mirrored in both schemas; Dockerfile
  `ARG APP`; **fonts now self-served from the container** (build copies → `dist/client/fonts`; dropped Caddy
  `gothic_fonts`). **Load-bearing:** importing a workspace TS pkg from `vite.config` needs vite
  `--configLoader runner` (added to dev/build); createServerFn stays in app source; the build stage must COPY
  `ontology/ontology-config`. Live re-verified via the edge (`:2651`, not 443). **Found a pre-existing telemetry
  gap (not a 6b regression):** containers export to `otlp-endpoint=localhost:10353` which is unreachable
  in-container (collector = `signoz-otel-collector:4318`); server-side SSR spans for strider/orator/weal never
  land — its own cross-cutting fix. See `[[strider-0016-gotchas]]`.
  **7 DONE** (`0aaae5f`): split `apps/strider/src` into a thin shell vs **`src/domain/`** (47 renames; the
  faction/hex/skein/editor domain relocated, shell = generic components/hooks + observe + router/routes) +
  `apps/strider/README.md` port recipe. biome.json lint-override globs repointed to `src/domain/`.
  **Telemetry endpoint FIXED** (`ee8f831`): OTLP → `signoz-otel-collector:4318` (in-cluster); `astra.strider`
  SSR spans now land in SigNoz (also fixes orator/weal/Dagster on redeploy). Live re-verified after both.
  **0016 is COMPLETE — no open items.** See `[[strider-0016-gotchas]]`.

### 🎉 MIGRATION COMPLETE — Phases 0–6 all done (2026-06-23)

**The faerrin → astra migration program (`0000`–`0015`) is finished. astra is the campaign's live stack.**
Phase-6 cutover (`0015`) is **COMPLETE**: every public host serves astra
(strider/akasha/mouthpiece/orator/vellum/weal-overlay/dagster `.iridi.cc` all 200, `otel` OTLP ingest
reachable); the Dagster pipeline runs live + verified e2e; the bots/services are live Compose units with
SigNoz traces; the data migrations are done (weal roll history 8,932+10, orator library, the akasha/mouthpiece
content corpora — ids/player_ids intact); faerrin's `strider.iridi.cc` + `vellum.iridi.cc` blocks
decommissioned in-repo.

**No remaining migration work.** Standing leftovers are by-design or optional, NOT blockers:
- strider editor write-endpoint auth — **accepted won't-fix** (`[[strider-editor-auth-accepted]]`).
- Nitro+bun preset migration — deferred until TanStack Start is non-nightly.
- weal webhook rotation — acknowledged nice-to-have (the user opted to skip it).

Future work is now ordinary product/ops on the live stack, not the migration. (Historical per-subsystem build
notes are retained below for reference.)
2. **0013 vellum-frontend — COMPLETE** (all 7 slices built + pushed + deployed-local + verified live; the
   editor on 10367 + the render service on 10368; containerized Chromium renders PNGs; SigNoz spans for both;
   the VR gate is green in the pinned container). **NOW FULLY LIVE on `https://vellum.iridi.cc`** (DNS set +
   `just caddy-reload` applied 2026-06-23 — `/`+`/editor` 200, `/health` ready, `POST /render` returns a real
   PNG through the public TLS edge). **No open items** — the first 0011–0013 frontend taken all the way to the
   public edge. See `[[vellum-frontend-0013-gotchas]]`.
3. **0012 mouthpiece-frontend — COMPLETE** (all 6 slices built + pushed + deployed-local + verified live on
   10366; audio Range-serves, SigNoz SSR spans). Only open item = the manual `mouthpiece.iridi.cc` DNS edge
   (outward-facing; Caddy block authored + validated). See `[[mouthpiece-frontend-0012-gotchas]]`.
3. **0011 akasha-frontend — COMPLETE (all 9 slices built + PUSHED).** Deployed locally + verified live (healthy
   on 10365, telemetry in SigNoz), URL-parity cutover gate GREEN. **Only open item = the manual public edge**
   (`just caddy-reload` + an `akasha.iridi.cc` DNS record — outward-facing, like strider/orator/weal-overlay;
   the Caddy block is authored + in `sites.caddyfile`). See `[[akasha-frontend-0011-gotchas]]`.
3. **Frontends 0012–0013** (mouthpiece-fe, vellum-fe) — the strider SSR template copy; 0011 is a second worked
   example alongside strider (esp. build-time content + the createServerFn server-only-data pattern + Pagefind).
   **READ FIRST:** `apps/strider/README.md` + `apps/akasha-frontend` (Dockerfile/compose/Caddy + build-content),
   the migration guide, `[[strider-0016-gotchas]]`, `[[akasha-frontend-0011-gotchas]]`.
3. **Phase 4 services DONE** — 0009 weal + 0010 orator both **BUILT** (deployed-local; public edge + live
   Discord run deferred on SOPS/DNS). **strider 0016 COMPLETE** — the copy-ready template.
4. **Phase 6 cutover** (plan `0015-cutover.md`) big-bang, last — needs frontends 0012–0013 first.

**Frontend gotchas (template — full list in `[[astra-migration-research]]`):** SSR (no `prerender` block);
commit `src/routeTree.gen.ts` (biome-ignored); `vite.config` is ESM and **cannot import `@astra/config`**;
**wire `@tailwindcss/vite`** + ship `public/` (favicon, symbols) or gothic styling is dead; gothic v4
`--color-*` token rename on lifted CSS + Caddy `gothic_fonts` serves the webfonts; pixi behind
`lazy()`+`<ClientOnly>`; server-side endpoints = **`createServerFn`** (no middleware — `[[tanstack-start-skill]]`);
client RUM = `@astra/observe/web`; new `apps/*` TS dir → add to `pyproject.toml` `[tool.uv.workspace]` `exclude`.

---

*Start by reading the orient docs, then pick up at the "Next" item above.*

---
name: heartwood-0020-gotchas
description: heartwood (0020) — akasha setting wiki, now FACTS-ONLY (2026-07-12 rework — LLM drafting RETIRED, the human writes every body from staged facts); Phases 1-4 machine DONE + LIVE on heartwood.iridi.cc — only the human-gated content acceptance (write+approve pages → live wiki) remains; locked decisions + verified gotchas + the faerrin-failed-twice lesson
metadata:
  type: project
---

**heartwood (0020)** — a net-new **multi-phase** subsystem: an LLM (GLM-5.2) reads play-session
transcripts and maintains the akasha **setting wiki** (the "nouns" — people/places/things, NOT
play-by-play; chronicle + Script pages already cover narrative sequence), proposing changes for
**human-gated PR-style review** at a bespoke **`heartwood.iridi.cc`** (vellum-editor base). Docs:
`thoughts/shared/research/2026-06-27-heartwood-0020-thoughts.md` (umbrella, decisions D1–D10 + open-Qs §7
all resolved), `…-0020-phase1-registry-thoughts.md` (Phase-1 scope), `thoughts/astra/specs/0020-heartwood-phase1-registry-spec.md`.

**Phase structure (5):** (1) ontology infra — `world` field + typed entity registry ✅ **DONE**;
(2) **extraction engine** ✅ **DONE (acceptance CLOSED)**; (3) **prose proposer** (the make-or-break
house-voice gate — anti-AI-slop is THE bar) ✅ **DONE (5 slices + rewrite hardening)**; (4) **review surface +
write-back** ✅ **BUILT + SURFACE LIVE** (6 slices, scope+spec at `…-phase4-review-writeback-{thoughts,spec}.md`);
(5) backfill/automation. **Human-gated through Phase 4**; steady-state automation deferred until Phase 5.

**▶ RESUME AT: the human-gated CONTENT ACCEPTANCE, now on the FACTS-ONLY surface** (Josh WRITES ≥1 create +
≥1 rewrite from the staged facts in the live editor, approves them → `just heartwood-apply 2025-8-28` →
verify live on akasha). That is Josh's call by design (D1); the machine is done. The surface is LIVE:
`https://heartwood.iridi.cc` (58 cards — 39 create / 19 rewrite). **Phase 5** = cross-session accumulation +
backfill over ~40 sessions (now extraction-cost-only) + sensor/schedule automation.
Umbrella `…/2026-06-27-heartwood-0020-thoughts.md`; the rework + Phase-4 + Phase-3 specs/scopes below.

## FACTS-ONLY REWORK (2026-07-12) — drafting RETIRED; the human writes the prose. COMPLETE + LIVE

Stakeholder redirect before the content acceptance ran: **the machine must not write wiki prose — cards
show only the FACTS; the human authors every body in the editor.** The terminal step of the faerrin
lesson (extraction stayed, drafting died). Scope `…/2026-07-12-heartwood-0020-facts-only-rework-thoughts.md`,
spec `…/0020-heartwood-facts-only-rework-spec.md` (COMPLETE — S1 `f3a834b` · S2 `3eb306c` · S3 deployed +
live-gated same day; adversarial review pre-build found 2 blockers, folded in). Shape: proposer = facts →
group/place → manifest + skeleton `.vellum` (create = `---\ndate: <date>\ntags: []\n---\n\n`, rewrite =
live page byte-identical), ZERO LLM calls (`draft.py`/`voice.py` deleted, `lint.py`→`page_type.py`);
Approve gated on placement ∧ persisted-save ∧ real content (`canApprove.ts`, pure + unit-tested);
conflict machinery deleted BOTH lanes (review.kdl kept `conflict-res` — contract frozen, fixture green
unchanged); `apply.py`/`review.py`/justfile needed ZERO changes (apply copies body bytes verbatim).
`2025-8-28` regenerated: 58 pages (39c/19r — the 8 "already-known" novelty skips resurfaced as cards; the
gate was LLM-only, the human's reject reason `already-known` replaces it), 0 skipped.

**THE rework gotchas (all verified live):**
- **⭐ The debounced-save race (adversarial blocker B2) is the load-bearing guard subtlety:** the editor's
  600ms debounced write was CANCELLED un-flushed on unmount, and the island unmounts on every tab switch —
  write → flip to Diff → Approve inside 600ms would have approved while `apply.py` reads the still-empty
  skeleton off disk. Fix = flush-on-unmount + save-status lifted to `ProposalCard` + `canApprove` requires
  `savePersisted`. **And the sibling hazard the S2 agent called "cosmetic": the island remounted seeding
  from the original `body` PROP — the next keystroke would debounce-save STALE text over the flushed
  edits. Reseed `initialSource={source}` (the lifted live buffer).** Both proven live via Playwright
  (write→tab-switch→reload, prose survives on disk; prove-and-revert, debris removed).
- **SigNoz queries: the frontend service is `astra.heartwood-frontend`** (the telemetry-coverage-pass
  de-collision) — querying `astra.heartwood` returns the PY backend only and looks like "zero spans".
  A single counter increment on a fresh cumulative series is INVISIBLE under `increase`/`rate` scalars
  (flat-at-1 ⇒ 0); prove it via the series' BIRTH (groupBy the attr, time_series, exact window).
- **⚠ A subagent restarted the linguist-commit timer unprompted** (it "helpfully" undid my deliberate
  stop at its session end) — the timer fired once in the gap and pushed my committed HEAD early
  (harmless: its commit sweeps only STAGED files, 0021 refined gotcha). Tell implementation agents the
  timer is out of bounds, and re-verify `is-active` after every agent completes.
- The novelty gate (P3.15) had NO non-LLM equivalent — it lived in the draft's `ALREADY-KNOWN` sentinel;
  under facts-only ~8 more rewrite cards/session surface and that's the design (human novelty judgment;
  `already-known` is a rejection reason now). `pov_shift` likewise died with the appended passage.
- Regen determinism held: byte-identical rewrites (all 19 diffed clean against the corpus), skeleton-exact
  creates, deterministic ordering — the committed-manifest diff is reviewable. `manifest.test.ts` pins the
  regenerated counts; regen + count-update must land in ONE slice.

## Phase 4 — review surface + write-back: BUILT + SURFACE LIVE (6 slices, 2026-06-28)

`apps/heartwood-frontend` (the public PR-style review surface, port **10371**, `heartwood.iridi.cc`) + the
host-side write-back in `apps/heartwood-backend` (`apply.py`/`review.py`). Scope+spec
`thoughts/{shared/research/2026-06-28-heartwood-0020-phase4-review-writeback-thoughts.md, astra/specs/0020-heartwood-phase4-review-writeback-spec.md}`.
Decisions **P4.1–P4.18** (the 4 forks settled with Josh): browser-decides/host-applies; full in-browser
editor; per-session `review.kdl`; end-to-end-live acceptance. Slices **S1** config+scaffold+deploy →
**S2** manifest reader+read-only review → **S3** editor+diff → **S4** decisions/placement/conflicts →
**S5** host write-back → **S6** deploy+live. **The machine is built, tested, pushed; only the content
acceptance (a human approving pages into the live wiki) is left — that's the D1 gate, not an autonomous step.**

**THE load-bearing Phase-4 gotchas (verified by building + deploying it):**

- **⚠️ `user: "1000:1000"` on the heartwood compose unit is THE write-back fix (B1).** Every bun/dagster
  container runs as **root** by default (NO `USER` directive in any frontend Dockerfile; proof: a
  container-written `apps/linguist/data/<date>.json` is `0:0`). The heartwood surface writes `review.kdl` +
  edited `.vellum` to a narrow **rw bind-mount** of `apps/heartwood-backend/proposals/` — without
  `user: "1000:1000"` (= the host repo owner) those land `0:0` and the host can't `git`-commit them or let
  `just heartwood-apply` stamp `review.kdl` in place (the `apps/vellum-render/dist` EACCES class). No `user:`
  precedent existed in compose — added deliberately. **Verified:** a `--user 1000:1000` container writing the
  mount produces `1000:1000` host files. The corpus + snapshot are mounted **ro** (only `just heartwood-apply`
  writes the corpus).
- **The browser-decides / host-applies split (P4.1):** the public no-auth surface ONLY stages decisions to
  `review.kdl` (the rw mount); the one host-privileged step — write corpus `.vellum` + `entity.kdl` + regen
  snapshot + commit + push + redeploy akasha — is the human-run `just heartwood-apply <date>`, never a public
  endpoint. **strider's editor proves the containerized-write is otherwise ephemeral** (it writes the
  container fs, gated `local_only`); heartwood writes the *host repo* via the mount instead.
- **The cross-language `review.kdl` contract (B3):** written by TS (`reviewState.ts`), read+rewritten by
  Python (`review.py` apply). **`@bgotink/kdl` is parse-only repo-wide** → the writer is HAND-ROLLED on both
  ends (the strider `kdlString` / Python `_kdl_str` idiom), and a **shared fixture
  `apps/heartwood-backend/tests/fixtures/review-sample.kdl` round-trips byte-identical in BOTH lanes** (the TS
  test reads the same file via `../heartwood-backend/...`). If either serializer drifts, one test fails.
- **`just heartwood-apply` step order (S5):** apply (write approved pages + registry-adds) → **validate the
  corpus** (`bun libs/ts/vellum-lang/scripts/validate-corpus.ts --dir …` — catches a malformed write BEFORE
  commit, B2) → **`uv run akasha-snapshot`** (the real entry — `main()` is pure-Python `write_snapshot()`,
  and it **SKIPS** the TS validator, hence the explicit validate first) → path-scoped `git add` + `fetch` +
  **rebase** (the linguist-commit timer moves origin) + push → `docker compose up -d --build akasha-frontend`.
  `apply.py`: create writes (refusing to clobber an existing page + **normalizing the bare `date:` to ISO**,
  E4), rewrite overwrites with the full preserve-and-append body (P4.6), registry-add → `entity.kdl` via a
  non-clobbering in-place update (`merge_seed` precedent), `committed-at` stamp → **idempotent re-runs**.
- **⚠️ The `linguist-commit` timer pushed my ORIGINAL S5 before I amended it** (the Phase-1 gotcha, hit
  again — the timer runs `git add/commit/PUSH` on THIS repo every ~15 min). After amending S5 locally, origin
  already had the original → couldn't fast-forward + a force-push to shared `main` is wrong. **Fix: `git reset
  --soft origin/main` + re-commit the delta as a FOLLOW-UP fix** (here the test rename), never force-push.
  During a long multi-commit session expect origin to move under you.
- **`test_apply.py` basename COLLISION** — `apps/heartwood-backend/tests/test_apply.py` collided with the
  pre-existing `apps/linguist/tests/test_apply.py` (no `__init__.py` in the test dirs → pytest's `prepend`
  import mode rejects two same-named modules) → the **full `uv run pytest` collection FAILS even though every
  per-app run is green**. Renamed to `test_apply_writeback.py`. **Reproduce CI with the FULL `uv run pytest`,
  not per-app** (and CI red-flagged exactly this).
- **The vellum editor port (S3):** copied `apps/vellum-frontend/src/domain/editor/{Editor,Preview,vssLanguage,
  vellumHighlight,slashComplete}.tsx + editor.module.css` VERBATIM (self-contained — only `@codemirror/*` +
  `@lezer/*` + `@astra/vellum-lang`) + `ClientOnly` (harrow). CodeMirror is client-only → the `EditorIsland`
  mounts behind `<ClientOnly>` (the SSR HTML correctly has NO `cm-editor`); the card is otherwise SSR. Needs
  the **biome editor path-override** (mirror vellum's, E1) + the CM deps. `voiceLint.ts` is a TS mirror of
  `proposer/lint.py` (live, advisory — index pages key broken-wikilink by **parent-folder** name).
- **TanStack `Route.useLoaderData()` types loosely** → annotate `.map`/`.filter` callbacks with the explicit
  domain types (`SessionSummary`/`PageProposal`/`Decision`/`ConflictResolution`) or `tsc` reds implicit-any.
- **`grep -a` to verify SSR HTML** (UTF-8 glyphs like `❦` read as binary — the harrow gotcha, hit on the
  index). **gothic `theme.css` already ships `@source "./"`** → `DocumentView` consumers get the utilities
  free (no per-app `@source`). Deploy: backend-less → plain `docker compose up -d --build heartwood` (no
  SOPS); the **`*.iridi.cc` wildcard + ACME minted the cert on first request (~20 s)** — `caddy-validate` then
  `caddy-reload`, the ledger pattern. The new app needs the **11-sibling Dockerfile manifest ripple** +
  config namespace in BOTH schemas + uv exclude.

## Phase 2 — extraction engine: DONE + PUSHED, acceptance CLOSED on first TSD session `2025-8-28` (2026-06-28)

New read-only app **`apps/heartwood-backend`** (pkg `astra-heartwood-backend`, module `astra_heartwood`):
world-filter → **filter** (Stage 1) → **extract** (Stage 2) → **resolve()** → **refine** (Stage 2.5) →
committed `facts/<date>.json`. Mirrors chronicle's per-session asset. Slices S1 `a908184` / S2 `ee8ea04` /
S3 `c148c47` / S4 `9591ac9` / **S2.5 `a1225fb`**, + `fix(llm)` `98ef460` + `feat(lexicon)` `8f25f60`.

**THE Phase-2 gotchas (verified by building + running it live):**

- **A Dagster `@dg.asset` module must NOT `from __future__ import annotations`.** It stringifies the
  `context: dg.AssetExecutionContext` hint, and dagster's `_validate_context_type_hint` rejects the string
  `"dg.AssetExecutionContext"` (wants the bare runtime type). linguist's `assets.py` omits the future import
  for exactly this reason — mirror it (`assets.py` only; the rest of the package keeps the future import).
- **biome formats committed JSON → exclude the facts data dir.** The pre-commit gate's biome check scans
  UNTRACKED files too, so an unformatted `apps/heartwood-backend/facts/*.json` blocks every commit. Added
  `"!**/heartwood-backend/facts/**"` to `biome.json` `files.includes` (the `linguist/timeline/**` precedent).
- **`astra_llm` forced-tool calls fail two flaky ways on GLM-via-OpenRouter; the client bounded-retries
  both (`_TOOL_JSON_ATTEMPTS=3`).** (a) **Malformed/garbled tool JSON** in an otherwise-successful completion
  (`98ef460`) — `litellm.num_retries` only covers API errors, so `json.loads` raised a raw `JSONDecodeError`
  that killed the run; bounded completion+parse retry → typed `LlmError`. (b) **`finish_reason=stop` with NO
  tool call at all** on a forced tool (`608fc63`, this session — bit the §11 refine stage). The code used to
  fall straight through to a hard "did not call the forced tool" error; now it retries within the same loop.
  Both helps chronicle/mouthpiece too. To shrink risk, refine batches are small (`REFINE_CHUNK_FACTS=20`).
- **⚠️ GLM-5.2 reasoning tokens SHARE the `max_tokens` budget with the tool-call output** (fixed `a0e13ee`,
  this session). The extractor is an *exhaustive* enumeration ("record every noun-fact"), so a dense chunk's
  fact list + reasoning blew past the 8k cap → the client's truncation guard (`finish_reason=="length"`)
  rightly rejected the partial result. **Shrinking the chunk alone did NOT fix it** (21 provider calls proved
  chunking engaged; one chunk still overflowed) — reasoning is the dominant consumer. Fix: raise
  `EXTRACT`/`REFINE_MAX_TOKENS` 8k→**16k** (the client `DEFAULT_MAX_TOKENS`; heartwood had deliberately
  undercut it) + drop `EXTRACT_CHUNK_WORDS` 16k→**4k** for extra headroom. **NB the v4 (pre-guard) run's
  "144 facts" was a SILENTLY TRUNCATED list** — the guard now surfaces what was hidden. For any GLM
  `call_structured` over a large/open-ended output, budget 16k and chunk small.
- **World filter = 40 ingested / 3 world-drop / 1 EXCLUDED_DATES** (NOT "41" — the scope/spec first said 41;
  `2025-8-11` sits inside the 33 `through-a-song-darkly` `.txt` and is excluded → 32 main + 8 side = 40).
  `faerrin_session(date)` = `show_for_date` (honors EXCLUDED_DATES) ∩ `faerrin_campaign_slugs`. **Verify
  counts against the live modules, don't trust the doc.** heartwood depends on **`astra-linguist`** (reuse
  its `Transcript` model + `show_for_date`; accepts its dspy/wordfreq transitive weight).
- **P2.1 REVISED the umbrella: PCs ARE wiki-eligible** (umbrella §5 hard-problem #2 / §3a edited). No PC
  special-casing in extraction; the registry's 20 PCs resolve like any noun.
- **Stakeholder forks:** held-out gate was **2026-6-8**, later **relocated to the first TSD session
  `2025-8-28`** (chronological order — see the acceptance bullet below); **no citations** in Phase 2 (lean
  facts); **PCs get pages** (P2.1). And the big one ↓.
- **The refinement pass (Stage 2.5, `refine.py`) is feedback-driven + load-bearing.** The window filter
  (Stage 1) can't stop a *kept* window's durable facts from sitting beside event narration, so the extractor
  still emits play-by-play ("Mindbird sniped several people"). Stage 2.5 is an LLM pass over the extracted
  facts that (a) **drops non-wiki facts by typed category** — `event / ability / possession / mechanical
  (gold/levels/stats/HP/DCs) / nonsensical` (stakeholder: abilities, known spells, possessed items, and gold
  values are NOT setting-wiki material) — into a `refined_out[]` audit (`RefinedOutFact.category`), and
  (b) **canonicalizes resolved names**. **THE dealbreaker it solves:** a resolved ASR mislabel (e.g.
  `Y'shael`, which is just a mis-transcription of `Ichel` — there is NO character "Y'shael") must NEVER
  surface anywhere in output. So the kept fact's subject is set to the canonical AND its claim is rewritten
  to the canonical name; a **deterministic `re.sub` safety-net** backstops the LLM (applied to kept facts
  AND `refined_out` claims — the first fix missed the audit and `Y'shael` survived there). Keep-when-in-doubt
  on durability (don't drop genuine lore); a `keep=false`+`category=setting` contradiction falls back to keep.
- **Accuracy is inherently imperfect (Phase-4 review territory, not a Phase-2 blocker):** factual
  hallucinations ("Outcast is a faction") + the **`Voidheart→voidward` confident false-link** (new item
  phonetically near an existing entity, 0.82 > floor). Tightened EXTRACT grounding (no inferred
  relationships) + the `nonsensical` drop category reduce these; the rest is what the human review (Phase 4)
  exists for. Resolve-threshold tuning could catch Voidheart but trades against real garbles at ~0.86
  (`Y'shael→Ichel`) — defer, tune carefully.
- **Live run mechanics:** host-side `OTEL_SDK_DISABLED=true uv run astra-heartwood-extract <date>`; ~$0.5/run;
  litellm "Provider List" lines + the final result print **only flush at process exit** (buffered through the
  pipe — a mid-run log looks empty even while healthy; rely on the bg-task completion signal, not a log tail).
  Writes `facts/<date>.json` atomically at the very end, so a mid-pipeline crash leaves NO new artifact.
- **Acceptance was RELOCATED off the held-out 2026-6-8 → the FIRST `through-a-song-darkly` session
  `2025-8-28`** (stakeholder call, this session). Rationale: **process the campaign in chronological order**
  so later sessions key off the world built up earlier. Closed §11 = GOOD PASS: `facts/2025-8-28.json`
  (`e0508ad`), **149 facts / 38 refined-out / 95 dropped**, page-aware (47 existing-page / 72 known-no-page /
  25 new / 5 ambiguous), taxonomy clean, no raw mislabels. The stale `facts/2026-6-8.json` (v4) was discarded.
- **Page-awareness (answers "does it see existing pages?"): YES, at RESOLUTION, not extraction.** The
  registry (`entity.kdl`) is seeded from the **akasha wiki snapshot** ∪ `defs.kdl` ∪ faerrin PCs
  (`ontology-entity/seed.py`); each `EntityRef` carries a `page`. So a fact resolves to: **resolved + page**
  = update an existing page; **resolved + no page** = known entity, new-page candidate; **unknown** = net-new
  noun. The extractor itself reads only the transcript (page-blind). **The "world builds on itself" loop does
  NOT yet close across heartwood's own sessions** — a session's discovered facts live only in `facts/*.json`
  (drafts); they reach the registry only after **Phase-4 write-back + re-seed**. So **full backfill is
  Phase 5**, gated behind 3–4 (backfilling extraction-only now would just be reprocessed later).

## Phase 3 — prose proposer: DONE + PUSHED (5 slices + rewrite hardening; 2026-06-28)

Scope `…/2026-06-28-heartwood-0020-phase3-proposer-thoughts.md` (`cb86823`), spec
`…/0020-heartwood-phase3-proposer-spec.md` (`7ec629b`). New sub-package
**`apps/heartwood-backend/src/astra_heartwood/proposer/`**: facts (Phase 2) → `group.py` (facts→target pages)
→ `draft.py`/`voice.py` (`call_text` draft) → `lint.py` (tell-lint) → bounded revise → `assemble.py` →
`manifest.py`/`pipeline.py` emit committed **KDL manifest + sibling `.vellum`** under `proposals/<date>/`.
Read-only — no corpus writes / no review surface / no deploy (Phase 4). Slices **S1** `f9e3ce0` (models/group/
placement/manifest) → **S2** `7f8dd89` (tell-lint) → **S3** `49c20e1` (draft) → **S4** `c51cffe` (revise/
assemble/emit/`session_page_proposals` asset) → **S5** `e3a57f8` (telemetry + dagster wiring + Dockerfile).
CLI `astra-heartwood-propose <date>`; a full run is **~$0.10** (GLM-5.2, ~58–65 short `call_text` calls, the
`DRAFT_SYSTEM` prefix prompt-caches → ~$0.0016/call; measured live).

**THE load-bearing lesson — this feature FAILED TWICE in faerrin** (`git show e2cb11e^` in `/ruby/data/experiments/faerrin`):
a 7-stage PR tool AND a careful human-on-the-pen rewrite, both deleted ("voice may be partially unlearnable by
LLMs"). Phase 2 absorbed their #1 failure (extraction). **Ported their hard-won assets verbatim** (recover via
`git show e2cb11e^:pkg/heartwood-review/src/lib/voice-warnings.ts` etc. — the heartwood pkgs are GONE from
faerrin's tree): `DRAFT_SYSTEM` spine, the **GOOD/BAD calibration** (GOOD=Sableclutch, BAD="X is a large
scrapyard… It is an expansive site…"), `voice-warnings.ts` tell-lint, `page-type.ts` suppression.

**THE Phase-3 verdict — creates PASS, the full-body-replace rewrite FAILED → P3.9 REVISED to PRESERVE-AND-APPEND
(`9c1bbd8`, this session).** The live acceptance run (`0dfb6e0`, 51 pages) showed CREATES read as genuine house
voice (near-zero residual prose tells) but **merged REWRITES systematically flattened the human's prose**: 3 of
12 converted a 2nd-person page → 3rd person, and **9 of 12 SHRANK the body** (ratios 0.11–0.94 — the model
*summarizes* the existing page instead of weaving). Stakeholder §11 = "pass creates, harden rewrites" (the spec
§12 fallback). **Fix: a rewrite no longer regenerates the whole body — it PRESERVES the existing frontmatter +
body verbatim and APPENDS a short passage** in the page's voice (`assemble.py`; the draft's user-message says
"write a NEW passage to append, do not rewrite"). POV/content loss is now impossible *by construction*; the diff
is purely additive (the human keeps the pen). Re-run (`8624ff7`): all 3 formerly-flattened 2nd-person pages keep
POV, every rewrite ratio >1.0, residual = 4 broken-wikilink warnings. **Lesson: do NOT trust an LLM to faithfully
"rewrite/merge into" hand-authored prose — it summarizes + drifts POV. Generate only the NEW material and append.**

**The other load-bearing gotchas (verified by building + running it):**
- **`call_text` is the prose path** (NOT `call_structured` — prose must not be tool-JSON). `TextRequest` → str;
  truncation + empty guards; **one shot, no auto-retry**. New `TextClient` protocol + `real_text_client()` seam in
  `llm.py` (mirrors `StructuredClient`) so the draft stage unit-tests with a stub, no key/network. `DRAFT_MAX_TOKENS=8k`
  (GLM reasoning shares the budget — the Phase-2 lesson). Long prompt strings use **implicit string concatenation**
  (≤100-col lines), the repo convention (`prompts.py`) — NOT triple-quoted (ruff E501 / no per-line noqa in a string).
- **`pov_shift` mechanical warning** (rewrite-hardening) — deterministic: existing body is 2nd-person (`is_second_person`
  regex on you/your) but the appended passage isn't → a warning that ALSO triggers the bounded revise (`REVISABLE_TYPES
  = prose-tells ∪ pov_shift`) to re-draft in the right POV. Only 2nd→non-2nd is flagged (adding "you" to a 3rd-person
  page is rarely the error). `ALREADY-KNOWN` sentinel (novelty, P3.15) + a trailing `CONFLICTS:` section (P3.17) are
  parsed off the `call_text` output by convention (`draft.py`).
- **The akasha page BODY is separate from the snapshot** — `apps/akasha-backend/content/<path>.vellum` (snapshot JSON
  has `pages[].path`/frontmatter/crossrefs but NO body). `proposer/corpus.py` is the read-only seam (content body,
  snapshot path-set for crossref validation, `facts/<date>.json`). akasha-backend ships in the dagster image already
  (whole-dir COPY) so the proposer reads the corpus in-container.
- **⚠️ `dagster/Dockerfile` was MISSING `COPY apps/heartwood-backend`** — a latent Phase-2 gap (`definitions.py`
  imports `astra_heartwood` + it's an editable `uv.lock` member, so `uv sync --frozen` needs the dir; Phase 2 only
  ran host-side so the image was never rebuilt). Fixed in S5 (`e3a57f8`) — added the COPY + registered
  `session_page_proposals` in the root code location. **When adding a pipeline app, the dagster Dockerfile COPY list +
  the root `definitions.py` assets list BOTH need it** (the heartwood-backend `assets.py` `defs` is NOT auto-loaded).
- **Page placement** (`proposer/group.py`) — deity→Divinity, place→Geography/<N>/index, phenomenon→Phenomena,
  creature→Bestiary, org→Org/<N>/index, person→Org/<Org>/People/<N>. **`item` has NO corpus folder** + person→org has
  no structured link (facts are independent rows) → both flagged `needs-placement/` + a `placement_note`, NEVER an
  invented folder. id-slug = `slugify(target_path)` (NFKD→ASCII, never crashes on `Færrin`→`frrin`) + collision suffix.
- **P3.15 novelty gate** (skip already-stated rewrites → `SkippedPage(already-known)`; 7–8 of the 2025-8-28 rewrites
  skip) and **P3.10 non-prose skip** (deity/timeline/flavor-`<pre>` pages NOT rewritten — would destroy `@deity`/
  `@timeline`; none triggered on 2025-8-28 since no fact resolved to such a page) both fire as designed.
- **biome:** `.kdl`/`.vellum` are NOT biome targets (unlike the Phase-2 facts JSON which needed an exclude) → the
  `proposals/` dir needs NO biome exclude (confirmed — pre-commit gate clean). **No drift gate on `proposals/`** (LLM
  non-determinism, like `facts/`); structural/round-trip tests only. **Acceptance is stakeholder-judged, no metric** —
  and it's a per-page judgment (creates passed, rewrites needed the hardening); don't self-certify the voice bar.
- **Live run mechanics** (same as Phase 2): host-side `OTEL_SDK_DISABLED=true uv run astra-heartwood-propose <date>`;
  litellm "Provider List" noise + the summary print **flush only at process exit** (a mid-run log tail looks empty —
  rely on the bg-task completion signal). `write_change_set` is atomic + idempotent (clears stale `*.vellum` so a
  vanished proposal leaves no orphan).

## Phase 1 — BUILT + PUSHED (all 5 slices CI-green, `139db9f`…`e0458f9`, 2026-06-27)

- **S1** `world: str` **required, free-form** on `Campaign`. **faerrin** (5): through-a-song-darkly,
  a-hunt-of-metal-and-vine, the-first-spark, interred-in-iomenei, fae-and-forest; **finnegan's ring** =
  fey-in-the-mists; **sedecium** = observatory-slipped. `faerrin_campaign_slugs(being)` filters to the 5.
- **S2a/S2b** new shared lib **`astra-lexicon`** (`libs/py/lexicon`, pkg `astra-lexicon`) — lifted
  `phonetics`+`normalize`+`Lexicon`+`corrections` out of linguist + `defs.yaml→defs.kdl` (235 entries).
  Linguist refactored onto it, **zero behavior change** (its surface/judge/goldset suites are the gate).
- **S3** new **`ontology-entity`** member (`ontology/ontology-entity`, pkg `astra-ontology-entity`); the
  `Entity` model + `seed_entities` + `resolve` engine live in `libs/py/ontology` (gained `astra-lexicon`
  dep). **311 entities** seeded into `entity.kdl`: 117 akasha noun pages ∪ 174 defs-only ∪ 20 faerrin PCs.
- **S4** `Resolver(entities).resolve()` (engine + thresholds in `astra_ontology`) + telemetry-wired
  `astra_ontology_entity.resolve()` seam. Acceptance `resolve("Y'shael")→Ichel` green.

**THE load-bearing gotchas (verified by building it):**

- **⚠️ The `linguist-commit` systemd timer (~15 min) does a broad `git add` + commit + PUSH from the live
  repo — it grabs UNTRACKED source files, not just `thoughts/`.** Mid-S2a it committed my 3 new untracked
  `astra-lexicon` .py files as `fca23ce` ("auto-commit N new … file(s)") **on top of my last commit and
  pushed**, diverging history. Recovery: `git fetch`, then **rebase** my local commits onto origin/main
  (NOT merge — a merge commit fails commitlint); content converged so it was clean. **During a long
  multi-commit session, expect origin/main to move under you — fetch+rebase before pushing.** (Also bit
  via a `git stash`/`pop` of my own: avoid stash experiments with untracked new packages present.)
- **`add_correction` writes KDL by minimal-diff TEXT-INSERT, not ckdl re-emit.** `ckdl` *can* serialize
  (`str(Document)`, `EmitterOptions`) but it reformats (drops quotes, re-spaces) → not a clean PR diff. So
  defs.kdl write-back finds the `entry "<canon>" {` line and inserts `    variant "<frag>"` before its `}`.
  Garbles are **regex fragments stored verbatim**; a `_kdl_str` escaper doubles `\`/escapes `"` (e.g. the
  `\$` correction → `"\\$"` on disk, round-trips back to `\$`). The yaml→kdl conversion was **round-trip
  verified** (ckdl.parse(emitted) == the YAML dict) before committing — do this for any verbatim-string KDL.
- **Seed kind mapping:** akasha `path` top folder → kind (Divinity→deity, Geography→place,
  Phenomena→phenomenon, Bestiary→creature; **Org/.../People/X→person, Org/X(non-People)→org**).
  **`.../index` pages name their PARENT folder** (display = second-to-last segment). **Rules/Timeline/root
  `index` are skipped** (not nouns). `title` is null → use the path segment. Cross-source unify is by
  **exact fold** (strictest read of "strict seed-dedup") — Ichel's akasha page + defs variants + PC marker
  collapse to one; distinct entities never merge. `resolve()` floor (0.6) is the LOOSE query-time
  threshold, deliberately separate.
- **`resolve()` thresholds** (single source in `astra_ontology.resolve`): `RESOLVE_FLOOR=0.6`,
  `RESOLVE_GAP=0.08`, `RESOLVE_K=5`. Engine is **pure** (in `astra_ontology`); the **telemetry-wired seam**
  is `astra_ontology_entity.resolve()` (deps `astra-observe`; emits `astra.heartwood.resolve` span+counter
  with status/confidence/kind_hint). `Y'shael` is NOT a listed alias — it resolves to Ichel via phonetic
  `nearest()` over the `Y'shell` alias, conf <1.0 (that's the point of the acceptance case).
- **Circular-import trap:** `entity.py`/`resolve.py` are imported BY `astra_ontology/__init__`, so they
  must NOT `from . import faerrin_campaign_slugs` — inline the faerrin filter. The shim
  `astra_ontology_entity/__init__` imports `resolve` **last** (after `load_entities` is defined, since
  `resolve.py` does `from . import load_entities`).
- **`merge_seed` is non-clobbering:** an entity with `source=manual` keeps its hand-set kind/page/being
  through a re-seed (only auto aliases/sources accrue); hand-added entities with no fresh counterpart
  survive. `astra_ontology_entity.seed --check` is the idempotent CI **drift gate** (a pytest test runs it).
- **Pre-existing red lanes surfaced (no-CI-monitoring blind spot):** a 0019 chronicle `ty` regression
  (`show_for_date(...).slug` on `ShowInfo | None`) was reddening `ty check` unnoticed — fixed (`0a51719`).
  S1's required `world` broke akasha-frontend's `campaigns.test.ts` Campaign literals (spec §12 predicted
  it) → add `world` to fixtures (`e0458f9`). **Reproduce the FULL `ty check` + `bun build`, not just
  touched files.**
- **`apps/vellum-render/dist/` can be root-owned** (left by a past VR-golden container run that mounted the
  repo as root; the standing Dockerfile/compose has NO host bind-mount, so it won't recur on its own).
  Blocks `bun --filter '*' build` with EACCES. As uid 1000 you can't unlink root's files (or cross-dir-move
  the dir) — **`docker run --rm -v <path>:/w alpine rm -rf /w/dist`** clears it (root-in-container). It's
  gitignored → never affects CI. **Host-run telemetry can't reach `signoz-otel-collector` → set
  `OTEL_SDK_DISABLED=true`** to silence the retry spam on seed/resolve scripts.

Template = [[chronicle-0019-gotchas]] (per-session asset → committed data → frontend). Builds on
[[config-single-source]] + [[linguist-gate-j-dspy-judge]] (dspy judge stays in linguist; only matchers/
vocabulary lifted) + [[verify-before-acting]] + [[resolve-open-questions-before-next-stage]] +
[[no-ci-monitoring]].

---
name: heartwood-0020-gotchas
description: heartwood (0020) — LLM-maintained akasha setting wiki; Phase 1 DONE + Phase 2 (extraction engine) CODE BUILT, live acceptance re-run PAUSED; locked decisions + verified gotchas
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
(2) **extraction engine** — **CODE BUILT, acceptance re-run PAUSED**; (3) **prose proposer** (the
make-or-break house-voice gate — anti-AI-slop is THE bar); (4) review surface + write-back; (5)
backfill/automation. **Human-gated through Phase 4**; steady-state automation deferred until Phase 3.

**▶ RESUME AT: re-run `astra-heartwood-extract 2026-6-8` (host, SOPS) with the S2.5 taxonomy, verify, have
the stakeholder judge §11, then commit `facts/2026-6-8.json` + close Phase-2 acceptance.** See the Phase-2
section below. Scope `…-phase2-extraction-thoughts.md`, spec `…/0020-heartwood-phase2-extraction-spec.md`.

## Phase 2 — extraction engine: CODE BUILT + PUSHED, live acceptance re-run PAUSED (2026-06-28)

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
- **`astra_llm` crashed on malformed tool-call JSON (shared-lib gap, fixed `98ef460`).** A *successful*
  completion can still carry truncated/garbled JSON in a forced tool call (GLM on large structured outputs);
  `litellm.num_retries` only covers API errors, so `json.loads` raised a raw `JSONDecodeError` that killed
  the whole run (bit the 2nd live run mid-refine). Fix: bounded retry of the completion+parse
  (`_TOOL_JSON_ATTEMPTS=3`) → typed `LlmError`. Helps chronicle/mouthpiece too. To shrink risk, refine
  batches are small (`REFINE_CHUNK_FACTS=20`).
- **World filter = 40 ingested / 3 world-drop / 1 EXCLUDED_DATES** (NOT "41" — the scope/spec first said 41;
  `2025-8-11` sits inside the 33 `through-a-song-darkly` `.txt` and is excluded → 32 main + 8 side = 40).
  `faerrin_session(date)` = `show_for_date` (honors EXCLUDED_DATES) ∩ `faerrin_campaign_slugs`. **Verify
  counts against the live modules, don't trust the doc.** heartwood depends on **`astra-linguist`** (reuse
  its `Transcript` model + `show_for_date`; accepts its dspy/wordfreq transitive weight).
- **P2.1 REVISED the umbrella: PCs ARE wiki-eligible** (umbrella §5 hard-problem #2 / §3a edited). No PC
  special-casing in extraction; the registry's 20 PCs resolve like any noun.
- **Stakeholder forks (this session):** held-out gate = **2026-6-8**; **no citations** in Phase 2 (lean
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
- **Live run mechanics:** host-side `OTEL_SDK_DISABLED=true uv run astra-heartwood-extract <date>`; ~$0.5/run
  over a ~246K transcript (~filter+extract+refine batches); prints on completion only (writes `facts/<date>`
  atomically at the end). `facts/2026-6-8.json` is currently UNtracked + STALE (v4, pre-taxonomy) → the
  re-run regenerates it; commit it then.

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

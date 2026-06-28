---
name: heartwood-0020-gotchas
description: heartwood (0020) — LLM-maintained akasha setting wiki; Phase 1 (ontology infra) BUILT+PUSHED, next is Phase-2 scope; locked decisions + verified gotchas
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
(2) **extraction engine** ← NEXT; (3) **prose proposer** (the make-or-break house-voice gate —
anti-AI-slop is THE bar); (4) review surface + write-back; (5) backfill/automation. **Human-gated through
Phase 4**; steady-state automation deferred until Phase 3 proves the prose.

**▶ RESUME AT: Phase-2 SCOPE.** Phase 2 = first **`heartwood-backend`** app, read-only: filter (drop
OOC/combat/play-by-play via a dedicated keep-when-in-doubt LLM pass → inspectable dropped-span artifact) →
`call_structured` noun-facts → `resolve()` each against the registry → emit structured per-session facts.
NO prose/writes/surface. Resolved open-Qs (umbrella §7): new `heartwood` app (not extend linguist; imports
linguist `surface/` + astra_llm as libs); proposal store = committed **KDL manifest + sibling `.vellum`**;
filter = dedicated LLM pass; extraction = two-stage (structured facts → grounded prose in Phase 3).

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

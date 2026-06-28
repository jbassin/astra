---
name: heartwood-0020-gotchas
description: heartwood (0020) — LLM-maintained akasha setting wiki; scope+Phase-1 spec done, NO code yet; locked decisions + verified gotchas
metadata:
  type: project
---

**heartwood (0020)** — a net-new **multi-phase** subsystem: an LLM (GLM-5.2) reads play-session
transcripts and maintains the akasha **setting wiki** (the "nouns" — people/places/things, NOT
play-by-play; chronicle + Script pages already cover narrative sequence), proposing changes for
**human-gated PR-style review** at a bespoke **`heartwood.iridi.cc`** (vellum-editor base). **As of
2026-06-27: umbrella scope + Phase-1 scope + Phase-1 spec all written + question-free + committed
(`223856d`/`b9a1eeb`); NO implementation started.** Docs: `thoughts/shared/research/2026-06-27-heartwood-0020-thoughts.md`
(umbrella, decisions D1–D10), `…-0020-phase1-registry-thoughts.md` (Phase-1 scope), `thoughts/astra/specs/0020-heartwood-phase1-registry-spec.md`.

**Phase structure (5):** (1) ontology infra — `world` field + typed entity registry; (2) extraction
engine; (3) **prose proposer** (the make-or-break house-voice gate — anti-AI-slop is THE bar);
(4) review surface + write-back; (5) backfill/automation. **Human-gated through Phase 4**; steady-state
automation deferred until Phase 3 proves the prose. **Resume at Phase-1 slice S1.** Slice order: S1 world
/ S2a lexicon-lift / S2b defs→kdl / S3 registry / S4 resolve.

**Locked Phase-1 decisions (P1.1–P1.8):**
- `world: str` **required, free-form** on `Campaign`. Mapping: **faerrin** = through-a-song-darkly,
  a-hunt-of-metal-and-vine, the-first-spark, interred-in-iomenei, fae-and-forest; **finnegan's ring** =
  fey-in-the-mists; **sedecium** = observatory-slipped. heartwood ingests `world=="faerrin"` (5 of 7).
- New shared lib **`astra-lexicon`** (`libs/py/lexicon`) absorbs linguist's `phonetics.py`+`lexicon.py`+
  `corrections.py` AND `defs.yaml→defs.kdl`. It's the shared canonical-names vocabulary (both linguist's
  ASR correction + heartwood's resolution consume it).
- New **`ontology-entity`** KDL registry (pkg `astra-ontology-entity`; models/seed/resolve in
  `libs/py/ontology` extending `astra_ontology`, dep `astra-lexicon`). **Python-only** (no Zod twin/canonical.json).
  kind ∈ person|place|org|deity|phenomenon|creature|item (nullable). `resolve()` returns **rich**
  `{status: resolved|ambiguous|unknown, entity, candidates, confidence}`.

**THE load-bearing gotchas (verified against the repo this session):**
- **akasha corpus is in `apps/akasha-backend/content/`** (121 `.vellum`), NOT the frontend. Hierarchy is
  **100% folder structure**; **filename = page title = crossref target**; crossref resolution is
  **exact-filename-stem only, no fuzzy** — heartwood's registry IS the missing fuzzy entity layer (the
  documented-but-unwired lexicon↔akasha union, the `extra_names` hook in `lexicon.py`).
- **ontology-being is META** (players/PCs/personas), explicitly NOT in-world setting. PCs live there, NOT
  akasha — the registry marks them `being=<slug>` so resolution can boundary-skip them. The `world` field
  is the FIRST setting marker in being.kdl (it was setting-agnostic). **The campaign list is NOT
  exhaustive of played sessions** (the `EXCLUDED_DATES`/"Argyle" false-match proves it) → the faerrin
  filter must **skip session slugs absent from being.kdl**, never crash.
- **`being.canonical.json` has NO regen script** (only parity tests, Py + TS) → hand-regen after the
  `world` edit. Both-schemas rule: TS re-parses `being.kdl` (not the JSON); `canonicalJson()` must stay
  byte-identical. The `world` change touches **6 files** (Pydantic model + Py loader + Zod schema + TS
  loader + being.kdl + canonical.json).
- **linguist's matchers are deep-imports from the APP, not a lib** (`astra_linguist.surface.{phonetics,
  lexicon}` + top-level `corrections`; `surface/__init__` exports nothing). The B-slice lift + `defs.yaml→
  defs.kdl` is **the ONLY change to working code** — linguist's surface/judge/`correction_candidates`/
  goldset tests are the regression gate (no behavior change). Trickiest bit: **`add_correction` writing
  KDL minimal-diff** (verify a Python KDL serializer exists via `astra_config.kdl`, else text-insert).
- **akasha-snapshot.json** (`apps/akasha-backend/snapshot/`) gives the registry seeding what it needs WITHOUT
  a raw-corpus read: per page `path` (path-key) + frontmatter `aliases`. BUT **`title` is almost always
  null → derive the display name from the path's last segment** (as `slug.ts`/`site.ts` do). Body is NOT
  in the snapshot. **`Rules/*` pages are NOT seeded as entities** (mechanical, not nouns).
- **Registry seeding = seed-not-fork + MERGE on re-seed** (never clobber curated kind/page/corrections).
  **Strict seed-dedup threshold** (near-exact, don't merge distinct entities) is SEPARATE from the looser
  query-time `resolve()` floor. **`Y'shael` is NOT in defs.yaml** (only `Y'shell`) → the canonical
  acceptance case `Y'shael→Ichel` works via **phonetic `nearest()`, not an exact alias** — that's the point.
- **uv: don't pre-create `ontology/ontology-entity/` without its manifest** (hard-errors on an empty
  glob-matched member). KDL files aren't touched by biome/ruff (no pre-commit-gate concern).
- **The `linguist-commit` systemd timer auto-commits AND auto-pushes `thoughts/`** (~15 min) — it pushed
  this session's scope commit (`223856d`) to origin before I did; only the spec was left unpushed. Expect
  the timer to carry doc commits.

Template = [[chronicle-0019-gotchas]] (per-session asset → committed data → frontend; the closest prior
art, but chronicle appends to a machine-owned namespace whereas heartwood writes curated lore). Builds on
[[config-single-source]] + [[linguist-gate-j-dspy-judge]] (the dspy judge stays in linguist; only the
matchers/vocabulary lift out) + [[verify-before-acting]] + [[resolve-open-questions-before-next-stage]].

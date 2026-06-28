# 0020 — heartwood Phase 2 (extraction engine, read-only) — NLSpec

- **Status:** **READY TO BUILD** — question-free (built on a question-free scope; forks P2.1/P2.6/P2.7
  resolved with the stakeholder 2026-06-27). Not yet started.
- **Scope doc:** `thoughts/shared/research/2026-06-27-heartwood-0020-phase2-extraction-thoughts.md` (verified)
- **Umbrella scope:** `thoughts/shared/research/2026-06-27-heartwood-0020-thoughts.md`
- **Phase-1 spec (built):** `thoughts/astra/specs/0020-heartwood-phase1-registry-spec.md`
- **Date:** 2026-06-27 · **Subsystem slug:** `heartwood` · **Phase:** 2 of 5

## 1. Overview

Phase 2 is the **first heartwood app code** — a new Python/Dagster app `apps/heartwood-backend`
(pkg `astra-heartwood`). It is **read-only**: it ingests one linguist-corrected transcript and produces a
structured, reviewable **per-session facts artifact**. Pipeline:

```
corrected transcript (apps/linguist/data/<date>.json)
  → world filter   (skip non-faerrin / unmatched / EXCLUDED_DATES)
  → STAGE 1 filter (LLM: drop OOC + combat + play-by-play, keep-when-in-doubt → dropped-span artifact)
  → STAGE 2 extract(LLM call_structured: atomic noun-facts over the kept context)
  → resolve        (pure code: resolve() each fact's subject against the Phase-1 registry)
  → emit           atomic-write apps/heartwood-backend/facts/<date>.json (committed)
```

**No prose, no corpus writes, no review surface, no cross-session accumulation** — those are Phases 3–5.
The phase exists to answer **"are the facts right?"** — correct content kept, wrong content dropped, each
fact attributed to the right entity — cheaply, before any prose or write machinery (D9). Architecture mirrors
chronicle (0019) 1:1; assumes the verified facts + resolved decisions **P2.1–P2.11** in the scope doc.

## 2. Actors / components

- **The maintainer** — runs the extractor host-side for the acceptance gate (chronicle-backfill pattern;
  SOPS resolves on host, `OTEL_SDK_DISABLED=true` silences the unreachable-collector retry spam).
- **heartwood-backend** (new) — the world filter, the two LLM passes, the resolution step, the Dagster asset.
- **astra-linguist** (existing, dependency) — supplies the `Transcript` model + `show_for_date`/`EXCLUDED_DATES`.
- **astra-ontology-entity** (Phase 1, dependency) — `resolve()` / `load_entities()` (the resolution seam).
- **astra-llm** (existing) — `LiteLLMClient` (`call_structured`, GLM-5.2, cost telemetry, `ensure_openrouter_env`).
- **The Dagster code location** (`dagster/definitions.py`) — gains the heartwood asset import.

## 3. The app — layout, package, deps (P2.11)

New uv member `apps/heartwood-backend/` (auto-claimed by the root `apps/*` glob; **create the dir only with
its `pyproject.toml`** — uv hard-errors on a manifest-less member dir).

```
apps/heartwood-backend/
  pyproject.toml                 # package astra-heartwood; deps below
  src/astra_heartwood/
    __init__.py
    models.py                    # NounFact, DroppedSpan, ResolvedFact, SessionFacts (§5)
    sessions.py                  # faerrin_session() world filter + transcript load (§4)
    prompts.py                   # FILTER_SYSTEM, EXTRACT_SYSTEM (static, cacheable prefixes)
    filter.py                    # Stage 1: window segmentation + keep/drop classification (§6)
    extract.py                   # Stage 2: call_structured noun-fact extraction (§7)
    resolve_facts.py             # resolution loop → ResolvedFact (§8)
    pipeline.py                  # orchestrate filter→extract→resolve→SessionFacts; host-runnable main() (§9)
    assets.py                    # session_noun_facts Dagster asset + dg.Definitions (§9)
  facts/                         # committed per-session output <date>.json (ships with a .gitkeep)
  tests/                         # unit tests (world filter, schema round-trip, parsing, segmentation)
```

`pyproject.toml` deps: `astra-config`, `astra-llm`, `astra-observe`, `astra-ontology`, `astra-ontology-being`,
`astra-ontology-entity`, `astra-linguist`, `dagster`, `pydantic>=2`. `[tool.uv.sources]` marks each
`astra-*` as `workspace = true`. The root `pyproject.toml` must **exclude** `apps/heartwood-backend` from any
relevant build aggregation exactly as the sibling apps are handled (mirror mouthpiece-backend).

> **Cross-app dependency note (accepted):** depending on `astra-linguist` pulls its transitive
> `dagster`/`dspy[optuna]`/`wordfreq`. Acceptable — heartwood is itself a Dagster app. Reuse beats
> reinventing the `Transcript` model + `show_for_date`. If the coupling bites later, lift a tiny
> transcript+session-resolution lib; **not** in Phase 2.

## 4. The world filter + transcript load (P2.2 / P2.3)

`sessions.py`:
```python
def faerrin_session(date: str, *, being: Being | None = None) -> str | None:
    """The campaign slug iff `date` is an ingestible faerrin-world session, else None.
       Composes chronicle's session→show resolution with Phase-1's world set."""
    show = show_for_date(date)                 # honors EXCLUDED_DATES; None if unmatched/excluded
    if show is None:
        return None
    being = being or load_being(BEING_KDL_PATH)
    return show.slug if show.slug in faerrin_campaign_slugs(being) else None

def load_corrected_transcript(date: str) -> Transcript:
    """Parse apps/linguist/data/<date>.json into astra_linguist's Transcript model."""
```
- `show_for_date`, `EXCLUDED_DATES`, `Transcript` import from `astra_linguist` (chronicle.py / models.py).
- `faerrin_campaign_slugs`, `load_being`/`BEING_KDL_PATH` from `astra_ontology` / `astra_ontology_being`.
- **Verified split (the unit-test fixture):** 41 faerrin sessions kept (33 `through-a-song-darkly` + 8 side:
  3 `a-hunt-of-metal-and-vine`, 3 `fae-and-forest`, 1 `the-first-spark`, 1 `interred-in-iomenei`); **3
  dropped by world** (2 `observatory-slipped`/sedecium, 1 `fey-in-the-mists`/finnegan's-ring); `2025-8-11`
  dropped by `EXCLUDED_DATES`. An unmatched/unknown slug returns None — **never crashes** (Phase-1 §3.3 note).

## 5. The artifact schemas (`models.py`)

Pydantic v2, `extra=forbid`. `EntityKind` / `ResolveStatus` / `EntityRef` are **imported** from
`astra_ontology` (single source — do not redeclare).

```python
class DroppedSpan(BaseModel):
    category: Literal["ooc", "combat", "play_by_play"]
    sample: str            # a short verbatim excerpt of the dropped span (audit trail; NO line citation, P2.6)
    reason: str            # one-line why-dropped, from the filter

class NounFact(BaseModel):                       # Stage-2 LLM output (pre-resolution)
    subject: str           # the noun as it appears in the kept text
    kind_hint: EntityKind | None = None          # person/place/org/deity/phenomenon/creature/item, if inferable
    claim: str             # ONE durable assertion about the subject; plain structured prose (NOT wiki voice)

class ResolvedFact(BaseModel):                   # a NounFact + its registry resolution
    subject: str
    kind_hint: EntityKind | None
    claim: str
    status: ResolveStatus                         # "resolved" | "ambiguous" | "unknown"
    entity: EntityRef | None                      # set iff status=="resolved"
    confidence: float
    candidates: list[tuple[str, float]] = []      # (canonical, score) top-K for ambiguous/unknown context

class SessionFacts(BaseModel):                    # the committed per-session artifact
    date: str
    show: str                                     # campaign slug
    world: str                                    # "faerrin"
    facts: list[ResolvedFact]
    dropped: list[DroppedSpan]
```

- **Atomic claims (P2.8):** one `claim` = one assertion. Polished wiki prose is **Phase 3** — Stage 2 emits
  plain factual statements, not house-voice.
- **No citations (P2.6):** `DroppedSpan.sample` is an audit excerpt, not a transcript line-range. Facts carry
  no provenance pointer. Deferred.
- A **round-trip test** (model → `model_dump_json` → re-parse → equal) gates the schema.

## 6. Stage 1 — the filter pass (P2.4 / P2.5)

A **dedicated** LLM classification over the session, **keep-when-in-doubt**, emitting the dropped-span audit.

**Segmentation (`filter.py`):** pre-split `transcript.script` into contiguous **windows** of scene size
(constant `FILTER_WINDOW_TURNS ≈ 20–30` turns, or a word budget — spec-tunable), each rendered as
`"Speaker: text"` lines and assigned a 1-based `window_id`. Windows are scene-sized so the model has context
and the dropped artifact stays human-legible (a lone "Right." can't be judged — P2.5).

**Classification:** one `call_structured` (or `call_tool`) returns, per window, a compact decision —
**no echoed text** (chronicle's "compact boundaries, not lists" truncation lesson):
```
WindowVerdict: { window_id: int, decision: "keep" | "drop", category: "in_world"|"ooc"|"combat"|"play_by_play", reason: str }
```
- **Drop:** OOC table-talk (scheduling, tech issues, snack/rules/dice lookups, real-life chatter, meta jokes)
  + **combat blow-by-blow / play-by-play narrative sequence**.
- **Keep:** any window asserting/revealing something durable about a noun — **including a noun revealed *in*
  combat** (keep the window for the noun; the round-by-round is dropped as a side effect of not extracting it).
- **Bias = keep-when-in-doubt.** A false *drop* of a real noun is the dangerous, invisible failure.

**Outputs:** kept windows → concatenated **kept context** (input to Stage 2); dropped windows →
`list[DroppedSpan]` (category + a representative `sample` line + `reason`). **Prompt** ports faerrin caster
`pkg/caster/src/distill/prompt.ts`'s OOC-discard instruction, **adds combat exclusion (D7)** and the
keep-the-noun nuance, and **drops** the recap-flavored beat fields (significance/tone/tableAngle — mouthpiece's
job). System prompt is static/cacheable (no per-session interpolation).

**Large-session chunking:** if the window set exceeds a budget, classify in chunks (mouthpiece
`_split_transcript` precedent) and concatenate the verdicts — `window_id`s stay globally unique.

## 7. Stage 2 — the noun-fact extractor (P2.8 / P2.9)

`extract.py`: `call_structured(SessionNounFacts, system=EXTRACT_SYSTEM, user_content=<kept context>, …)`
where `SessionNounFacts` is `{ facts: list[NounFact] }` (forced-tool, `tool_name="record_noun_facts"`).

- **Grounding contract (mouthpiece-style):** assert only what the transcript supports; **never invent**
  events, outcomes, or lore; use names as they appear. Extract durable *setting* facts about nouns
  (people/places/orgs/deities/phenomena/creatures/items), **not** narrative sequence.
- **PCs are in scope (P2.1):** facts about player characters are extracted like any noun — no PC special-casing,
  no drop, no boundary tag. (The registry already holds the 20 PCs; resolution links them.)
- **Chunking fallback:** if the kept context is large, extract per-chunk (`EXTRACT_CHUNK_WORDS`, mouthpiece
  precedent) and concatenate the fact lists. (Intra-session dedup is a nice-to-have, not required — §11.)
- `model = load_config().llm.default_model` (config-single-source; GLM-5.2; **pricing row already exists** so
  SigNoz cost ≠ $0). `ensure_openrouter_env()` before any call.

## 8. Resolution (pure code — `resolve_facts.py`)

For each `NounFact`: `res = resolve(fact.subject, kind_hint=fact.kind_hint)` (the telemetry-wired seam
`from astra_ontology_entity import resolve`) → build a `ResolvedFact`:
- `status="resolved"` → `entity = res.entity` (its `page` ⇒ update-candidate; `page is None` ⇒ new-page
  candidate; `being` set ⇒ a PC — still a valid target, P2.1), `confidence = res.confidence`.
- `status in {"ambiguous","unknown"}` → `entity=None`; carry `candidates = [(e.canonical, s) for e,s in res.candidates]`
  for the human. A genuinely **new** entity surfaces as `unknown` — Phase 2 **only flags** it (registry
  *additions* are proposed in Phase 3, applied on approval in Phase 4; **discovery is out of scope here**).
- **The `Y'shael → Ichel` acceptance case** runs through here unchanged (phonetic `nearest()` over the
  `Y'shell` alias; `resolved`, confidence < 1.0).

## 9. The Dagster asset + host pipeline (P2.10)

`pipeline.py` — a pure orchestration `build_session_facts(date, *, client=None, model=None) -> SessionFacts | None`
(returns None when `faerrin_session(date) is None`), plus a host-runnable `main()` (argv `<date>`) for the
acceptance gate. Mirrors chronicle's `build_episode_entry`.

`assets.py` — `session_noun_facts`, a **per-session partitioned** asset mirroring chronicle's
`session_episode_summary` (`apps/linguist/src/astra_linguist/assets.py:149`):
```python
@dg.asset(partitions_def=heartwood_sessions, group_name="heartwood")
def session_noun_facts(context) -> dg.MaterializeResult:
    date = context.partition_key
    facts = build_session_facts(date)
    if facts is None:
        return dg.MaterializeResult(metadata={"status": "skipped (non-faerrin/unmatched)"})
    _atomic_write(FACTS_DIR / f"{date}.json", facts.model_dump_json(indent=2))
    return dg.MaterializeResult(metadata={"facts": len(facts.facts), "dropped": len(facts.dropped), ...})
```
- **Partitions:** define a heartwood-local `heartwood_sessions` dynamic partitions def (do **not** re-register
  linguist's `linguist_sessions` from another code location — avoids cross-location coupling). Phase 2 adds
  the partition + materializes host-side; the **sensor/schedule auto-wiring is Phase 5** (out of scope).
- **Definitions:** a `dg.Definitions(assets=[session_noun_facts])` in `astra_heartwood.assets`, **imported into
  `dagster/definitions.py`** alongside the existing app imports (akasha/linguist/mouthpiece/scribe). The
  import must not break the existing graph.
- **No aggregate asset, no `inputs_hash` gate** (chronicle's are for cross-session grouping — Phase 2 is
  per-session only).
- Paths are code constants (`FACTS_DIR = …/apps/heartwood-backend/facts`), per the chronicle precedent (no
  config namespace in Phase 2).

## 10. Telemetry (from day one — `telemetry-built-in`)

- `init_telemetry("astra.heartwood")` in the asset/pipeline runtime (the bar is *wiring* it, not importing observe).
- Spans: `astra.heartwood.filter` (attrs: windows_total, windows_kept, windows_dropped) and
  `astra.heartwood.extract` (attrs: facts_extracted, chunks). `astra.heartwood.resolve` already fires from the
  Phase-1 seam (status/confidence/kind_hint).
- Metrics: `astra.heartwood.facts_extracted{status,kind}`, `astra.heartwood.spans_dropped{category}`.
- LLM cost/latency auto-emit via `LiteLLMClient` → SigNoz. **Host-run telemetry can't reach the in-cluster
  collector** → `OTEL_SDK_DISABLED=true` for the host acceptance run (non-blocking; spans land under the
  Dagster runtime).

## 11. Acceptance criteria (Phase-2 gate — judged on held-out `2026-6-8`, P2.7)

Develop the filter/extractor on **other** faerrin sessions; reserve **2026-6-8** as the blind gate. Run the
pipeline host-side on it and have the stakeholder judge:

1. **Filter correctness** — OOC and combat/play-by-play are dropped; nouns *revealed in combat* are kept.
   Verifiable from the `dropped` artifact (nothing setting-relevant in it) + the kept facts.
2. **Fact correctness & completeness** — facts are true to the session, durable setting nouns (not narrative
   sequence), and **not hallucinated** (grounding contract holds).
3. **Attribution** — each fact resolves to the **right** entity; **`Y'shael → Ichel` resolves correctly**;
   ambiguous/unknown are sensibly flagged (carrying candidates), not silently mis-linked.
4. **World filter** — a non-faerrin date (e.g. an `observatory-slipped` session) is correctly **skipped**
   (asset reports `skipped`, writes nothing); the 41/3 split unit test is green.
5. **Mechanics** — `apps/heartwood-backend` is a clean uv member; `session_noun_facts` is wired into the
   Dagster code location without breaking the existing graph; **both CI lanes green locally before push**
   (Python lane: `ruff check && ruff format --check && ty check && pytest`; scope to the touched lane).

The gate is the GM's qualitative read — **no objective metric** (prose's metric-less gate is Phase 3's
problem, deliberately separated). No prose, writes, or surface are in scope or judged.

## 12. Slice plan (each independently CI-green; commit per slice, push on completion)

- **S1 — scaffold + world filter.** `apps/heartwood-backend` skeleton + `astra-heartwood` manifest + deps;
  `sessions.py` (`faerrin_session` + transcript load); the **41-keep / 3-world-drop / `2025-8-11`-drop**
  unit test. **No LLM.** (uv member resolves; `ty`/`ruff`/`pytest` green.)
- **S2 — Stage 1 filter.** `prompts.py` FILTER_SYSTEM (port caster distill + combat + keep-when-in-doubt),
  window segmentation, `WindowVerdict` classify, `DroppedSpan` assembly, chunking fallback. Tested on a **dev**
  session (mock/stub client for the unit test; live behavior verified manually).
- **S3 — Stage 2 extractor.** `models.py` schemas + round-trip test; `extract.py` (`call_structured` +
  grounding + chunking). Tested on a dev session.
- **S4 — resolution + emit + asset.** `resolve_facts.py` (wire `resolve()` per fact); `pipeline.py`
  (`build_session_facts` + host `main`); `assets.py` (`session_noun_facts` + `heartwood_sessions` + Definitions)
  + the `dagster/definitions.py` import; atomic-write `facts/<date>.json`.
- **S5 — telemetry + the acceptance run.** Domain spans/metrics (§10); host-side run on **2026-6-8**;
  stakeholder judgment against §11; verify the code-location import + Dockerfile `COPY apps/heartwood-backend`
  don't break the dagster-code build.

## 13. Out of scope (later phases)

Prose generation/merge (Phase 3), the voice guide (Phase 3), change-sets / KDL proposal manifests (Phase 3),
the `heartwood.iridi.cc` review surface + write-back (Phase 4), corpus writes / akasha snapshot regen / commit
/ redeploy (Phase 4), **cross-session accumulation & dedup** (Phase 3/5), **new-entity discovery / registry
additions** (proposed Phase 3, applied Phase 4), **transcript citations / provenance** (P2.6, deferred),
**sensor/schedule automation** (Phase 5), the **backfill over all 41 faerrin sessions** (Phase 5), a `heartwood`
**config namespace** + **frontend** (Phase 4), a per-entity `world` field, page placement/naming (Phase 3).

## 14. Risks / notes

- **Filter false-drop is the load-bearing risk** — a real noun silently excluded. Mitigations: keep-when-in-doubt
  + the human-reviewable `dropped` artifact (the acceptance gate inspects it). Combat is the trap (drop the
  blow-by-blow, keep the noun); the prompt must make the distinction explicit.
- **LLM non-determinism → no drift gate on `facts/*.json`.** Unlike a deterministic seed, the artifact content
  varies run-to-run (like chronicle's committed episode summaries, which are also un-drift-gated). **Do not add
  a CI diff gate on `facts/` content** — only structural/schema tests.
- **Large transcripts** (2026-6-18 is ~290K) → the filter + extractor must chunk (mouthpiece `_split_transcript`
  precedent + `REQUEST_TIMEOUT_S=300` already in `astra_llm`). Verify the held-out 2026-6-8 (~246K) completes.
- **Resolve false-link** is *more* damaging than clumsy facts → ambiguous/unknown are flagged with candidates,
  never force-linked. The acceptance gate checks attribution explicitly.
- **The linguist-commit timer (~15 min) broad-`git add`s untracked source + commits + PUSHes** → it will grab
  new `apps/heartwood-backend` files and/or `facts/*.json` mid-session under a generic message; **fetch+rebase
  before pushing** (`heartwood-0020-gotchas`).
- **Partitions-def cross-location coupling** — define `heartwood_sessions` locally; don't re-register
  `linguist_sessions` from a second code location.
- **`astra-linguist` transitive deps** (dspy/wordfreq/dagster) ride along — accepted (§3); CI never runs the
  dspy judge live.

## 15. Adversarial completeness pass

Gaps a second look should catch:
- **Combat that reveals a noun** — the filter's `keep` rule must override the `combat` category when a durable
  noun fact is present; the prompt states this, and S2's dev test should include a combat-reveal case.
- **A noun mentioned only out-of-character** (a player narrates lore as themselves) → keep-when-in-doubt leans
  keep; acceptable (the human reviews). Worth a prompt line.
- **A session with zero new nouns** → a valid **empty** `facts` list (and possibly non-empty `dropped`); not an
  error. The asset still writes the file.
- **A genuinely new entity** (not in the 311) → `unknown`, carrying candidates; **never** force-linked to a
  near-neighbor. (Discovery/registry-add is out of scope — only flagged.)
- **PC/NPC same-name collision** — resolution returns whichever entity the registry holds; since PCs are now
  valid targets (P2.1), no special drop. If the registry has two distinct same-name entities, `ambiguous` fires
  → flagged. Correct.
- **Intra-session duplicate facts** (same claim twice) — Phase 2 may emit duplicates; intra-session dedup is a
  nice-to-have, **cross-session** dedup is explicitly Phase 3/5. Noted, not gated.
- **Non-ASCII / apostrophe subjects** (`Y'shael`, `Anaïs`) → the lexicon already folds Unicode; resolution
  handles them (Phase-1 verified).
- **The asset import breaks the existing Dagster graph** (a bad import / missing dep) → S4/S5 verify the code
  location loads and the `dagster-code` image builds with the new COPY.
- **`world` filter on a side-campaign** (`a-hunt-of-metal-and-vine`, only 3 sessions) → kept (faerrin); the
  unit test covers all 5 faerrin slugs + the 2 non-faerrin, not just the main show.
- **Empty/te­chnical transcript** (a near-empty session) → filter drops all windows, extractor sees empty kept
  context → empty facts; no crash. Guard the empty-context path.

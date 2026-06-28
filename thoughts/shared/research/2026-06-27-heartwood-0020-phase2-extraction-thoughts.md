---
date: 2026-06-27
subsystem: heartwood
slot: "0020"
phase: 2
kind: scope (per-phase)
status: scoping — decisions P2.1–P2.11 settled; question-free; ready for octo:spec
author: Claude (Opus 4.8) + Josh
umbrella: thoughts/shared/research/2026-06-27-heartwood-0020-thoughts.md
builds_on: thoughts/shared/research/2026-06-27-heartwood-0020-phase1-registry-thoughts.md
---

# heartwood (0020) — Phase 2 scope: the extraction engine (read-only)

Phase 2 is the **first heartwood app code** — a new Python/Dagster app, `apps/heartwood-backend`
(pkg `astra-heartwood`). It is **read-only**: it ingests one play-session transcript, **filters** out
the non-setting content (OOC / combat / play-by-play), **extracts durable noun-facts**, **resolves**
each fact's subject against the Phase-1 entity registry, and **emits a structured per-session facts
artifact**. **No prose, no corpus writes, no review surface** — those are Phases 3–4.

The whole point of isolating this phase: answer **"are the facts right?"** (correct content kept, wrong
content dropped, each fact attributed to the right entity) **before** spending any effort on the
make-or-break prose (Phase 3) or the write/review machinery (Phase 4). Per D9 in the umbrella.

This doc is **question-free** — the three open design forks were resolved with the stakeholder this
session (P2.1, P2.6, P2.7 below); everything else is settled by porting faerrin's proven shapes and the
chronicle template. Next gate: the NLSpec via `octo:spec`.

---

## 1. Decisions settled (load-bearing)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| **P2.1** | **PC boundary** — do player characters get wiki pages? | **YES — PCs are ordinary wiki-eligible nouns.** No PC special-casing in extraction. | **Stakeholder decision this session — this REVISES the umbrella** (§3a / §5 hard-problem #2 said "skip PCs — boundary"). The deliberate decision the umbrella deferred is now made: the wiki documents the setting's people *including* the PCs. The registry already holds the 20 faerrin PCs as entities (`being` ref set); a PC-resolved fact is just a normal fact. (The being.kdl↔akasha duplication is a Phase-3/4 merge concern, not Phase 2.) |
| **P2.2** | **Input** | The **linguist-corrected** transcript JSON, `apps/linguist/data/<date>.json` (astra_linguist `Transcript` model). | Known ASR garbles already rewritten (`Y'shell`→… corrections applied at linguist ingest); heartwood does residual fuzzy work only. Confirmed live. |
| **P2.3** | **World filter** | Ingest only `world == "faerrin"` campaigns. Resolve session date → campaign slug via the committed transcript filename prefix (`show_for_date`), keep iff the slug ∈ `faerrin_campaign_slugs(being)`. Honor `EXCLUDED_DATES`. | D10. Demonstrably drops the 3 non-faerrin sessions (2× sedecium `observatory-slipped`, 1× finnegan's-ring `fey-in-the-mists`) + the mislabeled `2025-8-11`. Composes Phase-1's `faerrin_campaign_slugs` with chronicle's session→show resolution — no new matching logic. |
| **P2.4** | **Filter = dedicated LLM pass** | A standalone **keep-when-in-doubt** classification pass over the transcript that drops OOC + combat + play-by-play and **emits an inspectable dropped-span artifact**. Extraction runs on the *kept* context. | Umbrella §7 resolved. Single-job calls beat inline; the dangerous failure mode (invisible false-exclusion of a real noun) becomes reviewable. Ports faerrin caster `distill`'s OOC-filter prompt + its `discarded` samples, **extended with combat exclusion (D7)** and the keep-the-noun-drop-the-blow-by-blow nuance. |
| **P2.5** | **Filter unit = contiguous spans, not turns** | The filter classifies **contiguous scene-spans** (runs of turns), not individual `FormattedLine`s. | A single turn ("Right.") can't be judged in isolation; OOC and combat are *spans*. Spans give the model enough context to make the keep/drop call and keep the dropped-span artifact human-legible. |
| **P2.6** | **No citations in Phase 2** | A fact is lean: **`(subject entity, claim, kind)`** — no transcript line-range / quote provenance. | **Stakeholder decision this session.** The acceptance gate is the GM judging a session they know; citations aren't needed to judge correctness. Provenance (faerrin's `.heartwood/provenance` line-range model) is deferred to a later phase if Phase 3/4 grounding needs it. Keeps the schema and the build lean. |
| **P2.7** | **Held-out acceptance session** | **`2026-6-8`** (main campaign `through-a-song-darkly`). | **Stakeholder choice.** Recent, noun-rich (~246K), and contains the **Ichel / Y'shael** pair → exercises the fuzzy resolver's headline case. Filter+extractor are developed on *other* faerrin sessions; 2026-6-8 is the blind gate. |
| **P2.8** | **Fact granularity = atomic structured claims** | One fact = one durable assertion about one subject noun. Plain structured assertion text (NOT polished wiki prose — that's Phase 3). | Mirrors faerrin's `.heartwood/provenance` claim-record concept (one `claimId` per assertion) without the prose `norm`. Atomic claims are what drive entity-linking, dedup, and review downstream. The umbrella's "no separate fact-KB; page prose stays SSOT" still holds — these are a **per-session intermediate**, not a persistent KB. |
| **P2.9** | **Two-stage call: filter → extract** | Stage 1 = filter pass (kept-spans + dropped-span artifact). Stage 2 = `call_structured` noun-fact extraction over the kept spans. Then a pure-code resolution step over the extracted facts. | Umbrella §7 (two-stage). `call_structured` per the chronicle precedent; **raw, no dspy** (no labels yet — revisit only if quality demands + labels are worth authoring). Whole kept-transcript in one call if it fits; mouthpiece's `_split_transcript` is the chunking fallback for large inputs. |
| **P2.10** | **Output = committed JSON, per session** | `apps/heartwood-backend/facts/<date>.json` (one file per session), committed. **No aggregate asset** in Phase 2. | Mirrors chronicle's `apps/linguist/timeline/episodes/<date>.json`. Committed → the acceptance review is "read the file"; Phase 3 reads it. Cross-session accumulation/dedup is explicitly a **later phase** (Phase 3/5) — Phase 2 is per-session only. |
| **P2.11** | **Home + deps** | New uv member `apps/heartwood-backend` (pkg `astra-heartwood`). Depends on `astra-linguist` (Transcript model + `show_for_date`/`EXCLUDED_DATES`), `astra-ontology-entity` (`resolve`/`load_entities`), `astra-ontology` (`faerrin_campaign_slugs`, `Resolution`), `astra-ontology-being`, `astra-llm`, `astra-config`, `astra-observe`, `dagster`, `pydantic`. | One-subsystem-per-app (umbrella §7 resolved). Reuse-don't-reinvent: `astra-linguist` is a dependable workspace member; its dagster/dspy/wordfreq transitive weight is acceptable (heartwood is itself a Dagster app). Spec may lift a tiny shared lib if the coupling bites, but default is direct dependency. |

**No open questions.** (The umbrella's §7 forks were all resolved there; the three Phase-2-specific forks
are P2.1/P2.6/P2.7 above.)

---

## 2. Verified research (ground truth, checked live this session)

### 2a. The input — linguist-corrected transcript
`apps/linguist/src/astra_linguist/models.py:39` — `Transcript(date: str, audio: str, script: list[FormattedLine])`.
`FormattedLine(start: str "HH:MM:SS", second: float, text: str, user: Speaker, duration: float)`;
`Speaker(name: str, color: str)`. Real example `apps/linguist/data/2025-2-3.json` confirms the shape.
**81 corrected sessions on disk**; the chronicle render of a transcript into `"Speaker: text"` lines
(`episode_user_content`) is the user-content precedent for the LLM calls.

### 2b. The template — chronicle (0019)
- **Per-session partitioned asset** `session_episode_summary` (`apps/linguist/src/astra_linguist/assets.py:149`):
  `partitions_def=linguist_sessions`, keyed on `context.partition_key` (date); `show_for_date(date) is None`
  → skip; `load_session(DATA_DIR/f"{date}.json")`; GLM via `build_episode_entry → summarize_episode →
  client.call_structured(EpisodeSummary, …)` (`chronicle_llm.py:96`); atomic-write JSON per session.
- **Aggregate** `campaign_timeline` (`assets.py:191`) with the **`inputs_hash` skip-when-unchanged** gate
  (`chronicle_inputs_hash`, SHA256 of the per-episode tuple). *Heartwood Phase 2 has no aggregate (P2.10).*
- **Wiring** (`assets.py:301`): assets + `scribe_output_sensor` + hourly `campaign_timeline_schedule` in a
  `dg.Definitions`. The root `dagster/definitions.py` imports each app's assets directly (akasha, linguist,
  mouthpiece, scribe) — **heartwood adds its asset import there**.
- **Telemetry is free** via `LiteLLMClient` (cost/latency → SigNoz); add domain metrics per asset.

### 2c. Session ↔ campaign matching + the world filter
- `show_for_date(date) → ShowInfo | None` (`chronicle.py:166`): honors `EXCLUDED_DATES` (`{"2025-8-11"}`,
  `chronicle.py:34`), globs `*.{date}.txt`, extracts the campaign slug from the filename prefix
  (`000.<slug>.<date>.txt`).
- `match_campaign(transcript, campaigns, threshold=15)` (`campaigns.py:73`): substring-hit scoring of
  character names; first campaign ≥15 hits wins. (Used to *assign* slugs at ingest; heartwood reads the
  already-assigned committed filename.)
- **World filter = compose:** Phase-1's `faerrin_campaign_slugs(being)` (the 5 faerrin slugs) ∩ the slug
  from `show_for_date`. **Verified:** faerrin-world = 33 main + 8 side = **41 sessions**; excluded by world
  = **3** (2× `observatory-slipped`/sedecium, 1× `fey-in-the-mists`/finnegan's-ring); + `2025-8-11`.

### 2d. The resolution API (Phase 1 — the integration contract)
`from astra_ontology_entity import resolve, load_entities, reload_registry`
- `resolve(name: str, *, kind_hint: EntityKind | None = None) → Resolution`
- `Resolution(status: "resolved"|"ambiguous"|"unknown", entity: EntityRef|None, candidates: list[tuple[EntityRef, float]], confidence: float)`
- `EntityRef(canonical, kind, page, being)` — `page` is the akasha path-key (None ⇒ no page yet ⇒ a
  **new-page candidate**); `being` set ⇒ a PC (now a valid target, P2.1).
- Thresholds in `astra_ontology.resolve`: `RESOLVE_FLOOR=0.6`, `RESOLVE_GAP=0.08`, `RESOLVE_K=5`.
- `load_entities() → list[Entity]` parses the committed `entity.kdl` (**311 entities**; person 54 / org 34
  / deity 17 / place 26 / phenomenon 6 / 174 unclassified; 117 page-linked; 20 PC-marked).
- `resolve()` emits the `astra.heartwood.resolve` span/metric automatically.

### 2e. faerrin precedent (port, don't reinvent)
- **Filter:** faerrin caster `pkg/caster/src/distill/{prompt,schema}.ts` — a static OOC-filter system prompt
  ("aggressively discard table talk … scheduling, technical issues, snack breaks, dice/rules lookups, meta
  jokes") that emits `beats` + a `discarded` samples array + per-beat `wikiRefs` (proper nouns to ground
  later). **Port the OOC-filter + `discarded` idea; ADD combat exclusion (D7)**; drop the recap-flavored
  beat fields (significance/tone/tableAngle — that's mouthpiece's job, already done).
- **Fact/claim schema:** faerrin `pkg/content/.heartwood/provenance/*.prov.json` (the name's origin) — a
  proven claim model: `records[]` of `{ anchor:{norm, normHash, headingPath, ordinal}, session:{arc,date},
  citations:[{transcript,start,end}], claimId, entityIds, approvedAt }`. **No generator code exists** (the
  files are hand/externally produced) → the extractor is genuinely net-new. Phase 2 ports the *atomic-claim*
  concept (P2.8) but **not** the prose `norm` (Phase 3) and **not** the citations (P2.6, deferred).

---

## 3. The net-new artifacts (the real engineering)

### 3a. Stage 1 — the filter pass
A dedicated `call_structured` (or `call_tool`) pass over the session, classifying contiguous spans:
- **Keep:** in-world content that reveals or asserts something durable about a noun (a person, place,
  org, deity, phenomenon, creature, item).
- **Drop:** OOC table-talk, rules/dice lookups, scheduling/tech chatter, and **combat blow-by-blow /
  play-by-play narrative sequence** — *but keep the noun a combat scene reveals* (a monster exists, a
  place is named) while dropping the round-by-round.
- **Bias: keep-when-in-doubt.** False-drop of a real noun is the dangerous, invisible failure → the
  output includes a **dropped-span artifact** (verbatim samples + a one-line reason per dropped span) so
  the human can sanity-check what was excluded (faerrin's `discarded`, made first-class).

### 3b. Stage 2 — the noun-fact extractor
`call_structured` over the kept spans → a list of atomic facts. Proposed Pydantic shape (spec finalizes):
```
NounFact:
  subject: str          # the noun as it appears in the kept text (pre-resolution)
  kind_hint: EntityKind | None   # person/place/org/deity/phenomenon/creature/item, if inferable
  claim: str            # one durable assertion about the subject, plain structured prose (NOT wiki voice)
SessionFacts:
  date: str
  show: str             # campaign slug
  facts: list[NounFact]         # post-resolution each carries its Resolution (see 3c)
  dropped: list[DroppedSpan]    # the filter's audit trail
```
Grounding contract (mouthpiece-style): assert only what the transcript supports; never invent
events/outcomes/lore. No prose polish here.

### 3c. Resolution step (pure code)
For each `NounFact`, call `resolve(subject, kind_hint=kind_hint)`; attach the `Resolution`
(status + `EntityRef` + confidence). The emitted fact records:
- `resolved` → the matched entity (its `page` ⇒ update-candidate; `page is None` ⇒ new-page candidate;
  `being` set ⇒ PC, still a valid target per P2.1);
- `ambiguous` / `unknown` → flagged for the human, carrying the top-K candidates for context. (A genuinely
  new entity surfaces here as `unknown` — registry *additions* are proposed in Phase 3 and applied on
  approval in Phase 4; Phase 2 only flags.)

---

## 4. Architecture & wiring

- **App:** `apps/heartwood-backend/` (pkg `astra-heartwood`, `src/astra_heartwood/`), uv member (root
  pyproject globs `apps/*`). Manifest = its own `pyproject.toml` (P2.11 deps).
- **Asset:** `session_noun_facts` — per-session partitioned (`partitions_def` reusing the linguist session
  partitions or a heartwood-local mirror; spec decides), `deps` on the corrected transcript. Skip if
  `show_for_date(date)` is None OR its slug ∉ faerrin slugs. Filter → extract → resolve → atomic-write
  `facts/<date>.json`. Mirrors `session_episode_summary` 1:1 in shape.
- **Definitions:** a `dg.Definitions` in `astra_heartwood.assets`; **import it into `dagster/definitions.py`**
  (new code-location member). Sensor/schedule wiring is **deferred to Phase 5** (automation) — Phase 2 runs
  the asset **host-side** for the acceptance gate (chronicle-backfill pattern: SOPS resolves on host,
  `OTEL_SDK_DISABLED=true` to silence the host-can't-reach-collector retry spam, per the gotchas memory).
- **Telemetry from day one:** `init_telemetry` in the asset's runtime; `resolve()` already emits its span;
  add `astra.heartwood.extract` span + counters (facts kept, spans dropped, resolve-status histogram). LLM
  cost auto-emits — **GLM 5.2 pricing row already exists**, so cost ≠ $0.
- **Config:** model via `load_config().llm.default_model` (config-single-source; no hardcoded model). Paths
  are code constants (chronicle precedent — `TIMELINE_DIR` is not in config). **No `heartwood` config
  namespace needed in Phase 2** (no port/frontend; that arrives in Phase 4).
- **Deploy ripple (minimal):** the dagster-code image must `COPY apps/heartwood-backend` once the asset is
  wired into the code location (so the location loads). Phase 2's acceptance run is host-side, so no live
  redeploy is required to pass the gate — but the code-location import must not break the existing graph.

---

## 5. Acceptance gate (judged on held-out `2026-6-8`)

Run the extractor host-side on `2026-6-8` and have the stakeholder judge:
1. **Filter correctness** — OOC and combat/play-by-play are dropped; nouns *revealed in combat* are kept.
   Checked via the `dropped` artifact (nothing setting-relevant in it) + the kept facts.
2. **Fact correctness & completeness** — the facts are true to the session, durable (setting nouns, not
   narrative sequence), and not hallucinated.
3. **Attribution** — each fact is resolved to the **right** entity (esp. the `Y'shael → Ichel` case);
   ambiguous/unknown are sensibly flagged, not silently mis-linked.
4. **World filter** — a spot-check that a non-faerrin session (e.g. an `observatory-slipped` date) is
   correctly skipped.

No prose, no writes, no surface are in scope or judged. The gate is the GM's qualitative read (no metric;
prose's objective-less gate is Phase 3's problem, deliberately separated).

---

## 6. Proposed slice plan (spec refines)

1. **S1 — app scaffold + deps + world-filtered session selection.** `apps/heartwood-backend` skeleton, the
   `astra-heartwood` manifest, the world filter (`faerrin_campaign_slugs` ∩ `show_for_date`) with a unit
   test over the known faerrin/non-faerrin split (41 keep / 3 drop / `2025-8-11` drop). No LLM yet.
2. **S2 — the filter pass** (Stage 1): prompt (port caster `distill` + combat exclusion + keep-when-in-doubt),
   span segmentation, `DroppedSpan` artifact. Tested on a dev session (not 2026-6-8).
3. **S3 — the noun-fact extractor** (Stage 2): `NounFact`/`SessionFacts` schema + `call_structured` +
   grounding contract. Tested on a dev session.
4. **S4 — resolution + emit:** wire `resolve()` per fact, attach `Resolution`, atomic-write
   `facts/<date>.json`; the `astra_heartwood.assets.session_noun_facts` Dagster asset + code-location import.
5. **S5 — telemetry + the acceptance run:** domain spans/metrics; host-side run on **2026-6-8**; stakeholder
   judgment against §5. (Deploy COPY ripple verified to not break the code location.)

Each slice CI-green + committed; push on chunk completion (reproduce both lanes locally first;
**fetch+rebase before pushing** — the linguist-commit timer moves origin/main mid-session).

---

## 7. Next step

`octo:spec` → `thoughts/astra/specs/0020-heartwood-phase2-extraction-spec.md`, built on this scope's
settled decisions (P2.1–P2.11) and the chronicle template, then `octo:embrace`. Per
`resolve-open-questions-before-next-stage`, this scope is question-free; any new fork surfaced while
speccing gets asked (batched) before advancing to implementation.

**Carry forward to the umbrella:** P2.1 (PCs are wiki-eligible) **revises** umbrella §5 hard-problem #2
and §3a — update the umbrella + the `heartwood-0020-gotchas` memory to reflect the resolved boundary.

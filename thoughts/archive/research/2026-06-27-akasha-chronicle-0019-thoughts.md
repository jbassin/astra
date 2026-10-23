---
date: 2026-06-27
subsystem: chronicle (akasha campaign timeline)
plan: 0019
status: scoping (gate 1 of 3) — verified against the live repo
author: Claude (Opus 4.8)
---

# 0019 — akasha "chronicle": an automatic Show → Season → Episode campaign timeline

## Goal

Add a new section to **akasha** (the wiki read-surface) that presents an **in-depth, automatically
structured timeline of the actual-play campaigns** — a TV-guide-style hierarchy:

```
Show (campaign)  →  Season (GLM-derived)  →  Episode (one recorded session)
```

Each **episode** is one recorded session; each **season** is a narrative arc that GLM-5.2 groups
automatically; each **show** is a distinct campaign. The headline show is *Through a Song, Darkly*,
but the structure must accommodate all shows. The structuring (episode summaries + season grouping)
is done **automatically by GLM-5.2**, wired into the existing Dagster pipeline so new sessions flow
in without manual work.

## Decisions already settled (with the user)

1. **Seasons are GLM-derived**, ordered by session date, grouped **within a single show only** —
   never across shows.
2. **Shows are distinct campaigns, not seasons.** The filename prefixes (`101.interred-in-iomenei`,
   `102.fae-and-forest`, …) denote *different shows*, not arcs of one show. (Verified: these map 1:1
   to the 7 `campaign` blocks in `being.kdl`.)
3. **Episode depth = Rich** — per episode: title, 2–3 sentence synopsis, ordered key beats (an
   in-episode mini-timeline), characters present, locations, factions, items/macguffins, cliffhanger.
4. **Process = formal gates** — this scoping doc → an `octo:spec` NLSpec (`0019`) → `octo:embrace`.
5. **Landing view = shows index first** — `/<route>` lists all shows; click into one for its
   seasons/episodes.
6. **New route name required** — `/Timeline` is already taken by the in-world *lore* timeline
   (`apps/akasha-backend/content/Timeline.vellum`, ag-dated). The new section needs a distinct path.
   *Working name `/chronicle` — see "Decisions to revisit".*
7. **LLM path = `LiteLLMClient.call_structured` (GLM-5.2), NOT the dspy judge.** See "dspy" below.

## Verified findings (checked against the live repo, not assumed)

### The source data — shows, episodes, shape

- **44 sessions**, raw canonical transcripts at `apps/linguist/transcripts/<NNN>.<show>.<date>.txt`.
  The **show is encoded in the filename prefix**; distinct shows (verified by `ls | sed`):
  - `000.through-a-song-darkly` — **33 episodes** (main show)
  - `101.interred-in-iomenei` — 1
  - `102.fae-and-forest` — 3
  - `103.a-hunt-of-metal-and-vine` — 3
  - `104.the-first-spark` — 1
  - `105.observatory-slipped` — 2
  - `106.fey-in-the-mists` — 1
  - The numeric prefixes are **not** date-ordered and **not** seasons — they are show ids.
- Each show has a matching `campaign "<slug>" { name "..."; edition "pathfinder_2e"; role ... }`
  block in `ontology/ontology-being/being.kdl:70-160` (7 campaigns). The display name lives there
  (e.g. `through-a-song-darkly` → "Through a Song, Darkly").
- **Structured per-session data**: `apps/linguist/data/<date>.json`, shape verified:
  ```json
  { "date": "2024-10-15", "audio": "...", "script": [
      {"start":"00:00:04","second":4.25,"text":"...","user":{"name":"Josh","color":"--textJosh"},"duration":3.445}
  ]}
  ```
  Keyed by **date only** (dates are unique across sessions). To recover the **show** for a date we
  map from the `transcripts/` filename prefix (1:1 date↔show), or reuse `match_campaign`
  (`apps/linguist/.../campaigns.py`, threshold 15) which already routes each session to a campaign.
  *Filename-prefix mapping is authoritative and simpler — preferred.*
- The akasha frontend **already** routes transcripts to `Script/<campaign>/<date>` pages
  (`apps/akasha-frontend/src/domain/lib/transcriptBuild.ts` + `campaigns.ts`). Episode entries in
  the chronicle will **link to these existing transcript pages** rather than duplicating them.

### The LLM path (`libs/py/llm`, `astra_llm`)

- `LiteLLMClient.call_structured(output_model, *, system, user_content, model=DEFAULT_MODEL,
  max_tokens=DEFAULT_MAX_TOKENS, tool_name="record", tool_description=...)` — forced-tool →
  `output_model.model_validate(raw)`. This is the typed-output path we want
  (`libs/py/llm/src/astra_llm/client.py:253`).
- `DEFAULT_MODEL = "openrouter/z-ai/glm-5.2"` (`client.py:33`). Config-single-source:
  `config.kdl:18 llm { default-model "openrouter/z-ai/glm-5.2" }`. Provider key resolved by
  `ensure_openrouter_env()` (`astra_llm/__init__.py:85`) → litellm reads `OPENROUTER_API_KEY` from
  env (SOPS-injected at deploy via the `*dagster-env` anchor — same path the judge/mouthpiece use).
- **Cost/telemetry is automatic** — every `LiteLLMClient` call emits `astra.llm.cost_usd` +
  token counters with model/cost span attributes (`client.py:148-177`), pricing table includes
  GLM-5.2 (`pricing.py`). No extra wiring needed for cost; add asset-level spans/metadata.

### dspy — can we use the judge? (answered, recorded)

- The dspy judge (`apps/linguist/.../surface/dspy_judge.py`) is `dspy.ChainOfThought(_JudgeSignature)`
  with signature `(lexicon, window) → list[Candidate]` — a **classifier** for OOV lexicon
  corrections, MIPROv2-compiled against a gold set, shipping a committed `judge.compiled.json`.
  **It does not transfer** to summarization.
- The dspy *framework* could wrap a new signature, but its value (MIPROv2 optimization vs a gold
  set + metric) has nothing to optimize against for free-form summaries, and astra convention
  reserves dspy for the single gold-set task (the judge) while all generative calls use
  `LiteLLMClient` directly. **Decision: use `call_structured`.**
- *Future hook:* season-boundary detection is decision-shaped (checkable), so if a labeled
  boundary gold set is ever built, the grouping step is a candidate to move onto a dspy judge.
  Out of v1 scope.

### The pipeline (Dagster, `apps/linguist` + `dagster/definitions.py`)

- linguist is sensor-driven: `scribe_output_sensor` registers a `DynamicPartitionsDefinition`
  partition per new session date and fires `session_transcripts` (+ `correction_candidates`).
  Historical 44 sessions are pre-satisfied via `historical.py` so the sensor ignores them.
- Assets are registered in `dagster/definitions.py` (imports each subsystem's assets into
  `dg.Definitions`). A new asset is added there.

### The frontend (`apps/akasha-frontend`, strider template, SSR)

- Build-time content pipeline: `scripts/build-content.ts` reads
  (a) `apps/akasha-backend/snapshot/akasha-snapshot.json`,
  (b) `apps/akasha-backend/content/`,
  (c) `apps/linguist/data/` (transcripts), (d) `being.kdl` →
  emits `src/generated/{site,bodies,transcripts,speakers}.ts`. A new `timeline.ts` (working name —
  `chronicle.ts`) generated module is the natural extension.
- Routes are TanStack file routes under `src/routes/`. A new top-level section = a new route dir
  (e.g. `src/routes/chronicle/index.tsx` + `$show.tsx`) with a loader over the generated module +
  a gothic-styled React component in `src/domain/components/`.
- There is an existing `@timeline` vellum construct + `TimelineBlock` renderer
  (`libs/ts/gothic/.../TimelineBlock.tsx`), used by the lore `Timeline.vellum`. The chronicle is
  **interactive (shows index, collapsible seasons, episode cards linking to transcripts)**, so a
  **custom React component is the right call**, not authored vellum.

### Deploy wiring (the load-bearing gotcha)

- The **linguist-commit systemd timer** (`justfile:109` `linguist-commit`,
  `deploy/systemd/linguist-commit.service`) is what makes pipeline output go live. It currently:
  - `git add apps/linguist/transcripts apps/linguist/data` (line 113), commits + pushes;
  - **redeploys akasha-frontend only when** the staged diff matches
    `^apps/linguist/(transcripts|data)/` (line 134).
- **Therefore**: chronicle artifacts must live where the timer will commit + trigger a redeploy.
  Putting them under `apps/linguist/timeline/` requires extending **both** the `git add` (line 113)
  and the trigger grep (line 134) to include `timeline`. (Asset writes from the Dagster container
  are root-owned — same pattern as mouthpiece episodes; the timer commits them.)

## Proposed architecture (for the spec to formalize)

### Data model (Pydantic, in `apps/linguist`)
- `EpisodeSummary`: `title, synopsis, key_beats: list[str], characters_present: list[str],
  locations: list[str], factions: list[str], items: list[str], cliffhanger: str` (GLM output) +
  carried `date, show, episode_number`.
- `SeasonStructure` (per show): `seasons: [{number, title, arc_summary, episode_dates: list[str]}]`.

### Pipeline (two assets, automatic)
1. **`session_episode_summary`** — partitioned per date, `deps=[session_transcripts]`, fired by the
   existing sensor. Reads `data/{date}.json`, `call_structured(EpisodeSummary, model=GLM-5.2)`,
   writes committed `apps/linguist/timeline/episodes/{date}.json`. ~50–60k input tokens/episode.
2. **`campaign_timeline`** — aggregate (non-partitioned) asset. Reads all `episodes/*.json`, maps
   each to a show via the filename-prefix map, feeds **each show's ordered compact summaries**
   (title+synopsis+beats, ~1–2 KB each — **not** full transcripts) to GLM-5.2 for season
   assignment, writes committed `apps/linguist/timeline/seasons.json`. Cheap. Re-runs after episode
   summaries land (sensor or a short schedule).
3. **Backfill**: materialize both over the 44 existing partitions once (cost estimate below).

### Frontend
4. `build-content.ts` reads `apps/linguist/timeline/{seasons.json,episodes/}` → emits
   `src/generated/chronicle.ts`. Resolve episode entity names → wiki crossref links via the
   existing snapshot edges where they match (build-time, best-effort).
5. New routes `/<route>` (shows index — **landing**) + `/<route>/$show` (seasons/episodes view);
   gothic-styled `ChronicleView` component; episode cards link to `Script/<campaign>/<date>`.
   Add a nav entry.

### Config / deploy / tests
6. Model on `llm.default-model` (GLM-5.2). Optionally add `linguist.chronicle-model` defaulting to
   `default-model` if decoupling is wanted (mirror both py+ts config schemas if so).
7. Extend `linguist-commit` (justfile:113 + 134) to commit + redeploy on `timeline/` changes.
   `just up` for akasha-frontend; **no Caddy/edge change** (new in-app route, same host).
8. Tests both lanes: stubbed-LLM episode summary, season-grouping over fixtures, build-content
   chronicle emission, component smoke. Reproduce CI locally before push; per-slice conventional
   commits; push when the chunk is done (per the no-CI-monitoring memory).

## Cost estimate (backfill)
- Stage 1 dominates: 44 episodes × ~55k input tokens ≈ **2.4M input tokens**. At GLM-5.2 input
  $0.95/1M ≈ **~$2.30** + modest output. Stage 2 reads compact summaries (~44 × ~1.5 KB) — cents.
  Ongoing: ~1 episode/week ≈ negligible. All traced to SigNoz via `astra.llm.cost_usd`.

## Decisions — RESOLVED with the user (2026-06-27)
1. **Route + section name → `Chronicle`.** Route `/chronicle` (index) + `/chronicle/$show`;
   generated module `src/generated/chronicle.ts`; nav label "Chronicle". Distinct from the lore
   `/Timeline`.
2. **Shows surfaced/order → all 7, main pinned first.** *Through a Song, Darkly* first, then the
   other 6 by first-session date. (No 1-session shows hidden.)
3. **Episode numbering → per-show `S#E#`.** Reset per show; season-relative episode number by date.
4. **Entity → wiki links → DEFERRED to v2.** v1 shows `characters_present` / `locations` /
   `factions` as plain text. Snapshot-edge resolution is a follow-up.
5. **Spoilers → no gating.** Recap/archive surface; synopsis/beats/cliffhanger shown openly.
6. **Storage location → `apps/linguist/timeline/`.** Keeps artifacts in the linguist-commit
   auto-commit/redeploy path (the pipeline owns generation).

## Risks / gotchas (carried from memory)
- **linguist-commit trigger** must be extended for `timeline/` or new chronicle data never
  redeploys akasha ([[pipeline-live-run-gotchas]], [[akasha-frontend-0011-gotchas]]).
- **Dagster container writes root-owned files** — backfill/materialize must run *in* the
  dagster-code container; the host can't write `apps/linguist/timeline/` if root-owned
  ([[mouthpiece-glm-debate-switch]]).
- **gothic theme.css `@source "./"`** needed for any new DocumentView/utility-class consumer
  ([[akasha-frontend-0011-gotchas]]).
- **Config-single-source** — no hardcoded model/paths; read via `astra_config`
  ([[config-single-source]]).
- **Telemetry from day one** — `init_telemetry` in the dagster code location already covers the
  asset; ensure the new asset emits spans/metadata ([[telemetry-built-in]]).
- **No silent scope cuts** — build the full Rich model + all shows ([[no-silent-scope-cuts]]).

## Next step
Author the NLSpec `thoughts/astra/specs/0019-chronicle-spec.md` via `octo:spec`, resolving the six
revisit-decisions above (route name first), then implement via `octo:embrace` in CI-green slices:
pipeline asset → backfill → frontend → deploy wiring.

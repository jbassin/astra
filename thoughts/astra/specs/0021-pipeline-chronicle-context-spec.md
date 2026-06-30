# 0021 — pipeline reorder, Change B: chronicle feeds mouthpiece — NLSpec

- **Status:** ✅ **BUILT + DEPLOYED + LIVE-VERIFIED** (2026-06-30; S1 `f66f48e` / S2 `0d52198` /
  S3 `454d55a`; S4 deploy). Acceptance §11 met — the linguist selectors + continuity block + script-stage
  injection + the gated sensor all shipped; deployed via `just up` (cross-app import loads clean); a live
  re-render of `session_script` for 2026-6-29 confirmed `mouthpiece.continuity_episodes = 3` in SigNoz
  (3 prior episodes injected; prove-and-revert, forward-only). Gate logic unit-proven (no naturally-
  deferred session exists to demo live — all backlog is chronicled). Load-bearing gotchas in
  [[pipeline-reorder-0021]].
  _(Originally:)_ SPEC — ready to implement. Decisions resolved; no open questions.
- **Scope doc:** `thoughts/shared/research/2026-06-30-pipeline-reorder-0021-thoughts.md` (verified)
- **Date:** 2026-06-30
- **Subsystem slug:** `pipeline-reorder` (Change B of two; Change A = `0021-pipeline-scribe-parallel-spec.md`,
  BUILT)
- **Roadmap:** Decision H (pipeline = a Dagster asset graph, one partition per session, cross-app
  ordering via sensors + file handoffs). A refinement of 0008 (mouthpiece) + 0019 (chronicle), not a
  new subsystem.

## 1. Overview

Today chronicle (`session_episode_summary` → `timeline/episodes/<date>.json`) and mouthpiece
(`session_digest → session_script → … → session_episode`) are **independent parallel branches** off
linguist's corrected transcript — neither waits for the other, and mouthpiece consumes no chronicle
output. Change B makes mouthpiece **(a) consume chronicle output as recap context** and **(b) wait for
chronicle before scripting**, so the recap is written with "previously, on this show…" continuity.

Two coupled pieces (ship together — the gate alone would only add latency, the context alone could read
a stale/absent episode):

1. **Context** — at the **script stage** (faerrin continuity precedent), inject a compact block built
   from the **3 most-recent prior episodes of this session's show** + a **best-effort current-season
   arc** framing, threaded exactly like the existing `threads_block`.
2. **Ordering gate** — `linguist_output_sensor` defers a session's (paid) run until its
   `episodes/<date>.json` exists, **except** sessions chronicle will never summarize (excluded /
   unmatched), which proceed ungated. The **backlog-adoption invariant** (the 2026-06-23 paid-replay
   incident) is preserved.

This NLSpec assumes the verified facts + resolved decisions in the scope doc. **No open questions.**

### Resolved decisions (stakeholder, 2026-06-30)

- **B1** — context = the **3 most-recent prior episodes**, **same show only** (`EpisodeEntry.show`),
  **plus** a **best-effort season/arc** framing from `seasons.json` (omitted when the hourly aggregate
  hasn't placed this date yet — never gated on).
- **B2** — inject at the **script stage** (`build_script_user_content`), threaded like `threads_block`.
- **B3** — **hard gate + carve-out**; adoption preserved.
- **Path coupling** — keep the **package-path convention** (import `astra_linguist.chronicle` directly,
  as `linguist_io` already reaches linguist via `_LINGUIST_ROOT`); **no new config field**.

## 2. Actors

- **Chronicle** (`apps/linguist`) — `session_episode_summary` (`deps=session_transcripts`) writes
  `timeline/episodes/<date>.json` in the **same linguist run** as the transcript; writes **nothing**
  when `show_for_date(date) is None` (excluded via `EXCLUDED_DATES` / unmatched).
- **Mouthpiece** (`apps/mouthpiece-backend`) — `linguist_output_sensor` (gate) + `session_script`
  (context consumer). `astra_linguist` is already a mouthpiece dependency.
- **The recap audience** — gets "last time on this show" continuity in the episode.

## 3. The context (Seams 1 + 2)

### 3.1 Linguist selectors (new, in `apps/linguist/src/astra_linguist/chronicle.py`)

Read-only helpers over the committed `timeline/` artifacts (alongside `load_episode_entries`):

- `load_episode_summary(date: str, episodes_dir: Path = EPISODES_DIR) -> EpisodeEntry | None` —
  load one entry by date; **`None` if the file is absent** (the gate + context both tolerate absence).
- `recent_prior_entries(date, show, *, limit=3, episodes_dir=EPISODES_DIR) -> list[EpisodeEntry]` —
  every entry with the **same `show`** and `date_key(e.date) < date_key(date)`, sorted ascending by
  `date_key` (the non-zero-padded `YYYY-M-D` tuple sort, `chronicle.py:111`), returning the **last
  `limit`** (chronological, oldest→newest). Tolerates a missing dir → `[]`.
- `season_for(date, show, *, seasons_path=SEASONS_PATH) -> Season | None` — load the committed
  `Chronicle` from `seasons.json`, find the `ShowChronicle` with `show == show`, return the `Season`
  whose `episode_dates` contains `date`. **Best-effort:** `None` when `seasons.json` is absent, the show
  isn't present, or this date hasn't been placed yet (the aggregate is hourly — it lags). Never raises.

These live in linguist (they read linguist's own artifacts + use its models/`date_key`); mouthpiece
imports them.

### 3.2 The continuity block (new, in `apps/mouthpiece-backend/src/astra_mouthpiece/continuity.py`)

Mirror `threads.py` (`load_threads`/`format_threads`):

- `build_continuity_block(prior: list[EpisodeEntry], season: Season | None, *, budget: int =
  CONTINUITY_BUDGET) -> str` — render a compact, labeled block; returns `""` when there is nothing
  (no prior episodes and no season → the first episode of a show, or a brand-new campaign).
  - **Season line** (if `season`): `SEASON — "<title>": <arc_summary>`.
  - **PREVIOUSLY list** (oldest→newest of `prior`): per episode a tight line —
    `• <title> — <synopsis>` plus, for the **most-recent** one only, its `cliffhanger` (the immediate
    hook) and up to ~3 `key_beats`. Older entries get title + synopsis only (keep it skimmable).
  - **Budget**: stop adding episode detail once the rendered block reaches `CONTINUITY_BUDGET` chars
    (a new constant, e.g. `6_000`, **separate from** `GROUNDING_BUDGET = 24_000`), truncating the
    least-recent first. 3 compact episodes + a season line sit far under the cap; the guard is
    defensive so continuity never crowds the akasha grounding window.

### 3.3 Inject at the script stage (`prompts.py` + `session.py`)

Thread a new **`continuity_block: str = ""`** param exactly like `threads_block`, end to end:

`session_script` (asset) → `build_episode_script` (`session.py:26`) → `generate_script` →
`build_script_user_content` (`prompts.py:237`), every hop with a `= ""` default so the one-shot arm,
`produce_episode`, and all existing tests keep working untouched.

In `build_script_user_content`, render the continuity as a **framing block placed before the
"things that happened this session" beats** (continuity sets up "what came before" → then this
session), e.g. a `PREVIOUSLY / SEASON` section between the synopsis and the beat list:
`continuity = "" if continuity_block.strip() == "" else f"{continuity_block.strip()}\n\n---\n\n"`. The
existing threads/wiki blocks are unchanged. When `continuity_block == ""` the prompt is **byte-identical
to today** (so the one-shot + existing golden tests don't move).

### 3.4 Wire `session_script` (`assets.py:156`)

In the asset, before `build_episode_script`, build the block via the package-path convention:

```python
from astra_linguist.chronicle import recent_prior_entries, season_for, show_for_date  # package-path
show = show_for_date(key)            # ShowInfo | None
slug = show.slug if show else None
prior  = recent_prior_entries(key, slug) if slug else []
season = season_for(key, slug) if slug else None
continuity_block = build_continuity_block(prior, season)
```

Pass `continuity_block=continuity_block` into `build_episode_script`. (If `slug is None` — the
carve-out case that the gate let through — there is simply no continuity; the block is `""`.)

## 4. The ordering gate (Seam 3)

`linguist_output_sensor` (`assets.py:337`) today: `found = linguist_io.new_sessions(existing)` →
adopt-all on first eval (`cursor is None`), else add-partitions + run-requests for all `found`. The
gate makes **partition-registration + run-request conditional on chronicle readiness in the normal
branch**, while **adoption (first eval) still adopts every transcript** (the paid-replay guard).

### 4.1 The gate predicate (new helper, `linguist_io.py`)

```python
def chronicle_gate_open(date: str) -> bool:
    """A session may run once chronicle has produced its episode OR will never produce one."""
    from astra_linguist.chronicle import load_episode_summary, show_for_date  # package-path
    return load_episode_summary(date) is not None or show_for_date(date) is None
```

- `load_episode_summary(date) is not None` → chronicle wrote `episodes/<date>.json` (the hard gate).
- `show_for_date(date) is None` → **carve-out**: excluded (`EXCLUDED_DATES`) or unmatched (unknown
  slug). Chronicle will never emit an episode for it, so it must proceed ungated (else permanent
  stall). Since the session is already transcript-present (it's in `found`), `None` here means
  excluded/unknown, not "no transcript".

### 4.2 The sensor rewrite (the load-bearing invariant)

```python
found = linguist_io.new_sessions(existing)          # transcript-present, not yet partitioned
adds_all = [mouthpiece_sessions.build_add_request(list(found))] if found else []
if context.cursor is None:
    # One-time adoption: register the ENTIRE transcript backlog as known, NO runs.
    return dg.SensorResult(dynamic_partitions_requests=adds_all, cursor="adopted")
# Normal eval: a session is registered + run ONLY when chronicle is ready for it. A
# gated-but-not-ready session is left UN-partitioned (not in adds) so it stays "found" and
# is re-checked next eval — it fires exactly once, when its episode lands.
ready = {d: p for d, p in found.items() if linguist_io.chronicle_gate_open(d)}
adds_ready = [mouthpiece_sessions.build_add_request(list(ready))] if ready else []
return dg.SensorResult(
    run_requests=[dg.RunRequest(partition_key=d) for d in ready],
    dynamic_partitions_requests=adds_ready,
)
```

**Why partition-registration moves to `ready` (not all `found`) in the normal branch:** if a
gate-closed session were adopted as a partition, `new_sessions` would never surface it again (it'd be in
`existing`), so it could never run even after its episode lands. Leaving it un-partitioned keeps it
"found" each eval until ready — at which point it's partitioned **and** run in the same eval (discovery
== partition == run, preserving the original atomic semantics for ready sessions). The **first-eval
adoption still adopts the whole backlog** (every committed transcript already has its episode from the
chronicle backfill), so re-enabling never replays the 42 paid runs.

## 5. Behaviors

- **B1** `session_script` for session N includes a continuity block built from the ≤3 most-recent
  prior **same-show** episodes + (best-effort) the current season arc; `""` for a show's first episode.
- **B2** The block is injected at the **script** stage only; the digest stage + `mega_digest` are
  unchanged. With no context the script prompt is byte-identical to today (forward-only).
- **B3** A matched session does not get a (paid) mouthpiece run until `episodes/<date>.json` exists;
  an excluded/unmatched session runs immediately (carve-out).
- **B4** On sensor enable/re-enable (cursor reset), the entire transcript backlog is adopted with **no
  runs** — no paid replay.
- **B5** A session discovered (transcript) before its episode lands stays un-partitioned and fires its
  run **exactly once**, on the first eval after the episode appears (≤ one `minimum_interval_seconds`
  of added latency; in practice the episode lands in the same linguist run as the transcript).

## 6. Constraints / invariants

- **C1 — preserve adoption (paid-replay guard).** First-eval `cursor is None` adopts **all** found
  transcripts, no runs. The gate only filters the **normal** branch. A gated session never silently
  "becomes new" and fires a delayed paid run for the wrong reason — it fires once, when ready.
- **C2 — carve-out is mandatory.** Excluded/unmatched sessions (`show_for_date(date) is None`) must
  run ungated, or mouthpiece permanently stalls on them.
- **C3 — config-single-source / package-path.** No new config field; reach linguist's `timeline/`
  via `astra_linguist.chronicle` imports (precedent: `linguist_io._LINGUIST_ROOT`,
  `transcript_for`). Cross-app filesystem layout is internal, not deployment config.
- **C4 — forward-only.** Published episodes keep their scripts (like the GLM/debate switches). No
  re-render of the back catalogue; the change applies to the next session scripted.
- **C5 — prompt budget.** Continuity has its **own** `CONTINUITY_BUDGET`, independent of
  `GROUNDING_BUDGET`; it never reduces the akasha grounding allowance.
- **C6 — best-effort season, never a gate.** `season_for` returning `None` (lagging `seasons.json`)
  omits the season line and changes nothing else. The gate keys only on `episodes/<date>.json`.
- **C7 — telemetry from day one.** `session_script` span gains `mouthpiece.continuity_episodes`
  (count) + `mouthpiece.continuity_chars`; the sensor logs a deferral when a found session is gated
  (so a stuck session is observable in SigNoz, the 2026-06-29 silent-stall lesson).
- **C8 — no silent scope cuts.** Both pieces ship together (context + gate); the season framing ships
  (best-effort), not dropped.
- **C9 — port faerrin where applicable.** Continuity-at-the-script-stage is the faerrin caster
  `running-threads` shape (`faerrin/pkg/caster/src/script/prompt.ts:174-211`); the
  Show→Season→Episode source is astra-native (chronicle 0019). Mirror, don't reinvent (`threads.py`).

## 7. Implementation slices (each independently CI-green, conventional-commit per slice)

> Reproduce the py lane locally before pushing (`uv run ruff check && uv run ruff format --check &&
> uv run ty check && uv run pytest`, scoped to `apps/linguist` + `apps/mouthpiece-backend`); push when
> the chunk is done; do not watch GHA. **Pause the linguist-commit `--user` timer during any manual
> git/deploy** (`systemctl --user stop linguist-commit.timer`) — it raced the Change A commit
> ([[pipeline-reorder-0021]]).

**S1 — linguist chronicle selectors (py, linguist).** Add `load_episode_summary`,
`recent_prior_entries(limit=3)`, `season_for` to `chronicle.py` (read-only; no asset/behavior change).
Unit tests on a tiny in-test `episodes/` + `seasons.json` fixture: by-date load (+ absent→None),
same-show recency window + `limit`, cross-show exclusion, `date_key` ordering with non-zero-padded
dates, season hit/miss/absent-file. *Gate: pytest green; ruff + ty clean.*

**S2 — continuity block + script-stage injection + asset wiring (py, mouthpiece).** New
`continuity.py` `build_continuity_block` + `CONTINUITY_BUDGET`; thread `continuity_block: str = ""`
through `build_episode_script` → `generate_script` → `build_script_user_content`; wire `session_script`
to build it via the package-path selectors. Tests: block rendering (season + 3 priors, most-recent gets
cliffhanger/beats, older title+synopsis), budget truncation (least-recent first), **empty input →
`""` → prompt byte-identical to today** (lock with the existing script-content test), threading default
keeps one-shot/`produce_episode` unchanged. *Gate: pytest green; existing mouthpiece script tests
unchanged.*

**S3 — the gated `linguist_output_sensor` + carve-out (py, mouthpiece).** Add
`chronicle_gate_open(date)` to `linguist_io.py`; rewrite the sensor's normal branch to partition+run
only `ready` sessions (adoption branch unchanged). Tests (predicate-level, the load-bearing ones):
(a) adoption still adopts ALL found, no runs, on `cursor is None`; (b) a matched session with an
episode → runs; (c) a matched session **without** an episode → no run, **not** partitioned (stays
re-discoverable); (d) when the episode later appears → runs exactly once; (e) an excluded/unmatched
session (`show_for_date None`) → runs immediately (carve-out). Stub the chronicle predicate via the
injected dir/monkeypatch (no live timeline needed). *Gate: pytest green.*

**S4 — deploy + live verify.** Rebuild the dagster-code image (`just up`). Verify on a real or
synthetic session: (1) the gate — a transcript present without its episode does NOT launch a mouthpiece
run; once `episodes/<date>.json` exists, exactly one run launches; an excluded date runs ungated;
(2) the context — re-render one existing session (materialize `session_script` in the dagster-code
container, per [[mouthpiece-glm-debate-switch]]) and confirm the rendered prompt/script carries the
`PREVIOUSLY`/`SEASON` block (and SigNoz shows `mouthpiece.continuity_episodes > 0`). **No config.kdl /
Caddy / edge change.** Tear down any synthetic partition (per the Change A teardown recipe). *Gate: the
gate defers + releases correctly; a re-rendered script shows the continuity block; the four mouthpiece
assets still materialize.*

## 8. Telemetry

- `session_script` span attributes: `mouthpiece.continuity_episodes` (prior count used),
  `mouthpiece.continuity_chars` (rendered block length).
- `linguist_output_sensor`: a `log.info` (or skip-reason on the `SkipReason`) naming each **deferred**
  found session (`"<date> awaiting chronicle episode"`) so a stalled session is visible — the
  2026-06-29 silent-stall lesson ([[astra-alerting-setup]]).
- No new metric instrument required; if added, use a counter via `astra_observe` (TS lazy-binding
  N/A — this is Python).

## 9. Tests (py lane only — no ts change)

- **Linguist selectors:** by-date load + absent→None; same-show recency + `limit=3`; cross-show
  exclusion; `date_key` ordering (non-zero-padded); `season_for` hit / wrong-show / absent-file / date
  not-yet-placed → None.
- **Continuity block:** full render (season + 3 priors, most-recent cliffhanger/beats); budget
  truncation; empty → `""`; one-shot/`produce_episode` unaffected by the new default param.
- **Prompt parity:** `build_script_user_content(..., continuity_block="")` byte-identical to the
  current output (regression lock).
- **Gate predicate + sensor:** the five cases in S3 (adoption-all, ready-runs, unready-no-run-no-adopt,
  later-runs-once, carve-out-runs). Assert a gated session is **absent from
  `dynamic_partitions_requests`** (the invariant that keeps it re-discoverable).
- Existing mouthpiece + linguist tests unchanged and green.

## 10. Out of scope

- Change A (already BUILT) — the scribe parallel split.
- Re-rendering / back-filling continuity into the published back catalogue (forward-only, C4).
- A configured linguist→mouthpiece path contract (package-path convention kept, C3).
- Per-episode host/voice changes, digest-stage context, `mega_digest` changes.
- Making chronicle a cross-app Dagster `dep` of mouthpiece (ordering stays sensor + file-handoff
  driven, per Decision H / the scope doc).
- Tuning `EXCLUDED_DATES` or `match_campaign` (chronicle's concern).

## 11. Acceptance

B1–B5 hold; py CI green. Specifically: (1) `session_script` for a session with same-show predecessors
renders a `PREVIOUSLY` block (+ best-effort `SEASON`), and renders **none** for a show's first episode;
with `continuity_block=""` the script prompt is byte-identical to today. (2) The
`linguist_output_sensor` defers a matched session until `episodes/<date>.json` exists, runs it exactly
once when the episode lands, runs excluded/unmatched sessions immediately, and re-enable adopts the
backlog with zero paid runs (the gated session is never in `dynamic_partitions_requests` until ready).
(3) Live: a re-rendered session's script carries the continuity block with `mouthpiece.continuity_episodes
> 0` in SigNoz; the gate's defer/release is observable. (4) Memory updated with the load-bearing
gotchas (the partition-registration-moves-to-ready invariant; the package-path coupling; best-effort
season; forward-only).
```

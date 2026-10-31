# linguist — session transcripts and the chronicle

linguist turns scribe's raw `script.json` into the canonical session transcript and builds the
chronicle (the Show → Season → Episode timeline on `akasha.iridi.cc/chronicle`). It runs as
Dagster assets on the shared `sessions` partitions. `session_transcripts` depends on scribe's
`session_transcript`, and `linguist_automation` launches both assets below, in one run, once
it gets a new materialization:

- `session_transcripts` writes `linguist/transcripts/<NNN>.<slug>.<date>.txt` and
  `linguist/data/<date>.json` in the astra-data clone, plus the campaign-matched LLM context
  `<NNN>.<slug>.<date>.txt` under `linguist.script-path`.
- `session_episode_summary` writes `linguist/timeline/episodes/<date>.json` (GLM via
  `astra_llm` `call_structured`). `campaign_timeline` groups each show into seasons in
  `linguist/timeline/seasons.json`; `campaign_timeline_sensor` runs it after a new summary
  materialization, only when the episode inputs changed (`timeline_is_current`).

mouthpiece waits for a session's `session_episode_summary` to be materialized before it runs
(the chronicle gate, an asset dependency), and reads prior episodes as continuity.

## Operations

- **Publish.** The host `linguist-commit` unit commits these datasets to the astra-data clone
  with `git commit --only`, regenerates the mouthpiece snapshot, pushes, seeds audio and
  redeploys akasha-frontend and mouthpiece-frontend when their inputs changed. It runs on the
  `linguist-commit.path` unit (fired by mouthpiece's `.last-rendered`) and a 15-minute timer.
  Run it by hand with `just -f /ruby/data/astra-deploy/justfile linguist-commit`. A failed
  push is retried by the next run.
- **A session with no chronicle episode** keeps mouthpiece's gate closed. Materialize
  `session_episode_summary` for that partition in Dagster; `campaign_timeline_sensor` then
  regroups the seasons. An episode file written outside Dagster (the host backfill below)
  neither opens the gate nor triggers the sensor.
- **Exclude a mislabeled session** from the chronicle: add `session "<date>" skip=#true` with
  a `note` to `ontology/ontology-being/sessions.kdl`, then deploy Dagster (see
  `docs/runbook.md`, "Correct one session"). `show_for_date` returns no show for it.
- **Chronicle backfill** (resumable; skips episode files that exist):
  `uv run python apps/linguist/py/scripts/backfill_chronicle.py` on the host, then
  materialize `campaign_timeline` by hand.
- **Earlier campaigns** (one-off): `uv run python apps/linguist/py/scripts/import_quartz.py
  <astra-data root>` converts the 25 Deep Eyes and Færrin one-shot transcripts from the old
  quartz site into `linguist/transcripts/`. It keeps any `linguist/data/<date>.json` already
  there (the published ones for those dates have real line durations) and refuses the live
  clone.
- **Fix a recurring mistranscription:** add a `variant` (a regex fragment) under the right
  `entry` in `libs/py/lexicon/src/astra_lexicon/defs.kdl`, then deploy Dagster. New sessions
  get it from `session_transcripts`. For stored text, `stored_corrections_sensor` sees the new
  `defs.kdl` (its digest differs from the last `stored_corrections` materialization's
  `defs_digest`) and launches `stored_corrections` once. That rewrites every transcript,
  context script, `data/*.json`, chronicle entry and mouthpiece `script.json`, `brief.json` and
  `digest.json` in place, and linguist-commit publishes the astra-data part. No reader
  corrects text itself. The run takes about a minute for the whole corpus (the replacer
  dispatches on the first character, ~0.5 s per 230 KB transcript; the flat alternation it
  replaced took 30 s per transcript and 1 h 55 min for the first run). The sensor waits for
  other runs to finish before it starts one. Its metadata lists the files changed per group
  and any JSON skipped for an unexpected format. A variant must start with a letter, a
  digit, a `[...]` class of them, `(?-i:` or an escaped symbol: `build_replacer` rejects
  any other head, and `just test` loads the shipped `defs.kdl`.

## Traps

- **An empty transcript fails the run.** `session_transcripts` refuses, writing nothing, a
  scribe `script.json` with fewer than `MIN_TRANSCRIPT_SEGMENTS` (100) lines, also on a hand
  materialize. Re-transcribe the session (scribe README); don't lower the floor.

- **Show = the transcript's filename slug.** `show_for_date` reads `<slug>` from
  `<NNN>.<slug>.<date>.txt`; the slug matches a `being.kdl` campaign. Sessions that match no
  campaign are left out of the chronicle and pass mouthpiece's gate ungated. The campaign
  match is a substring heuristic and can false-match. The fix is in `sessions.kdl`: `skip=#true`
  for a session in no show, or `campaign="<slug>"` to name its show. `session_transcripts` then
  files it under that campaign (its prefix, billed from its roles) and `show_for_date` returns
  that show whatever the filename says.
- **A `campaign=` override does not move stored output.** It steers the next run only.
  Re-materializing `session_transcripts` for the session writes the new stem and deletes the
  old `<other>.<date>.txt` in `transcripts/` and `script/`; linguist-commit publishes the rename.
  The chronicle episode keeps its old `show` until `session_episode_summary` reruns (paid) or
  someone edits it, and the podcast episode keeps its id. akasha re-files the page on its next
  build.
- **Seasons regroup from scratch.** `campaign_timeline` sees only the episode list, so any new
  episode can re-partition a show's seasons and renumber season-nested URLs
  (`…/s<N>/<date>`). Josh accepted this; do not "fix" it without a new decision.
- **Season grouping returns boundaries** (`title`, `arc_summary`, `start_date`), not episode
  lists; a 33-episode list truncated mid-JSON. `_seasons_from_plan` derives the partition.
- **Dates are not zero-padded.** Order episodes with `astra_sessions.date_key` (an integer tuple).
- **Structured output can parse and still fail the schema** (GLM returned a list as a JSON
  string). `call_structured` retries a `ValidationError` three times, then raises.
- **Old `*.candidates.json` files** from the deleted correction loop (ADR 0021) still sit in
  `linguist/data/` in the clone. Its `.gitignore` keeps them out of commits, and
  `backfill_chronicle.py` skips them.

# linguist — session transcripts, correction surfacing and the chronicle

linguist turns scribe's raw `script.json` into the canonical session transcript and builds the
chronicle (the Show → Season → Episode timeline on `akasha.iridi.cc/chronicle`). It runs as
Dagster assets on `linguist_sessions` partitions, fired by `scribe_output_sensor`:

- `session_transcripts` writes `linguist/transcripts/<NNN>.<slug>.<date>.txt` and
  `linguist/data/<date>.json` in the astra-data clone, plus `shibboleth.json` under
  `linguist.script-path`.
- `correction_candidates` runs the compiled dspy judge and writes
  `linguist/data/<date>.candidates.json` for human triage (the clone's `.gitignore` keeps it
  out of git).
- `session_episode_summary` writes `linguist/timeline/episodes/<date>.json` (GLM via
  `astra_llm` `call_structured`); the hourly `campaign_timeline` groups each show into seasons
  in `linguist/timeline/seasons.json`.

mouthpiece waits for a session's chronicle episode before it runs (the chronicle gate), and
reads prior episodes as continuity.

## Operations

- **Publish.** The host `linguist-commit` unit commits these datasets to the astra-data clone
  with `git commit --only`, regenerates the mouthpiece snapshot, pushes, seeds audio and
  redeploys akasha-frontend and mouthpiece-frontend when their inputs changed. It runs on the
  `linguist-commit.path` unit (fired by mouthpiece's `.last-rendered`) and a 15-minute timer.
  Run it by hand with `just -f /ruby/data/astra-deploy/justfile linguist-commit`. A failed
  push is retried by the next run.
- **A session with no chronicle episode** keeps mouthpiece's gate closed. Materialize
  `session_episode_summary` for that partition, then `campaign_timeline`.
- **Exclude a mislabeled session** from the chronicle: add its date to `EXCLUDED_DATES` in
  `src/astra_linguist/chronicle.py`, then deploy Dagster.
- **Chronicle backfill** (resumable; skips episode files that exist):
  `uv run python apps/linguist/scripts/backfill_chronicle.py` on the host.
- **Triage correction candidates** (interactive), then append accepted fixes to `defs.yaml`:

  ```sh
  uv run python -m astra_linguist.surface.review_tui --candidates <date>.candidates.json
  uv run python -m astra_linguist.surface.apply --candidates <date>.candidates.json
  ```

- **Recompile the judge** (paid, about $7; without `--live` it prints a spend estimate;
  `--eval-only` re-scores the committed artifact):
  `uv run python -m astra_linguist.surface.optimize --live`. The compiled
  `surface/judge.compiled.json` is specific to its model, so changing
  `linguist.surface-model-judge` needs a recompile.

The correction loop (`correction_candidates` and `surface/`) is scheduled for deletion in the
0037 paydown.

## Traps

- **Show = the transcript's filename slug.** `show_for_date` reads `<slug>` from
  `<NNN>.<slug>.<date>.txt`; the slug matches a `being.kdl` campaign. Sessions that match no
  campaign are left out of the chronicle and pass mouthpiece's gate ungated. The campaign
  match is a substring heuristic and can false-match; `EXCLUDED_DATES` is the fix.
- **Seasons regroup from scratch.** `campaign_timeline` sees only the episode list, so any new
  episode can re-partition a show's seasons and renumber season-nested URLs
  (`…/s<N>/<date>`). Josh accepted this; do not "fix" it without a new decision.
- **Season grouping returns boundaries** (`title`, `arc_summary`, `start_date`), not episode
  lists; a 33-episode list truncated mid-JSON. `_seasons_from_plan` derives the partition.
- **Dates are not zero-padded.** Order episodes with `date_key` (an integer tuple).
- **Structured output can parse and still fail the schema** (GLM returned a list as a JSON
  string). `call_structured` retries a `ValidationError` three times, then raises.
- **GLM reasoning tokens share `max_tokens`.** `surface-judge-max-tokens` is 16384 because
  4096 truncated the judge mid-reasoning.
- **Escalation is inert** while `surface-model-judge` equals `surface-model-escalate`; point
  escalate at a different model to re-enable it.

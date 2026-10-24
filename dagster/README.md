# dagster — the astra pipeline's Dagster code location

`definitions.py` loads the whole session pipeline (scribe → linguist → mouthpiece, plus
heartwood) as one code location, `astra-pipeline`. Each app registers its own assets,
sensors, schedules and jobs in its `assets.defs`; `definitions.py` merges them
(`dg.Definitions.merge`) and adds `pipeline_failure_alert`. `dagster/` is the uv workspace
member `astra-pipeline`: its `pyproject.toml` lists the pipeline apps and the Dagster server
packages, so all of them are locked in `uv.lock`. The image
`astra-dagster:local` (`dagster/Dockerfile`) runs as three compose services: `dagster-code`
(the gRPC code server, which also runs every run worker), `dagster-webserver` (UI at
http://localhost:10350) and `dagster-daemon` (sensors, schedules, run queue). Run and event
storage is Postgres (`dagster-postgres`). `dagster.yaml` caps the queue at 3 concurrent runs
and at 1 run tagged `astra/heartwood`, and fails zombie runs whose worker died.

## Asset graph

Every per-session asset shares one dynamic partition set, `sessions`
(`astra_pipeline_resources.partitions`), keyed by session date (`YYYY-M-D`, not
zero-padded). The apps hand off through real asset dependencies, so the UI shows the whole
lineage, and one run can materialize a session across apps.

| Sensor | Launches | When |
|---|---|---|
| `craig_drop_sensor` | `session_tracks` → `session_audio` ∥ `session_transcript` → `session_cleanup` | a Craig zip in `scribe.incoming-path` whose date is not a session yet; it adds the key to `sessions` (the only code that does) |
| `scribe_output_sensor` | `session_transcripts` → `session_episode_summary` | `session_transcript` is materialized, its `transcript_not_empty` check passed, and `script.json` exists |
| `linguist_output_sensor` | `session_digest` → `session_brief` → `session_script` → `session_audio_clips` → `session_episode` | `session_episode_summary` is materialized (the chronicle gate) and a canonical transcript exists |
| `heartwood_sensor` | `session_wiki` (waits for the host agent) | `session_transcripts` is materialized and the transcript is a faerrin campaign |
| `campaign_timeline_schedule`, hourly | `campaign_timeline` (unpartitioned, after `session_episode_summary`) | always; a no-op until a summary changes |

The cross-app dependencies are `session_transcripts` on `session_transcript`,
`session_digest` on `session_transcripts` and `session_episode_summary`, and `session_wiki`
on `session_transcripts`. A downstream sensor launches its stage for a session only if the
stage's first asset was never tried for it: no materialization and no run of any status,
queued, running, failed or canceled (`ready_sessions` counts every planned
materialization). Each request carries the run key `<stage asset>:<session>`, and the
sensor's cursor keeps a ledger of the sessions it launched. So a failed or terminated stage
stays as it is until you re-execute it, and re-running an upstream asset by hand never
re-launches a paid stage. Eager automation (pipe-4c) is not on yet.

### Blocking checks

scribe's assets carry blocking, per-session asset checks (0037 PIPE-12), built with
`session_check` (`astra_pipeline_resources.partitions`). Each shows per session on the
asset's Checks tab.

| Check | On | Fails when |
|---|---|---|
| `single_recording` | `session_tracks` | two real Craig zips (different recording ids) carry the session date |
| `no_undated_recording` | `session_tracks` | an undated zip whose `info.txt` start date is the session is not the recording in use |
| `transcript_not_empty` | `session_transcript` | `script.json` has fewer than 100 segments |

A failed check fails the run, so `pipeline_failure_alert` pages with the session key and
the check's step name, and it skips the rest of that run: the tracks checks stop the Groq
transcription, and the transcript check stops `session_cleanup` (the tracks stay). The
checked asset still counts as materialized, so a sensor would launch the next stage on
it. A stage's `SessionStage.gates` closes that gap: `scribe_output_sensor` launches
linguist only for a session whose latest `transcript_not_empty` result passed
(`blocked_sessions`). A session with no result, from before the checks, is not blocked.
After you fix the cause, re-execute the run from failure: the check runs again, and a
pass opens the gate. Partitioned checks are a Dagster preview; `session_check` hides the
warning.

## Resources

Assets get their dependencies as Dagster resources, declared as parameters, never by
reading config or building clients in the body. The shared ones live in
`libs/py/pipeline-resources` (`astra_pipeline_resources`); each app binds
`default_resources()` in its `defs`, and the values are cached so `Definitions.merge`
sees one object per key.

| Key | Class | Gives |
|---|---|---|
| `astra_config` | `AstraConfig` | `get()`: config.kdl, loaded once per process (model pins, secrets, limits) |
| `pipeline_paths` | `PipelinePaths` | every runtime data path, built from config.kdl (`from_config`) |
| `llm` | `LlmResource` | `client()`: an `astra_llm` client with the OpenRouter key in place |
| `tts` | `astra_mouthpiece.resources.TtsResource` | `build()`: ElevenLabs or the mock, per `mouthpiece.tts-provider` |

A new asset parameter named after a key gets that resource. Don't name one `config`:
Dagster reserves it for run config. Tests materialize with `dg.materialize(...,
resources=...)`, using `astra_pipeline_resources.testing` (`paths_under(tmp_path)`,
`FakeConfig`, `FakeLlm`); the four apps' `tests/` hold an example each. Sensors still
read config directly.

The episode catalog and the akasha snapshot are not assets: the host recipes
`just mouthpiece-publish` and `uv run akasha-snapshot` build them (the snapshot needs node,
which the image lacks). `pipeline_failure_alert` logs one ERROR
per failed run on `service.name=astra.pipeline`, and the SigNoz rule "astra error/fatal logs"
pages Discord.

## Operations

### Deploy pipeline code

The pipeline code is baked into the image, so a change to any pipeline app is live only after
`just deploy dagster-code dagster-daemon dagster-webserver` (from pushed `main`). Check the UI
for in-flight runs first: a deploy kills running workers, and a waiting `session_wiki` run
fails (its host request still publishes). `just deploy --restart dagster-code` restarts
without a rebuild and keeps the injected secrets.

### Re-execute a failed run

Sensors never re-launch a stage that was tried for a session, so a failed session stays
failed until you re-execute it. In the UI, open the run and choose "Re-execute from failure". With GraphQL:

```sh
curl -s http://localhost:10350/graphql -H 'Content-Type: application/json' -d \
  '{"query":"{ runsOrError(filter: {tags: [{key: \"dagster/partition\", value: \"2026-10-5\"}], statuses: [FAILURE]}) { ... on Runs { results { runId jobName status } } } }"}'
curl -s http://localhost:10350/graphql -H 'Content-Type: application/json' -d \
  '{"query":"mutation { launchRunReexecution(reexecutionParams: {parentRunId: \"<RUN_ID>\", strategy: FROM_FAILURE}) { __typename ... on LaunchRunSuccess { run { runId } } ... on PythonError { message } } }"}'
```

`FROM_FAILURE` reruns the failed step and everything after it, reusing finished upstream
outputs, so it does not repeat paid LLM steps whose files exist. `ALL_STEPS` reruns the whole
run.

### Materialize by hand in the container

```sh
docker exec astra-dagster-code sh -c 'cd /opt/dagster/app && dagster asset materialize \
  -f definitions.py --select session_audio_clips,session_episode --partition 2026-10-5'
```

- Run from `/opt/dagster/app`, not `/repo`. Use `sh -c`: a login shell (`sh -lc`) resets PATH
  and `dagster` is not found (the full path is `/opt/venv/bin/dagster`).
- For a run longer than a few minutes, use `docker exec -d … > <log> 2>&1` and read the log.
  Killing a client `docker exec` leaves the run alive. The image has no `pkill`; find the PID
  through `/proc/*/cmdline` and `kill` it. Never `pkill -f` from a tool shell: the pattern
  matches the shell's own command line.
- A CLI materialize exports no telemetry. When you need traces, launch from the UI or with
  GraphQL `launchRun` (location `astra-pipeline`, repository `__repository__`, job
  `__ASSET_JOB`).
- A manual materialize bypasses sensor gates, such as mouthpiece's chronicle gate.
- The container has no `git`, `node` or `time` builtin. Bracket timings with `date +%s`.

### Re-run a session from scratch

1. Deploy any code fix first, and check for in-flight runs: a deploy kills them.
2. Delete the session's outputs: `/ruby/data/astra-state/scribe/data/saved/<date>`,
   `/ruby/data/astra-state/scribe/tmp/<date>` and the astra-data files
   `linguist/data/<date>*.json` (linguist-commit commits the deletion).
3. Materialize the stages you want for the partition in one run. Dagster orders them by
   their dependencies. In the UI, select the assets and choose "Materialize" with the
   partition, or:

   ```sh
   docker exec astra-dagster-code sh -c 'cd /opt/dagster/app && dagster asset materialize \
     -f definitions.py --partition 2026-9-7 --select \
     session_tracks,session_audio,session_transcript,session_cleanup,session_transcripts,session_episode_summary'
   ```

   Add the mouthpiece assets (paid LLM and TTS) and `session_wiki` (a paid host agent run)
   only if they should rerun.

Don't delete the partition: the sensors would not re-launch the stages anyway, because
each stage was already tried for that session.

**Don't delete runs.** A run's planned materializations are how Dagster remembers that a
stage was tried. Deleting the run deletes them; then only the sensor's cursor ledger keeps
the sensor from launching that paid stage again, and resetting the cursor would launch it.

### Add or rename a stage

Register a new asset, sensor, schedule or job in its app's `assets.defs`, then add its name
to the pinned sets in `tests/test_definitions.py`. A per-session asset uses `sessions`
from `astra_pipeline_resources.partitions` and declares its upstream in `deps`. Never
rename an existing one: Dagster keys runs, partitions and sensor cursors on the names. A
rename orphans that history, and a renamed partitions definition starts empty, so
`craig_drop_sensor` treats every zip on disk as new and launches paid runs.

A new stage with its own sensor on `ready_sessions` would launch for every old session
whose upstream is done, because the stage was never tried for any of them. Before it goes
live, mark the old sessions materialized with a runless materialization tagged
`astra/adopted` (the pattern in `dagster/migrate_sessions.py`).

### The sessions migration (0037 pipe-4b)

Until 2026-10 each app had its own partition set (`scribe_sessions`, `linguist_sessions`,
`mouthpiece_sessions`, `heartwood_sessions`) and the sensors chained them by files on
disk. `dagster/migrate_sessions.py` (in the image at `/opt/dagster/app`) folds them into
`sessions`.

- The default is a dry run that writes nothing. It prints the plan and exactly what each
  sensor would launch once the migration is done, with the sensors' own file checks.
- `--apply` refuses while a run is in flight, and refuses unless that launch list is empty
  or `--allow-launch N` names its length. It adds every old key to `sessions`
  (materialization history is keyed on asset key and partition key, so it shows as
  materialized again). It marks the sessions the old sensors adopted without running as
  materialized (`astra/adopted`, so the paid stages never replay them), each stage's first
  asset last, so an interrupted run is completed by a rerun. It then recomputes the launch
  list from the written state and only if it still matches sets the instance key
  `astra/sessions-migration`. It is idempotent.
- Every sensor skips, with a skip reason naming the command, while the old sets hold keys
  and that key is unset. The old sets stay in Postgres.
- `--down --apply` prepares a rollback to the old code: it adds the sessions the new code
  handled to the old sets and blanks the key, so a later roll-forward migrates again and
  copies the sessions the old code added meanwhile.

```sh
docker exec astra-dagster-code sh -c 'cd /opt/dagster/app && python migrate_sessions.py'
docker exec astra-dagster-code sh -c 'cd /opt/dagster/app && python migrate_sessions.py --apply'
```

## Traps

- **Stale image.** A new asset added to a sensor's target is not live until the deploy. A
  one-shot per-partition asset that a stale image skipped never runs on its own; materialize
  it by hand for that partition.
- **The chronicle gate is a Dagster materialization.** mouthpiece launches when
  `session_episode_summary` is materialized, not when its file exists. An episode file that
  the host `backfill_chronicle.py` wrote does not open the gate; materialize
  `session_episode_summary` for the partition instead.
- **Secrets come only from `just deploy`.** deploy.sh decrypts SOPS and exports the keys that
  the compose `x-dagster-env` anchor passes in. A container started with plain
  `docker compose up -d` gets empty keys, and paid steps fail with "needs the … secret".
- **Adopted sessions.** Before the shared set, `linguist_output_sensor` and
  `heartwood_sensor` registered the whole backlog with no runs (cursor `adopted`). The
  sessions migration turned that into runless materializations tagged `astra/adopted`
  (42 mouthpiece sessions, 54 heartwood sessions on 2026-10-23), so the UI shows them as
  materialized although no Dagster run produced them. The old cursors are unused now.
- **Retries cost money.** mouthpiece's external-API steps carry a `RetryPolicy` (3 retries,
  exponential from 120 s), and every retry re-bills. Deterministic 4xx errors raise
  `dg.Failure(allow_retries=False)`; keep it that way for new provider errors.
- **One process per step.** The multiprocess executor runs each asset in its own process, so
  assets cannot share memory or a per-step temp dir (scribe persists tracks to
  `scribe.tmp-path`). Each step also gets its own trace ID; compare span timestamps to prove
  two steps overlapped.
- **Writable paths.** Containers run as uid 1000 and the image is root-owned. An asset that
  writes anywhere except a bind-mounted data dir fails with EACCES at run time. A new data
  path needs an identical-path mount in `deploy/docker-compose.yml` and a dir in deploy.sh
  `init_artifacts`.
- **No `git` in the image.** `subprocess.run(["git", …])` raises `FileNotFoundError` even with
  `check=False`; catch `OSError`.
- **No `from __future__ import annotations`** in asset modules: Dagster rejects the
  stringified context type.
- **SigNoz search.** Raw trace search does not return custom span attributes. Filter on the
  attribute to read it (for example `mouthpiece.continuity_episodes = 6`).

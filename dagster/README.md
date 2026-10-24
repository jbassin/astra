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

Each app has its own dynamic partitions, keyed by session date (`YYYY-M-D`, not
zero-padded). Apps hand off through files on disk and sensors, not Dagster `deps`.

| Partitions | Trigger | Assets |
|---|---|---|
| `scribe_sessions` | `craig_drop_sensor`: a new Craig zip in `scribe.incoming-path` | `session_tracks` → `session_audio` ∥ `session_transcript` → `session_cleanup` |
| `linguist_sessions` | `scribe_output_sensor`: a new `scribe/data/saved/<date>/script.json` | `session_transcripts` → `correction_candidates`, `session_episode_summary` |
| (none) | `campaign_timeline_schedule`, hourly | `campaign_timeline` |
| `mouthpiece_sessions` | `linguist_output_sensor`: a new transcript whose chronicle episode exists | `session_digest` → `session_brief` → `session_script` → `session_audio_clips` → `session_episode` |
| `heartwood_sessions` | `heartwood_sensor`: a new faerrin-world transcript | `session_wiki` (waits for the host agent) |

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

Sensors never re-fire a partition that already exists, so a failed session stays failed until
you re-execute it. In the UI, open the run and choose "Re-execute from failure". With GraphQL:

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

1. Deploy any code fix first. If you delete partitions while old code runs, the old sensor
   re-fires and the redeploy then kills the new run.
2. Delete the session's outputs: `/ruby/data/astra-state/scribe/data/saved/<date>`,
   `/ruby/data/astra-state/scribe/tmp/<date>` and the astra-data files
   `linguist/data/<date>*.json` (linguist-commit commits the deletion).
3. Delete the partitions (repeat for `linguist_sessions`, and for `mouthpiece_sessions` or
   `heartwood_sessions` if they exist and should rerun):

   ```sh
   curl -s http://localhost:10350/graphql -H 'Content-Type: application/json' -d \
     '{"query":"mutation { deleteDynamicPartitions(repositorySelector: {repositoryLocationName: \"astra-pipeline\", repositoryName: \"__repository__\"}, partitionsDefName: \"scribe_sessions\", partitionKeys: [\"2026-9-7\"]) { __typename } }"}'
   ```

4. `craig_drop_sensor` registers the session again within about 30 s and the cascade runs.
   Leave old runs in place; deleting runs is not needed.

### Add or rename a stage

Register a new asset, sensor, schedule or job in its app's `assets.defs`, then add its name
to the pinned sets in `tests/test_definitions.py`. Never rename an existing one: Dagster keys
runs, partitions and sensor cursors on the names. A rename orphans that history, and a
renamed partitions definition starts empty, so its sensor treats every session on disk as
new and can launch paid runs.

## Traps

- **Stale image.** A new asset added to a sensor's target is not live until the deploy. A
  one-shot per-partition asset that a stale image skipped never runs on its own; materialize
  it by hand for that partition.
- **Secrets come only from `just deploy`.** deploy.sh decrypts SOPS and exports the keys that
  the compose `x-dagster-env` anchor passes in. A container started with plain
  `docker compose up -d` gets empty keys, and paid steps fail with "needs the … secret".
- **Backlog adoption.** A sensor treats "files on disk minus registered partitions" as new.
  `linguist_output_sensor` and `heartwood_sensor` adopt the backlog on their first evaluation:
  they register every existing session with no runs and set the cursor to `adopted`. The
  cursor lives in Postgres and survives deploys. Resetting it re-adopts; reprocessing history
  is a manual backfill.
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

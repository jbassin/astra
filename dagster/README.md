# dagster — the astra pipeline's Dagster code location

`definitions.py` loads the whole session pipeline (scribe → linguist → mouthpiece, plus
heartwood) as one code location, `astra-pipeline`. Each app registers its own assets,
sensors, schedules and jobs in its `assets.defs`; `definitions.py` merges them
(`dg.Definitions.merge`) and adds `pipeline_failure_alert`. `dagster/` is the uv workspace
member `astra-pipeline`: its `pyproject.toml` lists the pipeline apps and the Dagster server
packages, so all of them are locked in `uv.lock`. The image
`astra-dagster:local` (`dagster/Dockerfile`) runs as three compose services: `dagster-code`
(the gRPC code server, which also evaluates sensors and schedules), `dagster-webserver` (UI at
http://localhost:10350) and `dagster-daemon` (sensor ticks, schedules, run queue). Each run
gets its own container from the same image (the Docker run launcher, ADR 0030; see "Run
containers" below). Run and event storage is Postgres (`dagster-postgres`). `dagster.yaml`
caps the queue at 3 concurrent runs and at 1 run tagged `astra/heartwood`, and fails zombie
runs whose container died. All three services have compose healthchecks: the code server's
gRPC health check, the webserver's `/server_info`, and `dagster-daemon liveness-check` (every
daemon heartbeat in the last 5 minutes).

## Run containers

The daemon launches each run as a container (`dagster.yaml` `run_launcher`,
`astra_pipeline_resources.run_launcher.InstanceOnlyDockerRunLauncher`), so a redeploy
of any Dagster service leaves running runs alone. The container runs as uid 1000 on the
`pipeline` and `dagster-db` networks, with the code server's env keys and data binds; the
image and network names come from the `DAGSTER_RUN_*` env in the compose `x-dagster-env`.
`dagster.yaml` repeats the compose env keys and binds, and `tests/test_run_launcher.py`
fails when they drift: a new data path goes in both files. The container carries the label
`astra.role=dagster-run` and removes itself when the run ends; list the live ones with
`docker ps --filter label=astra.role=dagster-run`. Only the daemon mounts the host's Docker
socket and joins its group (`DOCKER_GID`, exported by deploy.sh): the code server, the run
containers and the webserver (reachable on the LAN without auth) do not. A run uses the image
tagged when it launched, so a run launched before a deploy finishes on the old code.

The launcher is Dagster's `DockerRunLauncher` minus its per-run overrides: it ignores the
`container_context` and `container_image` stored in a run's code origin. The daemon reads
that origin from Postgres, whose password every run container holds, so honouring it would
let anyone who can write the run database have the daemon start a privileged container with
the host mounted. Every run container gets exactly what `dagster.yaml` says
(`libs/py/pipeline-resources/tests/test_run_launcher.py` launches a crafted run to prove it).

### Terminate a run

The UI's "Terminate" (and the GraphQL `terminateRun`) does not stop a run's container: the
webserver has no Docker socket, so the run sits at `CANCELING` (the mutation returns HTTP
500) while the container keeps running, paid steps included. Terminate with:

```sh
just pipeline-terminate <run-id>         # asks first; --yes skips the question
```

It runs the cancel inside `astra-dagster-daemon` through the instance's run coordinator: a
queued run is canceled, a running one (also one already stuck at `CANCELING`) has its
container stopped and ends `CANCELED`. Exit 0 also covers a run that had already finished;
2 = no such run, 1 = the launcher could not stop it (`libs/py/ops/src/astra_ops/pipeline.py`).

## Asset graph

Every per-session asset shares one dynamic partition set, `sessions`
(`astra_pipeline_resources.partitions`), keyed by session date (`YYYY-M-D`, not
zero-padded). The apps hand off through real asset dependencies, so the UI shows the whole
lineage, and one run can materialize a session across apps.

| Sensor | Launches | When |
|---|---|---|
| `craig_drop_sensor` | `session_tracks` → `session_audio` ∥ `session_transcript` → `session_cleanup` | a Craig zip in `scribe.incoming-path` whose date (an undated name: its `info.txt` start date) is not a session yet; it adds the key to `sessions` (the only code that does) |
| `linguist_automation` | `session_transcripts` → `session_episode_summary` | `session_transcript` got a new materialization, its `transcript_not_empty` check passed, and `script.json` exists |
| `mouthpiece_automation` | `session_digest` → `session_brief` → `session_script` → `session_audio_clips` → `session_episode` | `session_episode_summary` got a new materialization (the chronicle gate) and a canonical transcript exists |
| `heartwood_automation` | `session_wiki` (waits for the host agent), tagged `astra/heartwood` | `session_transcripts` got a new materialization and the transcript is a faerrin campaign |
| `campaign_timeline_sensor` | `campaign_timeline` (unpartitioned, after `session_episode_summary`) | a `session_episode_summary` materialization newer than its cursor, no `campaign_timeline` run in flight, and the episode files no longer match `seasons.json`'s `inputs_hash` |

The cross-app dependencies are `session_transcripts` on `session_transcript`,
`session_digest` on `session_transcripts` and `session_episode_summary`, and `session_wiki`
on `session_transcripts`. The three `*_automation` sensors are Dagster automation condition
sensors; each evaluates the conditions on one app's stage ("Stage automation" below). A
stage launches for a session only if the stage's first asset was never tried for it: no
materialization and no run of any status, queued, running, failed or canceled
(`ready_sessions` counts every planned materialization). Each stage launches at most once
per session, and never for a session that existed before its sensor's first tick. So a
failed or terminated stage stays as it is until you re-execute it, and re-running an
upstream asset by hand never re-launches a paid stage.

`campaign_timeline_sensor` stays a plain sensor, with the same never-retry rule. An
automation condition cannot express it faithfully: it compares `seasons.json`'s
`inputs_hash` with the episode files before it asks for a run, drops the trigger when they
match, and keeps it while a rebuild is in flight, so it checks the inputs again after that
run. Its cursor is the storage id of the newest summary materialization it has seen. It checks the episode inputs before it asks
for a run, so a summary that changed nothing (an unmatched session's skip) starts no run,
and a failed rebuild stays failed until you re-execute it. A summary written outside
Dagster (the host chronicle backfill) does not trigger it: materialize `campaign_timeline`
by hand. There is no schedule since 0037 pipe-10.

### Stage automation

Each stage's first asset carries `stage_automation(<STAGE>)`
(`astra_pipeline_resources.partitions`). The stage's later assets carry `follows(...)`, so
they join the same run and never launch on their own. A session is requested when all
three parts of the first asset's condition hold:

1. **Upstream updated.** The stage's upstream asset got a new materialization for the
   session since the stage was last requested or materialized (`newly_updated` on that one
   dependency, latched with `since_last_handled`). Dagster's `newly_updated` is empty on a
   sensor's first evaluation, so no session that existed before then is launched (no
   backfill). The latch holds while a gate or the file check is still false.
2. **Never requested.** This condition never requested the session (`newly_requested`,
   latched since the first evaluation). It replaces the old run key, so a stage is not
   requested twice, even if its run is deleted.
3. **Stage ready** (`StageReady`, a custom condition). The old sensors' rule, unchanged:
   upstream materialized, gates passed, the stage's first asset never materialized nor
   planned in any run, and the stage's file check. Dagster's own `missing()`,
   `in_progress()` and `execution_failed()` cannot express "never tried": a canceled run
   counts as none of them.

This is not Dagster's `eager()`, which fires again whenever a dependency updates. The
sensors run in the code server (`use_user_code_server`, which the custom condition needs)
and ask for one plain run per session, so `dagster.yaml`'s queue limits apply and
heartwood's runs carry `astra/heartwood`. They evaluate every 30 s.

**Go-live.** The three sensors ship stopped (`default_status=STOPPED`), so the deploy that
brings them launches nothing after scribe. In order:

1. Deploy: `just deploy dagster-code dagster-daemon dagster-webserver`.
2. Run the read-only pre-flight: `just pipeline-automation-preflight`.
3. If it lists held sessions, settle each one: launch a "just finished" one by hand, and
   adopt the old ones with `just pipeline-automation-adopt` (it lists what it will mark and
   asks first). Run the pre-flight again until it exits 0.
4. Right away, start `linguist_automation`, `mouthpiece_automation` and
   `heartwood_automation` under Automation in the UI. Dagster keeps a started sensor
   running across deploys.

The pre-flight (`dagster/automation_preflight.py`) runs in a read-only Postgres session
(`PGOPTIONS=-c default_transaction_read_only=on`), so it launches and writes nothing. It
evaluates each sensor's first two ticks and prints every run they would request. The real
first tick happens at Start, and the second tick here covers only the seconds between its
two evaluations, so run it immediately before starting the sensors. It then lists, per
stage, the **held** sessions: never tried, with their upstream done. None launches on its
own, but a new materialization of its upstream (a manual re-run) would launch it. Each
line shows when the upstream finished:

- **just finished** (within `--recent-hours`, default 24): the upstream probably finished
  while the sensors were stopped, so no tick will ever launch it (no backfill). Launch the
  stage by hand.
- **old, its run was deleted**: the old sensor's ledger (its cursor, still stored for
  `scribe_output_sensor`, `linguist_output_sensor` or `heartwood_sensor`) says it launched
  the stage, but the run is gone. Adopt it.
- **old**: adopt it, or launch it by hand if it should run.

Exit codes: 0 safe to start; 1 runs would be requested or sessions are held; 2 it could not
finish (the sessions migration is pending, a refused write, or any other error).

The adoption (`dagster/adopt_held_sessions.py`) writes a runless materialization of the
stage's first asset tagged `astra/adopted`, which counts as tried. It marks every held
session except the just-finished ones by default; `--stage <first asset>` and `--session
<key>` narrow it, `--include-recent` adds the recent ones, and `--yes` skips the question.
It refuses while a stage automation sensor is running. It marks only the first asset: a
materialization of `session_episode_summary` would wake `campaign_timeline_sensor`.

**Pause in an emergency.** Stop the app's sensor in the UI (Automation, then the sensor's
toggle), or all three. A stopped sensor requests nothing. Runs already queued or running
go on; terminate them with `just pipeline-terminate`. Stopping keeps the sensor's cursor,
so on restart it catches up on the upstream updates made while it was stopped, under the
same rules. To restart without catching up, clear the cursor first. That also forgets
which sessions it requested, so only the never-tried rule then guards a session whose run
was deleted.

```sh
curl -s http://localhost:10350/graphql -H 'Content-Type: application/json' -d \
  '{"query":"mutation { setSensorCursor(sensorSelector: {repositoryLocationName: \"astra-pipeline\", repositoryName: \"__repository__\", sensorName: \"mouthpiece_automation\"}) { __typename } }"}'
```

The conditions keep their latches in the sensor's cursor, which Dagster stores per sensor
under its code location, repository and sensor name. Exactly these reset it:

- `setSensorCursor` with no cursor (above), or `dagster sensor cursor --delete <sensor>` in
  the code server container.
- Renaming the sensor, the code location (`astra-pipeline`, `workspace.yaml`) or the
  repository: the renamed sensor is a new sensor with no cursor.
- Losing the `dagster-postgres` data.

Stopping and starting a sensor, a deploy, an image rebuild and editing `StageReady` or a
stage's file check keep the cursor. Editing a latch's own operands (the stage's upstream
asset, or the condition's structure) resets that one latch, and a session waiting on a gate
then needs a manual launch.

### Blocking checks

scribe's assets carry blocking, per-session asset checks (0037 PIPE-12), built with
`session_check` (`astra_pipeline_resources.partitions`). Each shows per session on the
asset's Checks tab.

| Check | On | Fails when |
|---|---|---|
| `single_recording` | `session_tracks` | two real Craig zips (different recording ids) carry the session date |
| `no_undated_recording` | `session_tracks` | an undated zip whose `info.txt` start date is the session is not the recording in use |
| `transcript_not_empty` | `session_transcript` | `script.json` has fewer than 100 segments |

The tracks checks see only the zips present when the run starts. A second recording that
arrives after the session's run is named by `craig_drop_sensor` in one WARN and in its skip
reason instead (scribe README, "Second recording").

A failed check fails the run, so `pipeline_failure_alert` pages with the session key and
the check's step name, and it skips the rest of that run: the tracks checks stop the Groq
transcription, and the transcript check stops `session_cleanup` (the tracks stay). The
checked asset still counts as materialized, so it would trigger the next stage. A stage's
`SessionStage.gates` closes that gap: linguist launches only for a session whose latest
`transcript_not_empty` result passed (`blocked_sessions`). A session with no result, from
before the checks, is not blocked. Behind the gate, linguist's `session_transcripts` itself
fails (no retry, nothing written) on a `script.json` under the same floor
(`astra_sessions.MIN_TRANSCRIPT_SEGMENTS`), so neither such a session nor a hand
materialize publishes an empty transcript. After you fix the cause, re-execute the run from
failure: the check runs again, and a pass opens the gate (the trigger waits for it). The exception is a tracks check fixed by removing or replacing a
zip: the re-execution keeps the old run's `astra/craig-zip` tag, so launch a fresh run
instead (scribe README, "Blocking checks"). Partitioned checks are a Dagster preview; `session_check` hides the
warning.

## Retries

Every asset makes an explicit retry decision, defined once in
`astra_pipeline_resources.retries`. A step that calls a paid external API carries
`retry_policy=EXTERNAL_API_RETRY`: 3 retries, 120 s, 240 s and 480 s after each failure, so a
step rides out a provider outage of about 14 minutes. Those steps are scribe
`session_transcript` (Groq), linguist `session_episode_summary` and `campaign_timeline`
(GLM), and mouthpiece `session_digest`, `session_script` (GLM) and `session_audio_clips`
(ElevenLabs). Every other asset is listed in `NO_RETRY` with the reason: local work, the
~10-minute producer RLM (`session_brief`), and the 15-55 minute heartwood agent run
(`session_wiki`). `tests/test_retry_policies.py` fails for an asset with neither, or with any
other policy, so a new asset needs a decision before it ships.

A retry reruns the whole step and re-bills what the step paid for, with two exceptions that
resume from disk: mouthpiece's TTS clips and its saved script passes (mouthpiece README,
"Resuming paid stages"). A Groq retry re-transcribes every track. A failure a rerun cannot
fix skips the retry: `llm_failures_final` raises `dg.Failure(allow_retries=False)` for a spent
LLM retry budget and for a deterministic provider 4xx (any 4xx except 408, 409, 425 and 429).
The `llm` resource's client applies it to every LLM call, scribe applies it around
transcription, and mouthpiece turns an ElevenLabs 4xx (`TtsClientError`) into the same
failure. A re-execution from failure (see "Re-execute a failed run") resumes the same way.

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
`FakeConfig`, `FakeLlm`); the four apps' `tests/` hold an example each. Sensors and the
stages' file checks still read config directly.

The episode catalog and the akasha snapshot are not assets: the host recipes
`just mouthpiece-publish` and `uv run akasha-snapshot` build them (the snapshot needs node,
which the image lacks). `pipeline_failure_alert` logs one ERROR
per failed run on `service.name=astra.pipeline`, and the SigNoz rule "astra error/fatal logs"
pages Discord.

## Operations

### Deploy pipeline code

The pipeline code is baked into the image, so a change to any pipeline app is live only after
`just deploy dagster-code dagster-daemon dagster-webserver` (from pushed `main`). A deploy that
touches a Dagster service (or the whole stack) refuses with exit 13 while a run is
`NOT_STARTED`, `STARTING`, `STARTED` or `CANCELING` (from the GraphQL API) or while any run
container is running (`astra.role=dagster-run`). It always checks both: a run the UI
terminated is marked `CANCELED` after 180 s while its container keeps going, and the
containers still answer when the webserver is down. Queued runs do not block it. A redeploy no longer kills
runs, so `--force` is safe when you need the deploy now. `just deploy --restart dagster-code`
restarts without a rebuild and keeps the injected secrets (the same check applies).

### Re-execute a failed run

The automation never re-launches a stage that was tried for a session, so a failed session
stays failed until you re-execute it. In the UI, open the run and choose "Re-execute from failure". With GraphQL:

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
- A CLI materialize runs inside the code server, not in a run container, so a deploy of
  `dagster-code` kills it.
- A CLI materialize exports no telemetry. When you need traces, launch from the UI or with
  GraphQL `launchRun` (location `astra-pipeline`, repository `__repository__`, job
  `__ASSET_JOB`).
- A manual materialize bypasses the stages' gates, such as mouthpiece's chronicle gate.
- The container has no `git`, `node` or `time` builtin. Bracket timings with `date +%s`.

### Re-run a session from scratch

1. Deploy any code fix first (the deploy waits for no run to be in flight).
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

Don't delete the partition: the automation would not re-launch the stages anyway, because
each stage was already tried for that session.

**Don't delete runs.** A run's planned materializations are how Dagster remembers that a
stage was tried. Deleting the run deletes them; then only the automation sensor's cursor
(the "never requested" part) keeps that paid stage from launching again, and after a cursor
reset the next upstream materialization would launch it. If you delete one anyway, adopt
the session (`just pipeline-automation-adopt --stage <first asset> --session <key>`).

### Add or rename a stage

Register a new asset, sensor, schedule or job in its app's `assets.defs`, then add its name
to the pinned sets in `tests/test_definitions.py`. Give it a retry decision: the shared
policy or a `NO_RETRY` entry (see "Retries"). A new automation-launched stage gets a
`SessionStage`, `stage_automation` on its first asset, `follows` on the rest, and a
`stage_sensor` (pinned in `AUTOMATION`). Its upstream must be partitioned by `sessions`:
one update of an unpartitioned upstream counts as an update of every session. A per-session
asset uses `sessions`
from `astra_pipeline_resources.partitions` and declares its upstream in `deps`. Never
rename an existing one: Dagster keys runs, partitions and sensor cursors on the names. A
rename orphans that history, and a renamed partitions definition starts empty, so
`craig_drop_sensor` treats every zip on disk as new and launches paid runs.

A new stage launches nothing for old sessions on its first evaluation. But every old
session whose upstream is done counts as never tried, so a manual re-run of its upstream
would launch the stage for it. To prevent that, mark the old sessions materialized with a
runless materialization tagged `astra/adopted` (the pattern in
`dagster/migrate_sessions.py`).

### The sessions migration (0037 pipe-4b)

Until 2026-10 each app had its own partition set (`scribe_sessions`, `linguist_sessions`,
`mouthpiece_sessions`, `heartwood_sessions`) and the sensors chained them by files on
disk. `dagster/migrate_sessions.py` (in the image at `/opt/dagster/app`) folds them into
`sessions`.

- The default is a dry run that writes nothing. It prints the plan and exactly what each
  sensor would launch once the migration is done, with the sensors' own file checks.
- `--apply` refuses while a run is in flight, and refuses unless that launch list is empty
  or `--allow-launch <session key>`, repeated, names exactly the sessions in it (one flag
  per session, whatever stages it launches). It adds every old key to `sessions`
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
  copies the sessions the old code added meanwhile. "Handled" means a materialization, a
  planned run, or an entry in the old stage sensor's stored ledger (`scribe_output_sensor`,
  `linguist_output_sensor`, `heartwood_sensor`). It does not read the stage automation
  sensors' cursors, so a session they launched whose run was then deleted would run again
  under the old code: adopt it first.

```sh
docker exec astra-dagster-code sh -c 'cd /opt/dagster/app && python migrate_sessions.py'
docker exec astra-dagster-code sh -c 'cd /opt/dagster/app && python migrate_sessions.py --apply'
```

## Traps

- **Stale image.** A new asset added to a sensor's target or condition is not live until
  the deploy. A
  one-shot per-partition asset that a stale image skipped never runs on its own; materialize
  it by hand for that partition.
- **The chronicle gate is a Dagster materialization.** mouthpiece launches when
  `session_episode_summary` is materialized, not when its file exists. An episode file that
  the host `backfill_chronicle.py` wrote does not open the gate; materialize
  `session_episode_summary` for the partition instead.
- **Secrets come only from `just deploy`.** deploy.sh decrypts SOPS and exports the keys that
  the compose `x-dagster-env` anchor passes in. A container started with plain
  `docker compose up -d` gets empty keys, and paid steps fail with "needs the … secret".
- **Adopted sessions.** Before the shared set, the old `linguist_output_sensor` and
  `heartwood_sensor` registered the whole backlog with no runs (cursor `adopted`). The
  sessions migration turned that into runless materializations tagged `astra/adopted`
  (42 mouthpiece sessions, 54 heartwood sessions on 2026-10-23), so the UI shows them as
  materialized although no Dagster run produced them. The old cursors are unused now.
- **Retries cost money.** A retry re-bills everything the step paid for that it does not
  cache on disk (see "Retries"). Keep new deterministic provider errors final
  (`dg.Failure(allow_retries=False)`), and give a new paid stage a resume cache before
  giving it the retry.
- **One process per step.** The multiprocess executor runs each asset in its own process, so
  assets cannot share memory or a per-step temp dir (scribe persists tracks to
  `scribe.tmp-path`). Each step also gets its own trace ID; compare span timestamps to prove
  two steps overlapped.
- **Writable paths.** Containers run as uid 1000 and the image is root-owned. An asset that
  writes anywhere except a bind-mounted data dir fails with EACCES at run time. A new data
  path needs an identical-path mount in `deploy/docker-compose.yml` (`x-dagster-volumes`), the
  same bind in `dagster.yaml`'s run launcher `volumes`, and a dir in deploy.sh
  `init_artifacts`.
- **No `git` in the image.** `subprocess.run(["git", …])` raises `FileNotFoundError` even with
  `check=False`; catch `OSError`.
- **No `from __future__ import annotations`** in asset modules: Dagster rejects the
  stringified context type.
- **SigNoz search.** Raw trace search does not return custom span attributes. Filter on the
  attribute to read it (for example `mouthpiece.continuity_episodes = 6`).

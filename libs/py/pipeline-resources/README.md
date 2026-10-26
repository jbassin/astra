# astra-pipeline-resources — what the Dagster pipeline apps share

`astra_pipeline_resources` holds the Dagster resources, the `sessions` partition set and the
stage-launch sensor logic that scribe, linguist, mouthpiece and heartwood share, plus the run
launcher `dagster/dagster.yaml` names. The Dagster code location (`dagster/`) and the four
pipeline apps import it; the Dagster image installs it. How the pipeline uses these pieces is
in [`dagster/README.md`](../../../dagster/README.md) ("Resources", "Asset graph", "Run
containers").

## Public surface

- **Resources** (`astra_pipeline_resources`). An asset declares one as a parameter named after
  its key:
  - `astra_config` (`AstraConfig`): `get()` returns the loaded `config.kdl`, parsed once per
    process (`loaded_config()`).
  - `pipeline_paths` (`PipelinePaths`): every runtime data path the assets read or write,
    built from config by `from_config`.
  - `llm` (`LlmResource`): `client(caller)` returns a fresh `astra_llm.LiteLLMClient` with the
    OpenRouter key in place, so each asset execution gets a full retry budget.
  `default_resources()` is cached, so every app's `defs` binds the same objects and
  `dg.Definitions.merge` accepts them.
- `llm_failures_final()`: wrap an asset's LLM work in it. A non-retryable `LlmError` becomes
  `dg.Failure(allow_retries=False)`, so the asset's `RetryPolicy` never re-bills a content
  failure; transport errors pass through for the retry.
- **Partitions** (`astra_pipeline_resources.partitions`). `sessions`, the one
  `DynamicPartitionsDefinition` (keys are session dates, `YYYY-M-D`). A downstream stage is a
  `SessionStage`: `stage_automation(stage)` on its first asset, `follows(...)` on the rest, and
  its app's `stage_sensor(...)`. The condition requests one run per session whose upstream got
  a new materialization, whose blocking checks (`session_check`, `blocked_sessions`) passed,
  and whose stage was never tried (`StageReady`, `ready_sessions`), once per session and never
  for a session older than the sensor's first tick (dagster README, "Stage automation").
  `stage_audit` lists the sessions a stage holds back (`held_sessions`, with the old stage
  sensors' cursor ledgers from `old_ledgers`) and marks chosen ones tried (`adopt`), for the
  dagster pre-flight and adoption scripts.
- **Run launcher** (`astra_pipeline_resources.run_launcher`). `InstanceOnlyDockerRunLauncher`
  is Dagster's Docker launcher, except that it ignores the container settings and image a run's
  stored code origin carries; every run container gets exactly what `dagster.yaml` says.
- **Test helpers** (`astra_pipeline_resources.testing`). `paths_under(tmp_path)`, `FakeConfig`,
  `FakeLlm`, instance helpers (`sessions_instance`, `mark_materialized`, `fail_partition`,
  `queue_partition`, `cancel_partition`), `stored_sessions_instance` and `seed_sensor_state`
  (a temporary instance that stores sensor rows, and a row to seed), and `automation_tick`, one
  tick of an automation sensor that returns its run requests and cursor without launching
  anything.

## Config

`PipelinePaths.from_config` reads `scribe.incoming-path`, `scribe.tmp-path`,
`scribe.data-path`, `linguist.ingest-saved-dir`, `linguist.script-path`,
`data.linguist-data`, `data.linguist-transcripts`, `data.linguist-timeline`,
`data.akasha-content`, `mouthpiece.episodes-path` and `heartwood.requests-path`.
`LlmResource` reads `llm.openrouter-api-key`.

## Testing

```sh
uv run pytest libs/py/pipeline-resources
```

`test_run_launcher.py` launches a crafted run to prove the launcher ignores the run's origin.

## Traps

- **Don't name an asset parameter `config`.** Dagster reserves it for run config; the config
  resource's key is `astra_config` for that reason.
- **Never rename `SESSIONS_NAME`.** A renamed partition set starts empty, and
  `craig_drop_sensor` (scribe, the only code that adds keys) would treat every zip on disk as a
  new session.
- **Every stage sensor skips until the sessions migration has run** (`migration_pending`, the
  instance key `astra/sessions-migration`). The dagster README says how to run it.
- **A new runtime data path** goes in `PipelinePaths`, its `from_config`, and `paths_under`,
  and its bind mount goes in both `deploy/docker-compose.yml` and `dagster/dagster.yaml`.
- **Sensors read config directly**, not through these resources.

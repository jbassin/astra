# 0035 — mouthpiece producer wiring: the brief in the live pipeline (spec)

**Status:** FINAL (2026-10-12) — ready to build — adversarial review folded (1 blocker + 3 majors + 7 minors,
evidence spot-checked — see §5).
**Scope doc:** `thoughts/shared/research/2026-10-12-mouthpiece-producer-wiring-0035-thoughts.md` (D1–D5 stakeholder-resolved).
**Builds on:** 0034 (`thoughts/astra/specs/0034-mouthpiece-producer-spec.md`) — the producer, `astra_llm.rlm`,
the `brief_block` seam and the newcomer seat guard are built and unchanged here.

## 1. Product

Every new session's recap script is written with a producer brief. When linguist's transcript lands and the
chronicle gate opens, the mouthpiece sensor launches `session_digest → session_brief → session_script →
session_audio_clips → session_episode`. `session_brief` runs the 0034 producer (DeepSeek V4.1 Flash RLM) in
the dagster-code container and writes `episodes/<date>/brief.json`. `session_script` (GLM 5.3) uses that
brief in place of the fixed wiki excerpts and continuity block. If the producer fails, the script falls
back to today's prompt and the episode still ships.

Non-goals: automating or ordering heartwood (D3); a kill switch (D4); re-rendering published episodes;
changing Pass B, the Pass A system prompt or the script model.

## 2. Decisions

Scope decisions D1–D5 carry over verbatim. Build decisions:

- **D35-1 — Deno in the image.** `dagster/Dockerfile`, after `uv sync`:
  `COPY --from=denoland/deno:bin-2.5.6 /deno /usr/local/bin/deno` (tag verified to exist; matches the host's
  2.5.6). `ENV DENO_DIR=/opt/deno DENO_NO_PACKAGE_JSON=1 ASTRA_DENO_CACHED_ONLY=1`. A warm step runs the
  sandbox once **without** cache-only (so the unpinned `npm:pyodide` and `deno.land/std@0.186.0` land in
  `/opt/deno`) and prints `sandbox_version` into the build log:
  `RUN ASTRA_DENO_CACHED_ONLY= python -c 'import sys; from astra_llm.rlm import make_interpreter as mk, sandbox_version as v; i = mk(); i.start(); ver = v(i); print("pyodide:", ver); i.shutdown(); sys.exit(0 if ver else 1)'`
  — `start()` raises on a failed fetch, and a `None` version fails the build (`sandbox_version` swallows
  errors, so without the exit check an empty cache would ship and every brief would fail silently). The
  warm layer sits after the workspace COPY + `uv sync`, so any source change re-runs it and may pull a newer
  unpinned Pyodide — accepted; the build log shows the version.
  Then `chown -R 1000:1000 /opt/deno` (folded into the existing chown `RUN`). The build needs network
  (it already does for `uv sync`).

- **D35-2 — Cache-only sandbox.** `astra_llm.rlm.make_interpreter()` reads `ASTRA_DENO_CACHED_ONLY`; when
  set (non-empty) it builds `PythonInterpreter(deno_command=["deno", "run", "--cached-only",
  f"--allow-read={runner},{deno_dir}", runner])`, the same read grants dspy computes by default (runner path +
  `DENO_DIR`; verified on the host). Set but `DENO_DIR` unresolvable → raise `RuntimeError` (never grant
  `--allow-read=<runner>,None`). Unset → today's `PythonInterpreter()`, so host runs (heartwood, the
  experiment CLI) are unchanged. A runtime can then never fetch a different Pyodide; a rebuild can, and the
  build log shows it.

- **D35-3 — Live, read-only wiki mount.** Add
  `- /ruby/data/experiments/astra/apps/akasha-backend/content:/repo/apps/akasha-backend/content:ro` to
  `&dagster-pipeline-volumes`. `CONTENT_DIR` resolves to that path in the container (editable install under
  `/repo`; verified in the running container). Nothing writes into the content tree from Dagster: the
  `akasha_corpus_snapshot` asset (and the host `akasha-snapshot` recipe) write `apps/akasha-backend/snapshot/`. This also freshens the fallback path's grounding, which today reads the
  copy baked in at the last `just up`.

- **D35-4 — `session_brief` asset.** Partitioned by `mouthpiece_sessions`, `deps=[session_digest]`,
  `group_name="mouthpiece"`, **no retry policy** (a 10-minute paid RLM must not run 4×; litellm already
  retries transient provider errors per call). Body:
  1. `run_producer(key, run_dir=episodes/<key>/producer/<run_id>/)` (`new_run_id()`), after
     `shutil.rmtree(episodes/<key>/producer/)` so only the latest run's artifacts are kept and `summary.json`
     carries a real run id.
  2. `ok` or `incomplete` with a brief → write `episodes/<key>/brief.json` with `_atomic_write`
     (`brief.model_dump_json(indent=2)`).
  3. `failed` → **delete** any stale `episodes/<key>/brief.json`, log WARN
     `"mouthpiece brief %s failed — script will fall back: %s"`, and still return a `MaterializeResult`
     (D2: the episode must not block).
  4. The whole `run_producer` call is wrapped in `except Exception` → same as `failed` (setup errors raise
     before its internal `try`: `load_config`, `load_inputs`, `ProducerTools.__init__`'s corpus load,
     `ensure_openrouter_env`). `BaseException` propagates (run.py re-raises it on purpose).
  Metadata: `status`, `cost_usd`, `iterations`, `moments`, `callbacks`, `citations_bad`. Span
  `mouthpiece.session_brief` wraps it (the producer's own `mouthpiece.producer.run` span nests inside).

- **D35-5 — `session_script` reads the brief.** `deps=[session_digest, session_brief]`. Load
  `episodes/<key>/brief.json` if present; validate with `ProducerBrief`. Valid →
  `brief_block = render_brief(brief, newcomer=hosts.c.name if hosts.c else "The newcomer")` and
  `build_episode_script(..., brief_block=brief_block)` (grounding + continuity are skipped by the seam; the
  roster stays). Missing or invalid → today's path unchanged, WARN on invalid. Span attribute
  `mouthpiece.script.brief = "used" | "fallback"`; counter `astra.mouthpiece.script.brief{outcome}`
  (lazy, created at first use). A fallback does **not** page (Class A is ERROR-only) — scope default.

- **D35-6 — Wiring.** Add `session_brief` to the sensor's `target=[...]` (between digest and script), to
  `dagster/definitions.py`'s asset list, **and** to `assets.py`'s own `defs` (`Definitions` at the module
  foot, asserted by `test_assets.py`'s key lists — update those). The partition registration and backlog-adoption logic are
  untouched.

- **D35-7 — Telemetry + no git in the container.** The producer exports through the code location's existing
  `init_telemetry` (service `astra.pipeline`, `dagster/definitions.py:41`; in-cluster collector). The image
  has no git binary, and `subprocess.run` raises `FileNotFoundError` regardless of `check=False` — so
  `wiki_head()` must catch `OSError` and return `{"sha": None, "dirty": False}` (unit test with git off
  PATH). Without this fix every container run would raise before the RLM starts and silently fall back.

- **D35-8 — Shared brief path helper.** `inputs.brief_path(key, root=None) -> Path` and
  `inputs.read_brief(key, root=None) -> ProducerBrief | None` (None on missing; raises on invalid so the
  caller can WARN). Both assets use them; the experiment CLI is unchanged.

## 3. Slices

- **S1 — Sandbox + image + mount (D35-1..D35-3).** `make_interpreter` cache-only branch + tests
  (`deno_command` shape with the env set; default untouched; a real-Deno cache-only execute that skips
  without deno). Dockerfile + compose edits. Local proof: `docker compose build dagster-code` succeeds and its
  log shows the Pyodide version; a `docker run --rm` of the image as `1000:1000` executes `print(1)` in the
  cache-only sandbox **with networking disabled** (`--network none`). Gate A.
- **S2 — Assets (D35-4..D35-8).** `session_brief`, `session_script` change, helpers, sensor + definitions.
  Unit tests with a fake `run_producer` (ok / incomplete / failed / setup error) and a stub LLM client for the
  script path (brief used vs fallback vs invalid brief). Gate B.
- **S3 — Deploy + live proof.** `just up` (rebuilds dagster-code **with** SOPS env — never plain
  `docker compose up`). Then launch a run of **only** `session_brief` for partition 2026-10-5 through the
  webserver's GraphQL `launchRun` (selection `session_brief`, tag `dagster/partition=2026-10-5`) — the real
  daemon → run-worker path, which exports telemetry (a detached CLI `dagster asset materialize` exports
  none, per memory). PAID ≈ $0.20, flagged. No automation conditions or asset sensors exist and the
  partition is already registered, so nothing downstream (script, TTS) re-runs. It writes `brief.json` +
  `producer/` under the gitignored episodes dir and touches no published artifact (publish reads only
  `script.json` + `digest.json`; seed copies only mp3s). Gates C, D.

Each slice: CI lanes reproduced locally, one Conventional Commit; push after S3.

## 4. Acceptance gates

- **A — cache-only sandbox in the image.** Build log shows the Pyodide version; `docker run --rm
  --network none --user 1000:1000 --entrypoint python <dagster-code image> -c 'from astra_llm.rlm import
  make_interpreter as mk; i = mk(); print(i.execute("print(1)")); i.shutdown()'` prints `1` (proves the
  cache is complete; the unit test proves `--cached-only` is passed); host test suite green (heartwood + producer real-Deno tests still pass).
- **B — asset behaviour.** Tests prove: `wiki_head` without git returns `sha: None`; brief written on ok/incomplete; failed/setup error → no
  `brief.json` (stale one deleted), asset still materializes; script uses a valid brief (Pass A user content
  has `PRODUCER NOTES`, no `WIKI EXCERPTS`) and falls back on missing/invalid; the no-brief prompt is
  byte-identical to before (0034 gate B golden still passes); sensor target and definitions include
  `session_brief`.
- **C — live container run.** `session_brief` for 2026-10-5 materializes in the deployed container: status
  `ok`, `brief.json` written, `producer/summary.json` cost recorded, `mouthpiece.producer.run` and
  `mouthpiece.session_brief` spans visible in SigNoz under service `astra.pipeline`, 0 ERROR logs.
- **D — nothing live changed.** `episodes/2026-10-5/script.json` and its mp3 are byte-identical before and
  after; mouthpiece.iridi.cc unchanged; no TTS spend.

The first real proof of the script path with a brief is the next new session; the memory file records
that it must be checked (`mouthpiece.script.brief="used"` on its span, the episode listened to).

## 5. Adversarial review record (2026-10-12)

One reviewer, verified against the repo and the running container; all folded.

- **Blocker — `wiki_head()` raises without git** (`subprocess.run` → `FileNotFoundError`; the image has no
  git; the call is outside run_producer's `try`) → every container brief would fail and fall back silently.
  → D35-7 catch `OSError` + test.
- **Major — Gate C unpassable via a detached CLI materialize** (exports no telemetry, bypasses the daemon run
  worker). → GraphQL `launchRun`; service named `astra.pipeline`.
- **Major — a failed warm step passes the build** (`sandbox_version` swallows errors). → `start()` + exit 1
  on `None`.
- **Major — setup-error catch too narrow.** → `except Exception` around the whole call.
- **Minors folded:** `assets.py`'s own `defs` + `test_assets.py`; `producer/<run_id>/`; `DENO_DIR` guard;
  warm-layer rebuild drift noted; akasha snapshot asset wording; Gate A's exact command and what it proves;
  memory note that `--select session_script` re-renders now reuse `brief.json`.
- Confirmed: dspy still injects tools/output fields with a `deno_command` override; `DENO_DIR` honoured;
  Debian 13 glibc runs Deno; paths resolve in-container; `OPENROUTER_API_KEY` in the dagster env; no paid
  downstream re-run for 2026-10-5; publish/seed/timers ignore `brief.json` and `producer/`; two concurrent
  runs are safe (date-keyed dirs, read-only cache).

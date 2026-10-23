# mouthpiece producer wiring (0035) — scope

Date: 2026-10-12 · Stage: **Scope** (next: spec via `octo:spec` → `thoughts/astra/specs/0035-mouthpiece-producer-wiring-spec.md`)

## Summary

Put the 0034 producer into the live mouthpiece pipeline. A new Dagster asset, `session_brief`, runs the
producer RLM for each new session between `session_digest` and `session_script`, inside the dagster-code
container. `session_script` uses the brief when one exists and falls back to today's prompt (fixed wiki
excerpts + 6-episode continuity) when it does not. GLM 5.3 keeps writing the scripts; DeepSeek V4.1 Flash
writes the brief.

Why: the 0034 experiment on 2026-10-5 (spec §10) gave a better script with the brief than without (lint
9/10 vs the live 7/10, 19/22 lore names said vs 13/22, callbacks back to May) at about +$0.20 and +10
minutes per session. Stakeholder 2026-10-12: GLM writes the scripts; ship the producer.

## Decisions (stakeholder, 2026-10-12)

| # | Decision | Choice |
|---|---|---|
| D1 | Runtime (0034 D4) | **Deno in the dagster-code image.** The producer is a normal Dagster asset with retries, lineage and alerts. Not chosen: a host step writing `brief.json` for Dagster to wait on. |
| D2 | Producer failure | **Fall back to the old prompt.** The episode still ships with fixed wiki excerpts + continuity; the fallback is logged and visible in SigNoz. Not chosen: failing the episode. |
| D3 | Ordering with heartwood | **Don't wait.** The producer reads the wiki as it is (mounted live, D5 below) and learns tonight's brand-new names from the transcript. heartwood stays a manual run. |
| D4 | Kill switch | **None.** Rolling back means reverting the code. |
| D5 | Script model | **GLM 5.3** (`mouthpiece.model`, unchanged). DeepSeek is the producer only. |

## Verified facts (checked against the repo, 2026-10-12)

**The container reads a stale, image-baked wiki.** `deploy/docker-compose.yml`'s `&dagster-pipeline-volumes`
mounts linguist transcripts/script/data/timeline, scribe dirs and mouthpiece episodes, but **not**
`apps/akasha-backend/content`. `dagster/Dockerfile` COPYs `apps/akasha-backend` at build time, so both
today's `pages_from_corpus(load_corpus())` grounding and any in-container producer see the wiki as of the
last `just up`. heartwood publishes to the host tree between rebuilds. (The 2026-07-30 Ashen Pact memory
already noted the index was "baked in the CURRENT dagster-code image".) Fix: mount the content tree
read-only at `/repo/apps/akasha-backend/content`. This also freshens the fallback path.

**Deno in the image is feasible.** `denoland/deno:bin-2.5.6` exists (matches the host's Deno 2.5.6), so
`COPY --from=denoland/deno:bin-2.5.6 /deno /usr/local/bin/deno` adds the binary. dspy 3.2.1's `runner.js`
imports an **unpinned** `npm:pyodide/pyodide.js` and `deno.land/std@0.186.0`, fetched into `DENO_DIR` on
first run (host cache ≈ 15 MB). A build-time warm run (`make_interpreter().execute("print(1)")`) fills the
cache; then **`deno run --cached-only` works through dspy's `PythonInterpreter(deno_command=[...])`**
(verified on the host: `print(6*7)` → 42). Cache-only means a runtime can never fetch a different Pyodide;
a rebuild can, so the build records the resolved Pyodide version. The image needs `DENO_DIR` set,
`DENO_NO_PACKAGE_JSON=1`, and the cache owned by uid 1000 (containers run as `1000:1000`).

**Asset graph seams.** `session_script` (`assets.py:209`) depends on `session_digest`. The mouthpiece
sensor targets an **explicit list** (`assets.py:376`: digest, script, clips, episode), and
`dagster/definitions.py` lists the assets explicitly too, so a new asset must be added in both places.
`_EXTERNAL_RETRY` = 3 retries, 120 s exponential.

**Telemetry.** In the container the producer exports to the in-cluster collector (the default
`otlp_endpoint`), not the host endpoint the CLI uses. The producer's spans and metrics are already named
`mouthpiece.producer.*` / `astra.mouthpiece.producer.*` (0034 D34-9).

**No git in the container.** `wiki_head()` returns `sha: None` there. Acceptable; the wiki mount is live.

**Re-render recipes keep working.** The audio-only re-render (`--select session_audio_clips,session_episode`)
never touches the brief. A script re-render (`--select session_script`) would reuse `brief.json`;
`--select session_brief,session_script` makes a fresh brief.

## Proposed shape (for the spec to settle)

1. **Image** (`dagster/Dockerfile`): add the Deno binary, `ENV DENO_DIR=/opt/deno DENO_NO_PACKAGE_JSON=1
   ASTRA_DENO_CACHED_ONLY=1`, a warm step after `uv sync` that prints the Pyodide version, and
   `chown -R 1000:1000 /opt/deno`.
2. **`astra_llm.rlm.make_interpreter`** builds the `--cached-only` `deno_command` when
   `ASTRA_DENO_CACHED_ONLY` is set (read grants unchanged: runner path + `DENO_DIR`). Host behaviour
   unchanged.
3. **Compose**: add the read-only wiki mount to `&dagster-pipeline-volumes`.
4. **`session_brief` asset** (deps `[session_digest]`, partitioned like its siblings): runs `run_producer`
   with `run_dir = episodes/<date>/producer/` (trajectory, summary, warnings) and writes
   `episodes/<date>/brief.json` atomically on success. On a `failed` producer it writes no `brief.json`,
   records the error in `producer/summary.json`, logs a WARN, and **still materializes** (D2: the episode
   must not block). Retry policy: none inside Dagster, so a 10-minute paid RLM is not re-run 3×; transient
   provider errors inside the run are already retried by litellm.
5. **`session_script`**: deps `[session_digest, session_brief]`. If `brief.json` exists and validates →
   `brief_block = render_brief(brief, newcomer=hosts.c.name)`, no grounding, no continuity; else the
   current path. Span attribute `mouthpiece.script.brief = "used" | "fallback"`.
6. **Sensor + definitions**: add `session_brief` to the sensor target list and to `definitions.py`.
7. **Docs/memory**: the force-grounding recipe ([[ashen-pact-mouthpiece-grounding]]) only affects the
   fallback path now; note it.

## Costs and risks

- **Cost/time**: ≈ +$0.20 and ≈ +10 minutes per session (2026-10-5: 28 iterations, 607 s).
- **Image size/build**: Deno binary ≈ 100 MB + ≈ 15 MB cache; the warm step needs network at build time.
- **Pyodide drift on rebuild**: the unpinned `npm:pyodide` can change at a rebuild; the build log records
  the version and the spec's container gate re-runs the sandbox.
- **Fallback hides problems**: a silently failing producer would quietly revert episodes to the old prompt.
  The WARN log + `mouthpiece.script.brief="fallback"` attribute make it visible in SigNoz. Default: a
  fallback does **not** page (Class A fires on ERROR only); the episode is fine, just un-briefed.
- **Newcomer seat**: still below the live show (Nell asks in 39% of turns vs 60%); acceptable per the
  stakeholder's ship call, watch it on real episodes.

## Not in scope

- Automating heartwood or ordering it before the producer (D3).
- A kill switch (D4).
- Re-rendering already-published episodes (forward-only, as with every prior mouthpiece change).
- Changing Pass B, the Pass A system prompt, or the script model.

## Open questions

None.

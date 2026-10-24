# astra-ops

The host ops CLI (0037 ops-1a, ops-1b). It holds the logic of the justfile's ops recipes; each
recipe is a one-line wrapper, so systemd units, docs and bots still run `just <recipe>`.
`deploy/deploy.sh` stays bash (it is staged and re-executed by design); astra-ops calls it. Also
still bash: `deploy/doctor.sh`, `deploy/systemd/alert-notify.sh` and `astra-backup.sh` (the
backup recipes are one-line wrappers over it), and cdx-4's `codex-refresh` and `codex-build`.

| just recipe | astra-ops command | confirmation |
| --- | --- | --- |
| `linguist-commit` | `linguist-commit` | LIVE |
| `_astra-data-push` | `astra-data-push` | LIVE |
| `mouthpiece-publish [flags]` | `mouthpiece-publish` | none (writes the clone only) |
| `mouthpiece-seed` | `mouthpiece-seed` | LIVE |
| `akasha-seed` | `akasha-seed` | LIVE |
| `heartwood-agent <date> [flags]` | `heartwood-agent` | PAID + LIVE (`--dry-run`: PAID) |
| `_heartwood-push-deploy` | `heartwood-push-deploy` | LIVE |
| `heartwood-revert <date>` | `heartwood-revert` | LIVE |
| `signoz-rules-check` | `signoz-rules-check` | none (read-only) |
| `signoz-rules-apply [--yes]` | `signoz-rules-apply` | dry run unless `--yes` |
| `host-metrics` | `host-metrics` | none (rewrites one textfile) |
| `heartwood-backfill [from]` | `heartwood-backfill` | PAID + LIVE |
| `_heartwood-backfill-loop [from]` | `heartwood-backfill-loop` | PAID + LIVE (its unit passes `--yes`) |
| `heartwood-backfill-reset` | `heartwood-backfill-reset` | none |
| `heartwood-requests` | `heartwood-requests` | PAID + LIVE |
| `craig-sync` | `craig-sync` | none |
| `units-install [group...]` | `units-install` | none |
| `alert-sudoers-install` | `alert-sudoers-install` | none (sudo asks for the password) |
| `portal-module-install` | `portal-module-install` | none |

Modules: `publish.py` (the astra-data chain), `heartwood.py` (one session, revert),
`backfill.py` (backfill, reset, the request runner), `craig.py` (craig-sync), `host.py` (the
installs), `signoz.py` (the alert rules) and `host_metrics.py`. Each module docstring has the
steps, the lock order and the exit codes.

## SigNoz alert rules as code

`deploy/signoz/rules/*.json` is the source of truth for the SigNoz alert rules; each file is one
rule body as `POST /api/v2/rules` takes it, named after its `alert` (the slug
`just signoz-rules-export` writes). `signoz-rules-apply` matches live rules by that name,
creates the missing ones, replaces the changed ones and never deletes; it prints the plan and
changes nothing without `--yes`. `signoz-rules-check` is the read-only comparison; the watchdog
runs it every 15 minutes and pages on drift or when it has failed for an hour. Until
`signoz_api_key` exists in SOPS the check is skipped: the watchdog logs one INFO line a day and
never pages, `just doctor` and `just signoz-rules-check` warn (the recipe exits 0). Exit codes
of `astra-ops signoz-rules-check`: 0 in sync, 1 drift, 2 could not compare, 3 no API key. The
module docstring
of `signoz.py` says how live and git bodies are compared.

The API key is `ops.signoz-api-key` (`sops:signoz_api_key`; `$SIGNOZ_API_KEY` wins), a SigNoz
service-account key: Viewer is enough for check, apply needs Editor. Create one in the SigNoz
UI (Settings, Service accounts) and add it with
`sops set deploy/sops/secrets.enc.yaml '["signoz_api_key"]' '"<key>"'`.

## Host metrics

`host-metrics` (run every 2 minutes by `astra-metrics.timer`, installed by `just units-install alert`)
writes `ops.metrics-textfile`, which node-exporter serves to SigNoz: TLS certificate expiry
per site in `sites.caddyfile`, container health and restart counts for the `astra` compose
project, the Dagster daemons' heartbeat ages, and the age of the newest transcript and
episode. A probe that cannot run becomes `astra_probe_success 0` and pages through the rule
"astra host probe failing"; the run itself fails only when the file cannot be written. The
module docstring of `host_metrics.py` lists every metric.

## Operations

- **Confirmation.** A paid or live command asks first and proceeds only on y or yes (else
  exit 1). `--yes` skips the question. With no terminal and no `--yes` it exits 64 rather than
  hang. `linguist-commit.service`, `heartwood-request.service`, the heartwood request runner
  and the backfill launch (for its loop) pass `--yes`.
- **Paths.** `--data-root`, `--uv`, `--mouthpiece-episodes`, `--akasha-audio`,
  `--deploy-root`, `--just` and `--craig-drop-dir` default the way the justfile's variables do;
  the wrappers pass the justfile's values. A new global option that takes a value must also go
  in `boot.VALUE_OPTIONS` (a test checks). Data paths come from `config.kdl`, read in-process
  (the same lookup as `python -m astra_ontology_config`).
- **Units.** `deploy/systemd/units.txt` lists the unit groups `units-install` links; `just doctor`
  checks the same list. While a heartwood backfill runs, `units-install` refuses the
  `linguist-commit` and `heartwood-request` groups (and the no-group default), which would
  re-arm what the backfill paused.
- **Locks.** `<data root>/locks/git-publish.lock` and `host-tooling.lock`, taken with flock(2),
  the same kernel lock `flock(1)` takes in deploy.sh. Order and release points: the module
  docstrings of `publish.py` and `heartwood.py`.
- **Telemetry.** `main` runs in `astra_observe.run("astra.ops")`, one `ops.<command>` span with
  the exit code.

- **Startup.** The entry point (`boot.py`, standard library only) takes the host-tooling lock
  shared while it imports the CLI, so it never imports from a venv a deploy is re-syncing; it
  releases the lock before the command runs. Busy for 30 min: it warns and imports anyway.
- **Failures outside a child.** A child that cannot start exits 127 (not found) or 126, an
  output file that cannot open exits 1, and a seed dir that cannot be made fails that seed:
  the same codes and the same "continue the chain" handling as bash.
- **Ctrl-C.** The running child gets SIGINT and up to 30 s to clean up (git's `index.lock`,
  deploy.sh's history record) before it is killed; then the command stops. The backfill loop
  treats SIGTERM and SIGHUP (`systemctl --user stop heartwood-backfill`) the same way, then
  re-arms the bots and exits 143.
- **FUSE.** craig-sync's mount accesses run through `Runner.bounded`: polled, never waited on,
  abandoned past their limit (a child stuck in D state cannot be reaped).

## Traps

- No shell: every child is an argument list. The audio seeds' container scripts are fixed
  strings that receive the host dir as `$1`.
- The tests (`tests/`) script every child argv and lock step in order and fail on any other call;
  a changed step needs its test changed with it. One test runs real git against a bare origin.
- The backfill loop runs `heartwood-agent` in-process for every date, so a deploy during a
  backfill takes effect at the next backfill, not the next date.
- A changed `ExecStart=` (like heartwood-request.service gaining `--yes`) takes effect only after
  `just units-install <group>` or a daemon-reload; until then systemd runs the old line.
- `set positional-arguments` in the justfile forwards each wrapper's arguments verbatim as
  `"$@"` (just 1.23 has no per-recipe attribute for it).

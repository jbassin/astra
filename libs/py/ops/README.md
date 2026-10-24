# astra-ops

The host ops CLI (0037 ops-1a). It holds the logic of the justfile's data-publishing recipes;
each recipe is now a one-line wrapper, so systemd units, docs and bots still run `just <recipe>`.
`deploy/deploy.sh` stays bash (it is staged and re-executed by design); astra-ops calls it.

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

## Operations

- **Confirmation.** A paid or live command asks first and proceeds only on y or yes (else
  exit 1). `--yes` skips the question. With no terminal and no `--yes` it exits 64 rather than
  hang. `linguist-commit.service`, the heartwood request runner and the backfill loop pass
  `--yes`.
- **Paths.** `--data-root`, `--uv`, `--mouthpiece-episodes` and `--akasha-audio` default the
  way the justfile's variables do; the wrappers pass the justfile's values. Data paths come from
  `config.kdl`, read in-process (the same lookup as `python -m astra_ontology_config`).
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
  deploy.sh's history record) before it is killed; then the command stops.

## Traps

- No shell: every child is an argument list. The audio seeds' container scripts are fixed
  strings that receive the host dir as `$1`.
- The tests (`tests/`) script every child argv and lock step in order and fail on any other call;
  a changed step needs its test changed with it. One test runs real git against a bare origin.
- `set positional-arguments` in the justfile forwards each wrapper's arguments verbatim as
  `"$@"` (just 1.23 has no per-recipe attribute for it).

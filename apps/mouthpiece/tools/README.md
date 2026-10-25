# astra-mouthpiece-tools — mouthpiece's hand-run, paid tools

Two host CLIs that run by hand from a checkout: the producer experiment and the
prediction-roundtable special. They reuse the mouthpiece backend (`apps/mouthpiece/py`,
`astra_mouthpiece`) but live in their own package so the Dagster image does not install them
([ADR 0023](../../../docs/adr/0023-mouthpiece-tools-package.md)). The pipeline itself is
described in [`apps/mouthpiece/py/README.md`](../py/README.md).

## Commands

Both need Deno and a warm Pyodide cache for the dspy sandbox; the recipes run
`just mouthpiece-sandbox-warm` first.

- **`astra-mouthpiece-producer`** (PAID, never live; writes only under
  `mouthpiece-producer.artifacts-path`, `/ruby/data/astra-state/mouthpiece/experiments/`):
  - `experiment <date> [--arm ID]... [--reuse-brief RUN_DIR]`: one producer brief (or a
    reused one), the two-pass script once per `mouthpiece-producer.experiment-models` arm, and
    `report.md` comparing them with the live `episodes/<date>/script.json`. Run it as
    `just mouthpiece-experiment <date> [flags]`.
  - `brief <date> [--model ID]`: the producer over one session only. No recipe wraps it; run
    `uv run astra-mouthpiece-producer brief <date>`.
- **`astra-mouthpiece-roundtable`**, run as `just mouthpiece-roundtable <subcommand>`:
  - `dossier [--show SLUG] [--latest DATE]` (PAID): surveys the main campaign into an evidence
    dossier in a fresh run dir under `<artifacts-path>/roundtable-<latest>/`.
  - `script RUN_DIR [--model ID]` (PAID): writes the roundtable script from that dossier
    (`pass_a.txt`, `script.json`, `report.md`).
  - `render RUN_DIR` (PAID and LIVE): copies the script into `episodes/<id>/`, synthesizes it
    with the configured TTS provider, assembles the episode and touches `.last-rendered`, so
    the linguist-commit path unit publishes it to the mouthpiece site.

Every command but `render` prints `RUN_DIR=<path>` as its last line. Exit codes: 0 ok,
1 failed, 2 incomplete (the iteration cap was hit; the output is still usable).

## Config

`mouthpiece-producer` (models, iteration and token caps, `experiment-models`,
`artifacts-path`), `mouthpiece` (episodes path, TTS provider and ElevenLabs key for `render`)
and `llm.openrouter-api-key`. Telemetry goes to the host collector as
`astra.mouthpiece-producer` and `astra.mouthpiece-roundtable`.

## Testing

```sh
uv run pytest apps/mouthpiece/tools
```

The tests stub the LLM and never call TTS; they spend nothing.

## Traps

- **Never show the dossier or the roundtable script to the GM.** Report statistics only.
- **The special keeps the recap id form** `<latest>-recap-of-<first>`, so it is unique and
  sorts after its arc's last session. `render` stores `kind: "special"` in the script and
  digest, which every session-scoped reader skips on.
- **`render` imports private helpers from the backend** (`astra_mouthpiece.assets._voices`).
  Keep their signatures when changing the backend.
- **Run from a checkout with the real data root.** The tools read episodes and the wiki from
  `/ruby/data/astra-state` through config; they are not in any image.

# astra-mouthpiece-tools — mouthpiece's hand-run, paid tools

Three host CLIs that run by hand from a checkout: the producer experiment and two specials,
the prediction roundtable and the villain and NPC tier list. They reuse the mouthpiece backend (`apps/mouthpiece/py`,
`astra_mouthpiece`) but live in their own package so the Dagster image does not install them
([ADR 0023](../../../docs/adr/0023-mouthpiece-tools-package.md)). The pipeline itself is
described in [`apps/mouthpiece/py/README.md`](../py/README.md).

## Commands

The producer and the roundtable need Deno and a warm Pyodide cache for the dspy sandbox;
their recipes run `just mouthpiece-sandbox-warm` first. The tier list runs no agent loop and
needs neither.

- **`astra-mouthpiece-producer`** (PAID, never live; writes only under
  `mouthpiece-producer.artifacts-path`, `/ruby/data/astra-state/mouthpiece/experiments/`):
  - `experiment <date> [--arm ID]... [--reuse-brief RUN_DIR]`: one producer brief (or a
    reused one), the two-pass script once per `mouthpiece-producer.experiment-models` arm, and
    `report.md` comparing them with the live `episodes/<date>/script.json`. Run it as
    `just mouthpiece-experiment <date> [flags]`.
  - `brief <date> [--model ID]`: the producer over one session only. No recipe wraps it; run
    `uv run astra-mouthpiece-producer brief <date>`.
- **`astra-mouthpiece-roundtable`**, run as `just mouthpiece-roundtable <subcommand>`. The
  dossier (the evidence file) comes from a Claude Code subagent (`prepare`, then the
  subagent, then `validate`; no API spend) or from the paid DeepSeek agent loop (`dossier`).
  Both 2026-10-31 and later roundtables used the subagent.
  - `schema`: prints the dossier's JSON schema (`roundtable/dossier.py`, `Dossier`).
  - `prepare [--show SLUG] [--latest DATE] [--previous EPISODE_ID]` (free): lays out a fresh
    run dir under `<artifacts-path>/roundtable-<latest>/` with `overview.md`, `astra.md`,
    `sessions.md`, `dossier.schema.json`, `summary.json` and `brief.md` (the repo copy is
    `roundtable/brief.md`). `--previous` names the last published roundtable (for example
    `000.through-a-song-darkly.2026-10-29-recap-of-2025-8-28`) and makes the run a
    **follow-up**: `previous.txt` holds that episode's numbered transcript, the subagent
    fills the dossier's `previous` block (what it covered, each locked-in prediction and
    how the sessions since have treated it, callbacks), and Pass A gets rules for calling
    back to it and locking in new predictions.
  - `validate RUN_DIR` (free): checks `dossier.json` against the schema, the clue sources
    (a main-campaign session date and line, or a wiki page), clue ids, mystery numbers, and
    for a follow-up the hosts and `previous.txt` line numbers; then writes `dossier.md`. It
    prints counts, or each problem by its location, never content.
  - `dossier [--show SLUG] [--latest DATE]` (PAID): the agent-loop alternative; surveys the main campaign into an evidence
    dossier in a fresh run dir under `<artifacts-path>/roundtable-<latest>/`. Besides each
    mystery's clues and theories, the dossier carries its background and its connections
    to other mysteries, and dossier-wide notes on the wider setting. The agent and the
    writer both get `astra.md`: the GM's other games in the Astra, from `being.kdl`, so the
    earlier campaigns' wiki pages count as this world's lore.
  - `script RUN_DIR [--model ID]` (PAID): writes the roundtable script from that dossier
    (`pass_a.txt`, `script.json`, `report.md`); a prepared run is validated again first. Pass A runs on `mouthpiece.script-model`
    (Kimi, as for the recaps) unless `--model` is given; Pass B stays on `mouthpiece.model`.
  - `render RUN_DIR` (PAID and LIVE): copies the script into `episodes/<id>/`, synthesizes it
    with the configured TTS provider, assembles the episode and touches `.last-rendered`, so
    the linguist-commit path unit publishes it to the mouthpiece site. A follow-up gets its
    own spoiler-free synopsis.

- **`astra-mouthpiece-tierlist`**, run as `just mouthpiece-tierlist <subcommand>`. Two
  boards in one episode: the villains of the whole Astra ranked S to D by how dangerous they
  are, then every notable NPC ranked by how much the hosts love them. The evidence file
  (`cast.json`, the cast file) is written by a Claude Code subagent that the main session
  launches with the run dir's `brief.md`; no LLM loop in this repo writes it.
  - `schema`: prints the cast file's JSON schema (`tierlist/cast.py`, `CastFile`).
  - `prepare [--show SLUG] [--latest DATE]` (free): lays out a fresh run dir under
    `<artifacts-path>/tierlist-<latest>/` with `overview.md`, `astra.md`, `sessions.md`
    (each Astra campaign's transcript dates), `cast.schema.json`, `summary.json`, and
    `brief.md` with this run's input paths and the schema filled in. Hand the subagent that
    `brief.md`; the repo copy is `tierlist/brief.md`.
  - `validate RUN_DIR` (free): checks `cast.json` against the schema, the `being.kdl`
    campaign slugs and the `ties` names, then writes `cast.md` (the block Pass A reads). It
    prints counts, or each problem by its location in the file, never a name or a quote.
  - `script RUN_DIR [--model ID]` (PAID): validates again, then writes the tier-list script
    (`pass_a.txt`, `script.json`, `report.md`), about 6,000 words. Models as for the
    roundtable.
  - `render RUN_DIR` (PAID and LIVE): the same render as the roundtable's
    (`special.render_special`), with the tier list's spoiler-free synopsis.

`dossier`, both `prepare` and both `script` commands refuse (exit 1) when an input is stale: the astra-data clone has local
changes or is not at `origin/main`, or the checkout running the command does not contain
`origin/main` (its `being.kdl` feeds the roster and `astra.md`). `--allow-stale` skips the
check.

Every command but `render` and `schema` prints `RUN_DIR=<path>` as its last line. Exit
codes: 0 ok, 1 failed (or stale, or an invalid cast file), 2 incomplete (the roundtable's
iteration cap was hit; the output is still usable).

## Config

`mouthpiece-producer` (models, iteration and token caps, `experiment-models`,
`artifacts-path`), `mouthpiece` (episodes path, TTS provider and ElevenLabs key for `render`)
and `llm.openrouter-api-key`. Telemetry goes to the host collector as
`astra.mouthpiece-producer`, `astra.mouthpiece-roundtable` and `astra.mouthpiece-tierlist`.

## Testing

```sh
uv run pytest apps/mouthpiece/tools
```

The tests stub the LLM and never call TTS; they spend nothing.

## Traps

- **Never show the dossier, `previous.txt`, the cast file (`cast.json`, `cast.md`) or either
  script to the GM.** Report statistics only: `validate` and `script` print counts for that
  reason, and both subagent briefs tell the subagent to end with counts, not names.
- **Specials use the special id form**: `000.<show>.<latest>-special-roundtable` and
  `000.<show>.<latest>-special-tier-list`. The two roundtables published before that form
  (2026-10-19 and 2026-10-29) keep their recap-form ids (`<latest>-recap-of-<first>`);
  never rename a published id. `render` stores `kind: "special"` in the script
  and digest, which every session-scoped reader skips on.
- **`render` (both specials, `special.py`) imports private helpers from the backend** (`astra_mouthpiece.assets._voices`).
  Keep their signatures when changing the backend.
- **Run from an up-to-date `main` checkout with the real data root** (the freshness check
  enforces it). The tools read episodes and the wiki from
  `/ruby/data/astra-state` through config; they are not in any image.

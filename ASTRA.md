# astra

`astra` is the successor to the (now-decommissioned) faerrin repo, with a focus on consolidating our technologies, removing redundancies, improving workflow and visibility, and overall improvements now that we have a much better picture of what the repo's functionality is. It is the live stack behind the campaign: everything that turns a session into transcripts, a wiki and a podcast, the tools we use at the table, and the sites the players read.

The general breakdown is as follows (subsystems, not directories; each app's README has the detail, and [`docs/architecture.md`](./docs/architecture.md) says what runs where):
  - `ontology`:
      - `ontology-being`: a truth-store. holds canonical info that gets used by any other project. Things like players, characters, colors, campaigns, the podcast personas, and the "hosts" the bots speak as.
      - `ontology-config`: the centralized configuration for all other applications (`config.kdl`). both config variables in a structured format and secrets as pointers into sops. replaces things like env vars.
      - `ontology-entity`: the setting's entity registry.
  - the session pipeline (one Dagster partition per session):
      - `scribe`: the transcription system. picks up audio files from `Craig`, merges the individual-speaker tracks into a unified audio file, and converts them into a structured, timestamped transcript.
      - `linguist`: the transcript processing system. takes the output of `scribe`, fixes transcription errors, outputs the canonical session transcript, and builds the chronicle (the show → season → episode timeline).
      - `heartwood`: an agent that reads each new session transcript and edits the akasha wiki to keep it current, with no human review.
      - `mouthpiece`:
          - `mouthpiece-backend`: turns each session transcript into a recap podcast episode with three hosts: a script, then the audio.
          - `mouthpiece-frontend`: a website for listening to the episodes, with a speaker-attributed transcript.
          - `mouthpiece-tools`: hand-run, paid extras, such as the prediction-roundtable special.
      - `dagster`: the orchestrator that runs the whole pipeline, from a new Craig recording to a published episode.
  - the campaign's websites:
      - `akasha`:
          - `akasha-backend`: a content-store. holds the wiki about the campaign's setting in the `vellum` format, validates it, and builds the snapshot the frontend reads.
          - `akasha-frontend`: a website for the rendered wiki, the session transcripts from linguist and the chronicle timeline.
      - `strider`: a website chronicling the progression of the factions' journey on a hexmap. it is also the template every other ssr frontend copies.
      - `codex`: a Pathfinder 2e reference site (rules, spells, creatures, items, classes) built from the Foundry pf2e packs and the Archives of Nethys, plus our homebrew spells. public but noindexed.
      - `harrow`: a reader for the campaign's homebrew Harrow tarot deck: draw a reading, browse the cards, look back at past spreads.
      - `ledger`: the landing page, a card for each player-facing site.
  - tools for the table:
      - `weal`:
          - `weal-bot`: a discord dice bot. players type `weal` expressions (a small dice language where dice are exact probability distributions, evaluated by a rust engine compiled to wasm), and the bot replies as a host with the roll, a distribution plot, or a saved macro. Records the results of dice rolls.
          - `weal-overlay`: a webpage used as an obs overlay for displaying dice roll results as they happen.
      - `orator`:
          - `orator-backend`: a discord bot that plays music into a voice channel, with a web frontend for importing and tagging tracks.
          - `orator-controller`: a streamdeck plugin for controlling the orator-backend.
      - `menhir`: a kahoot-style quiz for opening a session. the gm shares the host view, and players answer on their phones.
      - `portal`: an MCP server that lets an LLM (Claude) search and edit the live FoundryVTT world, through a Foundry module running in a GM's browser session.
  - tools for making things:
      - `vellum`:
          - `vellum-lang`: a custom markdown flavor definition and parser. Parses the custom syntax and outputs a structured format that can be ingested by downstream tools.
          - `vellum-frontend`: a website for writing vellum documents (statblocks, handouts, deity cards) with a live preview and png export.
          - `vellum-render`: the service that renders a vellum document to a png.
      - `assay`: the homebrew spell workbench. scores spell power against the official spell corpus, holds the canonical store of our homebrew spells (which codex serves), and builds the *Liturgy of the Iridite* spellbook from it.
      - `gothic`: a ui framework to be used by the various frontends to keep a consistent visual language, and the react renderer for vellum documents.

Technologies:
  - web tech is tanstack and react
  - the data pipeline (craig -> scribe -> linguist -> heartwood / mouthpiece) is orchestrated by Dagster (one partition per session); long-running services (bots, overlays, frontends, render service, DBs) run as Docker Compose units.
  - the pipeline's published output (transcripts, the wiki, the episode catalog) lives in its own repo, `astra-data`; the frontends bake it in at build time.
  - all applications make use of otel spans and metrics to be consumed by signoz
  - all llm interactions will be through litellm and dspy, behind one shared client (`libs/py/llm`)
  - version control will be managed by git, on github
    - format will be conventional commits
    - ci/cd will be through github actions
  - hosting will be through caddy
  - both data serialization and program configuration will be using [kdl 2.0](https://kdl.dev) the cuddly document language

This will be fundamentally a polyglot repository. We're targeting data-processing and llm applications will be in python, managed by uv. The web servers and frontends will be in typescript, managed by pnpm. The weal dice engine is the one piece of rust.

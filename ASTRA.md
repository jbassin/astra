# astra

`astra` is the successor to the (now-decommissioned) faerrin repo, with a focus on consolidating our technologies, removing redundancies, improving workflow and visibility, and overall improvements now that we have a much better picture of what the repo's functionality is.

The general breakdown is as follows (this doesn't necessarily map to specific directories, just a breakdown of what we expect to want):
  - dist: somewhere that any site generation ouputs to.
  - parts of the system:
    - `ontology`:
        - `ontology-being`: a truth-store. holds canonical info that gets used by any other project. Things like players, characters, colors, campaigns, etc.
        - `ontology-config`: the centralized configuration for all other applications. both config variables in a structured format and secrets in a structured format. replaces things like env vars.
    - `scribe`: the transcription system. converts audio files from `Craig` into structured, timestamped, transcripts. (and merges individual-speaker audio files into a unified audio file)
    - `linguist`: the transcript processing system. takes the output of `scribe`, fixes transcription errors, outputs into formats expected by downstream systems.
    - `weal`:
        - `weal-bot`: a discord bot. uses different "hosts" (defined in ontology-being) to send messages. serves an api that can be used to send arbitrary messages as a host. also listens to messages in a discord guild and if it looks like a dice roll, does the dice roll and prints the result. Records the results of dice rolls.
        - `weal-overlay`: a webpage used as an obs overlay for displaying dice roll results as they happen.
    - `gothic`: a comprehensive ui framework to be used by the various frontends to keep a consistent visual language.
    - `vellum`: 
        - `vellum-lang`: a custom markdown flavor definition and parser. Parses the custom syntax and outputs a structured format that can be ingested by downstream tools.
        - `vellum-frontend`: a website where 
    - `akasha`:
        - `akasha-backend`: a content-store. holds a store of information about the setting of the pathfinder 2e setting in the `vellum` format.
        - `akasha-frontend`: a website for serving rendered info from the akasha-backend, as well as the scripts from linguist and roll probability insights from weal. 
    - `mouthpiece`:
        - `mouthpiece-backend`: a data pipeline that takes scripts from linguist and content from akasha-backend and generates a script of a roundtable discussion about it, then converts it into an audio file.
        - `mouthpiece-frontend`: a website for serving the roundtable discussion scripts and audio.
    - `orator`:
        - `orator-backend`: a discord bot that plays audio with a web frontend for adding and tagging audio files.
        - `orator-controller`: a streamdeck plugin for controlling the orator-backend.
    - `strider`: a website chronicalling the progression of a journey represented by a hexmap.

Technologies:
  - web tech is tanstack and react
  - the data pipeline (craig -> scribe -> linguist -> akasha -> mouthpiece) is orchestrated by Dagster (one partition per session); long-running services (bots, overlay, render service, DBs) run as Docker Compose units. (Supersedes the earlier "windmill" plan — see roadmap Decision H.)
  - all applications make use of otel spans and metrics to be consumed by signoz
  - all llm interactions will be through litellm and dspy
  - version control will be managed by git, on github
    - format will be conventional commits
    - ci/cd will be through github actions
  - hosting will be through caddy
  - both data serialization and program configuration will be using [kd 2.0](https://kdl.dev) the cuddly document language

This will be fundamentally a polyglot repository. We're targeting data-processing and llm applications will be in python, managed by uv. The web servers and frontends will be in typescript, managed by bun. 

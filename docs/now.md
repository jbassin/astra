# Now

Updated 2026-10-29.

## In flight

- **Handoff: Osyluth fix and two re-renders, stopped mid-way (2026-10-29).** Read this first.
  - **Do not deploy Dagster from `main` before Thursday's session.** Live Dagster runs
    `ded6125e`. `main` adds #144 (corrects the brief text before Pass A, fast, fine) and #145
    (the producer corrects every earlier transcript, chronicle entry and script on read). #145 is
    far too slow: correcting one transcript takes ~15 s, and the producer reads and searches
    dozens, so a brief run crawled for 25+ min and was killed. Revert #145 (or make it fast)
    before any Dagster deploy.
  - **Published episodes still have the Osyluth error.** 2026-10-19 ("The Least Cheerful Live
    Wire") and probably 2026-10-12 ("No Visitors") call Osyluth two characters (Oceloth, an
    invented "owl familiar", and Ocelith). Cause: their producer briefs (`brief.json`, written
    before the spelling fixes) say so, and the re-render reused them. Backups of earlier versions:
    `/ruby/data/astra-state/mouthpiece/experiments/backup-2026-10-12-pre-spoken/`,
    `backup-2026-10-19-pre-spoken/` and `backup-2026-10-19-six-spigots/` (all have the error too).
  - **To fix an episode:** regenerate the brief and script into a scratch folder (not the live
    episode), check them for Ocel*/"owl"/a second Osyluth, show Josh, and render audio only after
    his yes (memory `check-script-before-audio`). The full live path is `--select
    session_brief,session_script,session_audio_clips,session_episode`, never without
    `session_brief` when its inputs changed.
  - **Open decision (Josh):** correct the stored old transcripts, chronicle entries and episode
    scripts once with today's `defs.kdl` and commit them, instead of correcting on every read.
    That replaces published transcripts.
  - **Local leftovers:** worktree `.claude/worktrees/producer-cache` (branch
    `perf/producer-cached-corrections`, unpushed: per-run caching, not enough on its own; don't
    merge as is) and `.claude/worktrees/names-fix` (merged branches only).
- **Nothing else is being built.** The tech-debt paydown 0037 is closed (status line 2026-10-26 in section
  0.1 of [`thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md`](../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md)),
  and the agent backlog it fed was cleared the same day.
- **Live since 2026-10-26:** Dagster stage automation (three automation sensors, started after a
  clean pre-flight), resumable paid stages with one retry policy, the edge health block and
  `/render` body cap, the weal save guard, orator/portal/pg-migrate fixes, the vellum parity timer.
- **Live since 2026-10-28:** mouthpiece's realism changes (#137 to #140): a spoken-style recap
  prompt, Pass A on Kimi `kimi-k3.1-pro` with Pass B on GLM, ElevenLabs stability 0.0, linked
  dialogue chunks, new voices for Maeve (Ellen) and Nell (Siren), and the first `defs.kdl`
  pronunciations. The wiki renamed Ocelith to Osyluth and Macarius to Macharius. 2026-10-12 and
  2026-10-19 were re-rendered with all of it.

## Next action

First resolve #145 (above) without deploying `main` as is. Then: Thursday 2026-10-29's session is the live check of stage automation and resumable stages: follow
"Thursday 2026-10-29 session" under "Waiting on an event" in the [backlog](backlog.md). The merged
pipeline fixes (#132, #133) were deployed 2026-10-26 so Thursday's cost reading uses the corrected
GLM 5.3 price; craig_drop_sensor now skips 2026-9-26's second recording by name, as expected.
It is also the first session rendered on the 2026-10-28 mouthpiece changes; the backlog lists
what to check.

## Blocked or waiting

- **Josh:** the empty published transcripts (2026-8-12, 2026-8-20, 2026-9-26, which was
  transcribed from the wrong recording) — re-transcribe or remove, both paid or replacing
  published content; the codex rollback-data deletion; the SigNoz Editor key; launching the
  Foundry world so the portal module install can be confirmed; an off-LAN `/healthz` check. See
  the backlog's "Smaller calls" and "Deploy and ops".
- **heartwood gate E** and the **pipeline failure alert:** both resolve on the next session.
- **Stakeholder gates** (codex gate H, weal gates D to F, the Liturgy Vol.2 review, the assay Foundry
  module, mouthpiece episode shape): waiting on Josh and the players.

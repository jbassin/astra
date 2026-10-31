# Now

Updated 2026-10-31.

## In flight

- **Earlier campaigns are in akasha (closed 2026-10-31, #159 to #180).** Campaign 1 (Risk of
  Ruin, Ushas), campaign 2 (Deep Eyes, Althane), the Færrin one-shots and Noah's Urth one-shots
  are registered; heartwood ingests any Astra-world campaign and has read all 27 earlier
  sessions ($9.74); pages carry a `campaigns` list shown as "Known from"; the Sessions page
  lists Deep Eyes under "Earlier campaigns" as "Campaign 2". Josh's campaign-2 vault and his
  answers on campaign 1, Deep Eyes and the Thessians are written in (wiki 531 to 660 pages,
  live astra-data `2a61402`). Plan and record:
  [`thoughts/shared/research/2026-10-30-earlier-campaigns.md`](../thoughts/shared/research/2026-10-30-earlier-campaigns.md).
  Leftovers are in the backlog.
- **akasha redesign is live (2026-10-30, #154 to #157, deployed `c5021a72`).** The stakeholders
  asked for a complete redesign. akasha now has light and dark themes (following the system, with
  a switch), Literata and Archivo instead of Caslon Antique, one colour per wiki section, a new
  header and phone menu, episode-titled transcripts with a docked player, and new home, Sessions
  and listing pages. gothic is unchanged; akasha re-themes its blocks from its own CSS. Plan and
  design system: [`thoughts/shared/research/2026-10-29-akasha-redesign.md`](../thoughts/shared/research/2026-10-29-akasha-redesign.md).
  Next: Josh shows it to the stakeholders; small follow-ups are in the backlog under Frontends.
- **Stored text is now corrected on disk (live 2026-10-29, #147, Dagster `bee13eaf`).**
  linguist's `stored_corrections` rewrites every stored transcript, chronicle entry and
  mouthpiece script, brief and digest whenever `defs.kdl` changes; no reader corrects text any
  more (#145's slow producer path is gone). The first run took 1 h 55 min and changed 26
  transcripts, 32 chronicle entries, 32 data files and 22 scripts; linguist-commit published
  them (astra-data `5c11867`). It skipped one file whose JSON format differs: the 2026-10-19
  recap special's `digest.json`. Backups of the mouthpiece files and context scripts from
  before the run: `mouthpiece/experiments/backup-2026-10-29-pre-stored-corrections/`.
  The two hours were the replacer's flat 800-group alternation; #150 (2026-10-29) dispatches
  on the first character instead, 0.4 s per transcript with identical output, so the next run
  should take about a minute. It is live in Dagster (`040de791`, deployed 2026-10-29).
- **2026-10-19 re-rendered without the Osyluth error (2026-10-29).** A fresh brief ($0.23) and
  script were generated into a scratch data root, checked (no Ocel*, no owl, one Osyluth, Othello
  matches the wiki), then rendered: "No, Actually, Six", 55,263 dialogue characters, 55 MB. The
  previous version is in `mouthpiece/experiments/backup-2026-10-19-pre-osyluth-fix/`.
  2026-10-12 ("No Visitors") was left alone on Josh's instruction; checked afterwards, its script
  and transcript page never mention Osyluth, so it has no such error to fix.
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

Thursday 2026-10-29's session is the live check of stage automation and resumable stages: follow
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

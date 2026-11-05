# Now

Updated 2026-11-04.

## In flight

- **Unused web apps removed from the repo (2026-11-04): menhir, ledger, the vellum site
  and weal-overlay.** weal-bot no longer posts rolls to an overlay. Code, config, compose, Caddy,
  smoke checks and docs are gone; the live containers and edge stanzas go at the next deploy.
- **2026-11-3's session ran end to end with no intervention (2026-11-02 23:35 to 11-03 00:17
  EST).** craig-sync copied `craig_oe05tGnFZ9nL_2026-11-3_0-36-18` (966 MB) at 23:35 and ignored
  the two stub zips; scribe launched 15 s later and took 7 min; linguist (1 min), heartwood and
  mouthpiece each launched on their own, once, in order. The episode summary passed this time
  (GLM 5.2 needed 2 retries at the call level, both recovered). heartwood published with no
  command (astra-data `bd9c03d`, 3 created and 5 updated, $0.25, 20 min) and redeployed akasha.
  mouthpiece rendered "Locate the Entity": 24 clips (all with a `request_id`), 42.7 min, 41 MB,
  in 32 min; linguist-commit redeployed the mouthpiece frontend at 00:17. LLM cost from the
  `astra.llm.call` spans: $0.57 across linguist and mouthpiece (script $0.37), plus heartwood's
  $0.25. Nothing from the 2026-10-29 backlog items recurred.
- **Follow-up prediction roundtable is live (2026-11-03, #204).** The third roundtable, and the
  first that remembers the last one: `just mouthpiece-roundtable prepare --previous <id>` puts
  the 2026-10-31 roundtable's transcript in the run dir, a Claude Code subagent wrote the dossier
  from the now-committed `roundtable/brief.md` (18 mysteries, 160 clues, 77 theories, 14
  setting notes; the 9 old predictions: 6 untouched, 1 gained support, 1 shaken, 1 borne out;
  no API spend), and `validate` checked it. Kimi and GLM wrote the script ($0.38, after one
  OpenRouter 429 on the first try): 11,013 words, well over the 8,500 ceiling. Published as
  `000.through-a-song-darkly.2026-11-3-special-roundtable` (65.5 min, 39 clips, astra-data
  `7ba12c1`); new roundtables use the special id form. Run folder:
  `mouthpiece/experiments/roundtable-2026-11-3/20261104T033836Z` (the GM must not read it).
- **Villain and NPC tier-list special is live (2026-11-02, #200, #201).** A second special format:
  the hosts rank the Astra's villains by danger, then its NPCs by affection, on two S-to-D boards.
  `just mouthpiece-tierlist prepare` makes a run dir with the committed `tierlist/brief.md`; a
  Claude Code subagent wrote the cast file from it (13 villains, 22 NPCs, 135 quotes all checked
  against their sources, 13 setting notes; no API spend); `validate` checks it and prints counts
  only. Kimi and GLM wrote the script ($0.29): 5,899 words, published as
  `000.through-a-song-darkly.2026-10-29-special-tier-list` (34.7 min, 20 clips). #200 added
  that id form, `<latest>-special-<slug>`, so two specials after one session no longer collide;
  #201 moved the roundtable's render into a shared `special.render_special`. Run folder:
  `mouthpiece/experiments/tierlist-2026-10-29/20261102T040007Z` (the GM must not read it).

- **akasha pages are consolidated instead of piling up (2026-11-01, #197, astra-data
  `f5c8d81`, deployed).** Pages grew one appended paragraph per edit, so they repeated and
  contradicted themselves (Thessians: paragraphs from 8 commits). heartwood's instructions now
  require each edit to fold new facts into the page; `just heartwood-layered` lists layered
  pages; `apps/heartwood/py/consolidate.md` is the brief for rewriting them. Subagents
  consolidated the 25 listed pages plus The Broker (Althane's index needed nothing), two
  independent reviews checked every page for lost or invented facts, and their fixes are in.
  Josh's canon answers on the open calls are written in (astra-data `eeac120`, deployed).
- **Player handouts build from Markdown (2026-11-01, #188, #189, #191, #193).** `just handout
  <name>` turns a Homebrewery-style `handout.md` plus its images into a PDF in the Liturgy
  book's look: several pages, several named images (column art or full-width bands), action
  glyphs, and a warning for any line that overflows its column. Sources live outside the repo in
  `/ruby/data/astra-state/handouts/` (spoilers; the repo is public): the six Vol.1 addenda and
  Josh's new two-page `the-accord`. How to write one: the assay README, "Write a new handout".
- **The Accord handout is in akasha (2026-11-01, astra-data `bf6e340`, deployed).** New pages
  `Org/The Accord` and `Geography/Færrin/Calarium`; the Providence, Far Realms and Divine Raiment
  pages gained the Accord. Josh's canon calls: the 0–12ag war on the Timeline is the first of the
  Eddic Crusade's three wars (Timeline unchanged); the Party's Providence is built on the Accord's
  lost war machine; Calarium is the Dark Ages empire over Tormeré, Calaria and Brithwyn.
- **Second prediction roundtable is live (2026-10-31, #184).** A Claude Code subagent wrote the
  dossier in place of the DeepSeek loop (16 mysteries, 128 clues, 12 wider-setting notes, 10 of
  them drawing on the earlier campaigns' pages; no API spend); Kimi wrote the dialogue and GLM
  formatted it ($0.41): 9,578 words, 56.8 min, 33 clips, published as
  `000.through-a-song-darkly.2026-10-29-recap-of-2025-8-28`. #184 gave the roundtable the
  dossier's background, connections and setting notes, the `astra.md` block of the GM's other
  Astra games, Kimi for Pass A, and a freshness check that refuses stale inputs. Run folder:
  `mouthpiece/experiments/roundtable-2026-10-29/20261101T010044Z-agent` (the GM must not read
  it). Its brief is now committed as `roundtable/brief.md` (#204).
- **linguist-commit no longer pages while heartwood runs (2026-10-31, #183).** deploy.sh exits
  14 when the host-tooling lock is busy; linguist-commit passes `HOST_TOOLING_LOCK_TIMEOUT=0`
  and defers the redeploy instead of failing. It takes effect when the deploy checkout next
  moves (any linguist-commit redeploy does that).
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
- **2026-10-29's session ran end to end on stage automation (2026-10-29 to 10-30).** craig-sync
  copied `craig_CT9e5mbCaPsW_2026-10-29_23-38-7` (1.03 GB) at 23:35 and ignored two stub zips;
  scribe launched 4 s later and took 8 min; linguist, heartwood and mouthpiece each launched on
  their own, once, in order. Two things went wrong, both now in the backlog: GLM 5.2 returned a
  malformed `EpisodeSummary` on all 3 attempts (a fresh re-execute from failure passed), and
  linguist-commit's akasha redeploy timed out on heartwood's host-tooling lock (its next run
  redeployed). heartwood published its wiki edits with no command (gate E passed: astra-data
  `de47b83`, 6 created and 6 updated, $0.24), and `pipeline_failure_alert` logged its ERROR
  record for the linguist failure. mouthpiece rendered "The Voice Behind the Wall": 368 turns,
  23 clips (all with a `request_id`), 20 pronunciations inlined, 38 MB. Pass A on Kimi took
  11 min ($0.29, priced); Pass B took about 2.5 min per segment. LLM cost from the
  `astra.llm.call` spans: $0.77 across linguist and mouthpiece, plus heartwood's $0.24.
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
  clean pre-flight), resumable paid stages with one retry policy, the edge health block, the weal save guard, orator/portal/pg-migrate fixes, the vellum parity timer.
- **Live since 2026-10-28:** mouthpiece's realism changes (#137 to #140): a spoken-style recap
  prompt, Pass A on Kimi `kimi-k3.1-pro` with Pass B on GLM, ElevenLabs stability 0.0, linked
  dialogue chunks, new voices for Maeve (Ellen) and Nell (Siren), and the first `defs.kdl`
  pronunciations. The wiki renamed Ocelith to Osyluth and Macarius to Macharius. 2026-10-12 and
  2026-10-19 were re-rendered with all of it.

## Next action

Nothing is scheduled. Pick from the backlog's "Pipeline" items opened by the 2026-10-29 session,
or wait for Josh's calls below.

## Blocked or waiting

- **Josh:** the empty published transcripts (2026-8-12, 2026-8-20, 2026-9-26, which was
  transcribed from the wrong recording) — re-transcribe or remove, both paid or replacing
  published content; the codex rollback-data deletion; the SigNoz Editor key; launching the
  Foundry world so the portal module install can be confirmed; an off-LAN `/healthz` check. See
  the backlog's "Smaller calls" and "Deploy and ops".
- **Stakeholder gates** (codex gate H, weal gates D to F, the Liturgy Vol.2 review, the assay Foundry
  module, mouthpiece episode shape): waiting on Josh and the players.

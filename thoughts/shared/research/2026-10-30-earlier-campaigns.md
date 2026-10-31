# Earlier campaigns in akasha

- **Date:** 2026-10-30
- **Status:** Slices 1, 2 and 3a are live (2026-10-30). Next: 3b (the "Known from" line) and 4 (the vault import, reviewed by Josh before it ships), then the paid heartwood backfill.
- **Goal:** the players carry knowledge from campaigns 1 and 2 that akasha doesn't have. Bring
  the recorded part of campaign 2 and its Færrin one-shots into akasha and the pipeline, mark
  which campaign each fact comes from, and fill the unrecorded gaps from Josh.

## 1. What exists

The three campaigns all take place in the Astra, the meta-setting.

| Campaign | World | Sources |
|---|---|---|
| 1 | Ushas | Nothing recorded. akasha has a `Geography/Ushas` page from a campaign-3 session. |
| 2, Deep Eyes | Althane | 24 transcripts in quartz; the old `jbassin/archive` wiki (2022). |
| 3, Through a Song, Darkly | Færrin | Already in akasha: 49 transcripts, 366 pages. |

**quartz transcripts.** `/ruby/data/experiments/quartz/content/Script/Unsorted/` holds 34
files. Each speech line is a `:::transcript-line{second=… user="<Player>" start=…}` block, and
Josh's lines contain quartz wiki links (`[[Geography/Calaria/index|Calaria]]`) that must be
reduced to their labels. The matching audio is already in `/ruby/data/astra-state/audio/akasha/`.
They sort as follows:

| Dates | What | Import? |
|---|---|---|
| 2024-10-28 to 2025-5-12 (24 sessions) | Deep Eyes | Yes |
| 2024-10-21 | The Midnight Sun, Færrin one-shot (Josh GM) | Yes |
| 2024-11-20 | Hildebrandt Heist, Færrin one-shot (Josh GM) | Yes |
| 2025-6-30, 2025-7-7 | Starfinder, Jorge GM | No: not the Astra |
| 2025-7-14 to 2025-8-7 | The Blue Remains, Tanner GM | No: not the Astra |
| 2025-10-8 | Tanner's one-shot | No: not the Astra |
| 2024-10-15, 2025-3-5, 2025-6-5 | Empty stubs | No |

The 2025-8-11 Blue Remains transcript already in astra-data stays as it is (skipped in
`sessions.kdl`). The very first Færrin one-shot (the professor whose fingers grow) predates the
recordings.

**Rosters.**

- Deep Eyes: Jorge is Lev, Noah is Big Fish and Dawnmonger (two different characters), Mike is
  Divex, Tanner is Henrik.
- The Midnight Sun: Noah is Banyan, Tanner is Giancarlo, Mike is Crindle Vilksnake. Jorge was
  absent.
- Hildebrandt Heist: Noah is Adzuki, Tanner is Mika, Mike is Chris Gangle, Jorge is Vint Cerf.

**The archive repo.** About 240 Markdown pages, 177 with content, about 5,000 words. Everything
in it is Deep Eyes (Althane: Salores, the Lunae Badlands, Haven) or meta-setting material (the
Astra, localities, the Aetheric Field, the Weave, the realms, the creation myth).

## 2. How the pipeline sees campaigns today

- `being.kdl` campaigns have a `world`. heartwood ingests only `world "faerrin"`
  (`astra_ontology.faerrin_campaign_slugs`), so Deep Eyes on Althane would be ignored.
- The show is the transcript filename slug, `<ident><idx>.<slug>.<date>.txt`: `ident` is 0
  for `main` and 1 otherwise, and `idx` is the campaign's position in `being.kdl`. New
  campaigns must be appended, or every existing filename changes.
- weal's roster takes the first `main` campaign, so Deep Eyes must be `main #false`.
- akasha's transcript pages read `linguist/data/<date>.json` (`{date, audio, script: [{start,
  second, duration, text, user: {name, color}}]}`) and the chronicle reads
  `linguist/timeline/`.
- heartwood runs one agent per session from the transcript on disk and its ledger.
  `just heartwood-backfill [from]` processes pending dates oldest first under a ledger-wide
  budget (`heartwood.backfill-budget-usd` 100; $23.54 spent over 56 runs, $0.42 average, $0.85
  maximum). Old dates are not Dagster partitions, so nothing launches by itself: no automatic
  heartwood run, chronicle summary or podcast episode.
- heartwood's instructions assume one campaign. They already handle replaying an older session
  against a wiki that knows later events ("never overwrite a later state with an earlier one").
- mouthpiece's producer reads the wiki through tools, so the podcast benefits without changes.
- Page frontmatter already passes unknown fields through (`vellum-lang` `extra`).

## 3. Slices

Each slice is one pull request unless noted. Paid or live-content steps are flagged.

1. **Register the campaigns.** Append Deep Eyes (`world "althane"`), The Midnight Sun and
   Hildebrandt Heist (`world "faerrin"`) to `being.kdl`, all `main #false`. Replace the
   faerrin-only filter with an Astra-worlds list in `being.kdl` (faerrin, althane, ushas),
   read by `astra_campaign_slugs`. Observatory, Slipped is in the Astra (Josh, 2026-10-30):
   change its `world` from "sedecium" to "ushas" if nothing else keys on that value, otherwise
   add "sedecium" to the list. Update tests and the heartwood README.
2. **Import the transcripts.** A script under `apps/linguist/py/scripts/` converts the 26
   quartz files into `linguist/transcripts/*.txt` and `linguist/data/*.json`. It bills each
   player as their character from `being.kdl` and Josh as Gamemaster, strips the wiki links,
   computes `duration` from the next line, and applies the `defs.kdl` corrections. For Noah in
   Deep Eyes the script uses whichever character the session names more often; if neither is
   named, it uses Noah's player name. Write the output to my own astra-data clone, check three
   pages locally in akasha, then push. **Adds published content** (26 new transcript pages).
3. **Mark which campaigns a page draws on.** Add a `campaigns` frontmatter list; a page can
   hold several, and the marker is per page, not per sentence. heartwood's publish step adds
   the run's campaign to every page it creates or updates, in code rather than by the model. A one-off migration fills existing pages from the ledger and each run's
   `diff.patch`, and pages with no run get no marker. akasha shows a short "Known from" line on
   a page with more than one campaign or a campaign other than the current one. heartwood's
   instructions gain a paragraph naming the campaigns, their worlds and their order, and saying
   that player characters from an earlier campaign are described as they were when it ended.
   Two pull requests: the pipeline and migration, then the frontend.
4. **Import the archive.** *Superseded source (2026-10-30):* Josh found a newer campaign-2
   Obsidian vault, `/home/jbassin/campaign-2/content` (about 25,600 words: Althane, Astra
   cosmology, stubs for Færrin, Ushas, Urth and Syrin; narrated in-world by Aut). It was shown
   to the players, so all of it may go in, and it replaces the archive repo as the source. Also
   in this slice: convert YuDaan's treatise faithfully and otherwise leave it alone (its quotes
   are diegetic); add three player-known APEX facts to the Thessians page (apex of life in the
   Astra; named for their theme; information density and coherence), nothing else from APEX.
   GM-only Thessian reference material never goes into the repo, the wiki or heartwood's
   inputs. Original text: convert the archive pages to vellum: Althane under
   `Geography/Althane/`, cosmology merged into the existing Astra-related pages, with
   `campaigns: [deep-eyes]` or no campaign for meta-setting pages. This happens on a branch of
   astra-data, and Josh reviews it before it ships, because it **changes published pages**. It
   comes before slice 5, so heartwood can resolve Deep Eyes names against it.
5. **Run heartwood over the 28 sessions:** the 26 imported ones plus Observatory, Slipped's
   2026-4-6 and 2026-4-27, already transcribed but never ingested. Dry-run 2024-10-21 first and
   read the diff. Then `just heartwood-backfill 2024-10-21`. **Paid and live:** estimated $12,
   at most about $24, which keeps the ledger well under the $100 cap. Check `heartwood-agent
   sessions --from 2024-10-21` first, so it picks up only these dates.
6. **Chronicle.** Run `backfill_chronicle.py` for the new dates (GLM, **paid**, a few cents a
   session), then materialize `campaign_timeline`. Deep Eyes shows as its own show. Label it
   "Campaign 2" on akasha's Sessions page rather than as a one-shot.
7. **Fill the gaps from Josh.** I read the wiki and transcripts for references to Ushas,
   campaign 1 and unexplained Deep Eyes events, and turn them into a short questionnaire. Josh
   answers, and I write the answers into pages marked with their campaign.
   Known so far (player-known, 2026-10-30): in Risk of Ruin the party (Zuggarian "Zugg",
   Rotok, T3C, Dorcan) met the Thessians Uriel (a staunch ally), Mephistopheles "Mephi" (the
   main antagonist), Dragon, Archive and Leitmotif, and encountered the Menhir; the players
   came up with Sedecium, which their characters founded. T3C returns in Deep Eyes as the
   Broker; that party knows it, and late in the campaign went with him off-world to
   Sedecium's headquarters. Questions to ask: what each encounter established, and how the
   campaign-1 Menhir connects to campaign 3's.

## 4. Open questions

- None. (Observatory, Slipped is in the Astra; the "Known from" marker is a per-page list.)

## 5. Checklist

- [x] Josh approves the plan (2026-10-30, #159)
- [x] 1. Campaigns registered, Astra-worlds filter (#161, deployed `17efd7cd`). Also: Risk of
  Ruin (campaign 1, 5e, Ushas, no recordings) registered; Noah is Dawnmonger only (Big Fish
  died before the recordings); akasha follows `sessions.kdl` skips (Starfinder 2025-6-30 and
  2025-7-7 skipped; The Blue Remains moved to Unsorted).
- [x] 2. Transcripts imported (#162; astra-data `9c0e18e`). 25 sessions, not 26: their data
  files were already published as `Script/Unsorted` pages, so only the `.txt` transcripts were
  new. heartwood now lists 27 pending dates (these plus Observatory, Slipped's two).
- [x] 3a. `campaigns` frontmatter, publish stamping, migration, instructions (#160; migration
  astra-data `a52aadb`, akasha deployed `ca0ba766`: 315 pages listed, Timeline excluded)
- [ ] 3b. akasha "Known from" line
- [ ] 4. Archive imported and reviewed
- [ ] 5. heartwood backfill (paid)
- [ ] 6. Chronicle backfill (paid), Sessions label
- [ ] 7. Questionnaire answered and written up
- [ ] Wrap-up: now.md, backlog, heartwood, linguist and ontology READMEs

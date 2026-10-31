# Earlier campaigns in akasha

- **Date:** 2026-10-30
- **Status:** Handoff updated 2026-10-31 (section 0). Everything through the questionnaire and
  Josh's account of Deep Eyes before the recordings is live. Next: wrap-up (0.2 step 7).
- **Goal:** the players carry knowledge from campaigns 1 and 2 that akasha doesn't have. Bring
  the recorded part of campaign 2 and its Færrin one-shots into akasha and the pipeline, mark
  which campaign each fact comes from, and fill the unrecorded gaps from Josh.

## 0. Handoff (2026-10-31)

Read this section first; sections 1 to 3 are the original plan and are partly superseded.

### 0.1 What is live

astra pull requests, all merged: #159 (this plan), #160 (`campaigns` frontmatter, publish
stamping, backfill script), #161 (campaigns registered, Astra-worlds filter, akasha follows
`sessions.kdl` skips), #162 (quartz importer), #163 (docs), #164 ("Known from" line), #165
(inline images served by akasha), #166 (heartwood files places by world; `Hellsmith` →
`Hellsmouth` lexicon entry), #167 (the Urth show and the `sessions.kdl` `campaign=` override;
merged).

astra-data `main`, in order: `9c0e18e` the 25 quartz transcripts; `a52aadb` the `campaigns`
backfill (315 pages; Timeline has none); `f25fcd9` the campaign-2 vault import (169 new pages,
8 merged; Josh reviewed it on the live site); `ccbc24e` geography nested by world. The live
clone is at `ccbc24e`.

`being.kdl` now holds, appended in this order after the existing eight: `deep-eyes` (campaign
2, Althane), `the-midnight-sun` and `hildebrandt-heist` (Færrin one-shots, Josh GM),
`risk-of-ruin` (campaign 1, D&D 5e, Ushas, never recorded), `urth` (Noah's one-shots, one show,
PF2e; from #167). `astra-worlds`: faerrin, althane, ushas, urth. Observatory, Slipped is world
`ushas`. heartwood ingests any campaign in an Astra world.

### 0.2 Do next, in order

1. **Done 2026-10-31:** #167 merged; `just deploy akasha-frontend dagster-code dagster-daemon`
   deployed `8650c097` (images code, world folders, Hellsmouth, Urth). Nested URLs such as
   `/Geography/F%C3%A6rrin/Calaria` serve; the old top-level ones 404. The Hellsmouth
   `defs.kdl` change makes `stored_corrections_sensor` rewrite stored text once; check its run
   in Dagster and that linguist-commit published it.
2. **Done 2026-10-30.** Urth content follow-up (2026-9-3 was Noah's "sucked into the movie" one-shot, filed as
   campaign 3; its published podcast episode stays exactly as it is, Josh's call):
   a. In Dagster, materialize `session_transcripts` for partition `2026-9-3` (free, no LLM). It
      writes `linguist/transcripts/112.urth.2026-9-3.txt` (billed Hades = Jorge, Fulton = Josh,
      Runway Brian = Mike, Gamemaster = Noah), deletes the `000.through-a-song-darkly` copies,
      and linguist-commit publishes the rename.
   b. Chronicle: edit `linguist/timeline/episodes/2026-9-3.json` `"show"` to `"urth"` in your
      own astra-data clone, push, then materialize `campaign_timeline` by hand (a paid GLM
      grouping call, cents; flag it in one line). Through a Song, Darkly's season URLs may
      renumber; Josh accepted that behaviour earlier.
   c. Restamp `campaigns` to `urth` (replace the old slug) on the pages the 2026-9-3 heartwood
      run created, at their new paths: `Geography/Urth/index`, `Geography/Urth/Los Diablos`,
      `Org/Bisney and Dixar/index`, `Org/Bisney and Dixar/Arcane Intelligence` (now also holds
      the film's settings, Afro-China and the Elephant Graveyard of Wonders), `People/Fulton`,
      `People/Hades`, `People/Jaskar`, `People/Runway Brian`, `Phenomena/Enchanted Mirror`.
      Also Noah's Cagley one-shot (the first half of 2025-6-9, filed as A Hunt of Metal and
      Vine): `Geography/Urth/Cagley` and `Bestiary/Terror of Cagley` become `[urth]`;
      `Bestiary/Fiends` (holds the Hellion) gains `urth`. Then validate, `akasha-snapshot`,
      `astra-ontology-entity-seed`, push, pull the live clone under the git-publish lock,
      `just deploy akasha-frontend` (the procedure is in 0.5).
   Result: astra-data `515c96e` (rename), `ea8b830` (chronicle), `57dec9c` (stamps), `0bc667c`
   (seasons). The regroup also retitled two seasons and merged Observatory, Slipped's two
   seasons into one. `/chronicle/urth/2026-9-3` and `/Script/Urth/2026-9-3` serve. You don't
   need to wait for the timer: `just linguist-commit --yes` publishes and redeploys at once.
3. **Done 2026-10-30.** **Vault images.** Copy the vault's images from `/home/jbassin/campaign-2/content/Assets/`
   into astra-data `akasha/assets/` (path form and rules: `libs/ts/vellum-lang/README.md`,
   akasha README) and put `![alt](path "caption")` back where the vault embedded them. The
   ones that matter most are the eight Configuration Space plots (`wick/00009`–`00028`), whose
   dialogue says "like this:" with nothing after it. The others are maps (`althane.jpeg`,
   `athrea.jpg`, `badlands.jpg`, `haven.png`, `illyara.jpg`, `occident.jpeg`, `qor-bahi.jpg`,
   `thyropae.jpg`, `toleros.jpeg`, `astra.jpg`; `remnant-map.jpg` was never embedded). The vault
   page that embedded each file shows where it goes. The conversion script from the import,
   which knows the vault-to-akasha path mapping, was at
   `/tmp/claude-1000/-ruby-data-experiments-astra/20b37ef6-060c-4b4d-9409-962c48349ea9/scratchpad/convert/convert.py`
   (scratch; may be gone). Also add the "Inline images" paragraph to the live astra-data repo's
   `README.md` (the seed copy `deploy/astra-data/README.md` in astra already has it).
   Result: astra-data `7fbb152`, deployed. Ten maps under `akasha/assets/maps/` (downscaled to
   1600 px, JPEG quality 75: 0.3 to 0.8 MB each; the originals ran to 62 MB) and eight plots
   under `akasha/assets/configuration-space/`. `00009.jpg` and `remnant-map.jpg` were never
   embedded and stay out. The seed README now matches the live one.
4. **Done 2026-10-31.** heartwood backfill: all 27 sessions published (03:06 to 16:55 UTC,
   no failures, $9.74; ledger about $33.6 of $100). The wiki went from 531 to 640 pages;
   akasha redeployed by the backfill. #171 landed first: heartwood stamps pages a run creates,
   and updated or moved pages only if they already list a campaign. Checked afterwards: no page
   that had no list gained one. The backfill reorganized Ushas into `Geography/Ushas/index`
   plus `Geography/Ushas/New Volcantum`, and filed the Deep Eyes characters under
   `People/Althane/`.
5. **Done 2026-10-31.** Chronicle entries for the 25 imported sessions (astra-data `a41f60a`;
   the script regroups the seasons itself, so no separate `campaign_timeline` run). Deep Eyes is
   one season of 23 episodes. The regroup split Through a Song, Darkly into 7 seasons ("The End
   of the Menhir" carved out of "Aboard the Strider") and moved some boundaries. The Sessions
   page (#176) labels the main campaign "Campaign 3", lists Deep Eyes under "Earlier campaigns"
   as "Campaign 2" and the rest under "One-shots", from a new `being.kdl` campaign `number`.
   Original: **Chronicle for the imported sessions, paid (cents each).** `uv run python
   apps/linguist/py/scripts/backfill_chronicle.py`, then materialize `campaign_timeline`. Label
   Deep Eyes "Campaign 2" on akasha's Sessions page rather than as a one-shot.
6. **Done 2026-10-31.** Josh answered the questionnaire; astra-data `9d4f848` writes it
   in: 14 new pages (the Undermountain, Penthes, Sigil, Ushas's Far Realms, Dahl, Samael,
   Sacrament, the False Hydra, the Locus, Mephistopheles, Uriel (alias Luce), Dragon, Formless,
   Metals, Big Fish) and additions to about 25 more, all `risk-of-ruin` unless shared lore.
   Corrections: the Broker is T3C (said "Tech", never spelled so; "he"), Rotok refused
   immortality, Dawnmonger is "Dawn", Muriel is Uriel, SeRaan was the Sundom wreck's one
   survivor. Then Josh gave Deep Eyes before the recordings (astra-data `e331647`): the
   train to Toleros, Hali and Tenno, Grimm and the Beast's dream, the Trip the Light Fantastic,
   the Lighthouse's real origin and the Sundom's betrayal, the Wick, Luce, Oxas's job. Fixes:
   Oxus is Oxas (also Oxide), Karkov never Kharkov, Lev's full name Lev'Myr, the Sundom wreck
   held the crew's regressed descendants with SeRaan (orange) deactivated, Big Fish was one of
   the nomadic Descendants. "The great ship Shoa" was heartwood misreading "the big Sundom
   ship, so…" (2025-5-5) and is gone. `defs.kdl` gains Karkov, Oxas, Lev'Myr, Toleros, Ret
   (variant "Rett"), and Imex and Sondheim variants. Also fixed: KiRiin is Immix's Kaathe aide,
   not a Ki-Rin (void-touched chitinous unicorns, campaigns 1 and 3), and Immix is "he"; Syrin's
   dream is the Ret, short for reticulum, never "Rhett" (astra-data `12ae48c`, `7964ad6`).
   Three Deep Eyes lines still say "Rhett": a `Rhett` rule would also rewrite "Thanks, Rhett"
   (2026-3-30), which is not the Ret. Original: **Slice 7, the questionnaire** for Josh (campaign 1 and Deep Eyes gaps); seeds in slice 7
   below.
7. **Wrap-up:** tick section 5, update `docs/now.md` and `docs/backlog.md`, remove the
   finished agent worktrees under `.claude/worktrees/` (`git worktree list`).

### 0.3 Open questions for Josh

- None.

### 0.4 Decisions and facts (Josh, 2026-10-30 and 31)

- Sedecium began when the campaign-1 party found a Kaathe construct in the wreck of a Fifth
  Sundom starship in the Far Realms of **Ushas**, which is not Færrin's Far Realms on the
  Infinite Horizon (Sedecium's people were later wrecked there: the Hesperid). Written into
  `Org/Sedecium`, `Geography/Ushas/index`, the Færrin Far Realms page, `Bestiary/Kaathe` and
  the Sundom page (astra-data `18c42ea`). Whisper sometimes writes "Kaathe" as "cave"
  (2026-5-21, Deep Eyes 2024-10-28); no lexicon rule, since "cave" is a common word.
- Tanner's campaign-1 cleric is **Rotok**; speech-to-text writes "Rodic". `defs.kdl` corrects
  it (stored corrections rewrite the transcripts), and the wiki page is `People/Rotok`
  (astra-data `1587547`). One 2026-10-12 line says "Rodick" in an unclear context; left alone.
- Holy Gold is not a contradiction. Sky Metal: "blessed by the Outer Gods" is Færrin's current
  belief, the disproof is Althane's; both stay.
- The place-like `Org/` pages (the Providence, Harlequin Town, the fixed-site businesses) stay
  where they are.
- "Afro-China" and "Elephant Graveyard of Wonders" are aliases of `Org/Bisney and Dixar/Arcane
  Intelligence` again (astra-data `18c42ea`).
- Campaign 1 is Risk of Ruin (5e, Ushas): Jorge was Zuggarian "Zugg" (merfolk wizard), Tanner
  Rotok (half-orc cleric of Tempus), Mike T3C (warforged Seeker, homebrew), Noah Dorcan (firbolg
  druid). They founded Sedecium; the players came up with it. Player-known lore for slice 7 is
  listed there.
- Deep Eyes roster: Jorge Lev, Noah Dawnmonger ("Dawn" or "Don"; his earlier character Big
  Fish died at the night market before the recordings began), Mike Divex, Tanner Henrik.
  T3C is the Broker; the Deep Eyes party knows it.
- One-shots in Færrin during campaign 2: The Midnight Sun (2024-10-21: Noah Banyan, Tanner
  Giancarlo, Mike Crindle Vilksnake) and Hildebrandt Heist (2024-11-20: Noah Adzuki, Tanner
  Mika, Mike Chris Gangle, Jorge Vint Cerf). The first Færrin one-shot predates the recordings.
- Not the Astra, kept out: Jorge's Starfinder (2025-6-30, 2025-7-7; skipped in `sessions.kdl`),
  Tanner's The Blue Remains (2025-7-14 to 2025-8-11; 2025-8-11 skipped) and 2025-10-8, Fey in
  the Mists, Chuul Hunt.
- Urth is in the Astra but self-contained: the world Noah uses for his one-shots. One show,
  `urth`. 2026-5-21 is a real campaign-3 session (an earlier guess said otherwise).
- Geography is nested by world. The Infinite Horizon's Joker Worlds (Far Realms, the Quorum at
  Star 221,325, the Menagerie, Glacier, Hellsmouth) sit under `Geography/Færrin/Infinite
  Horizon/`; Hesperid and Hesperid 3 are in the Far Realms. The Black and White and the Godhome
  are Færrin's alternate planes. Færrin is near the Astra's core.
- The campaign-2 vault was shown to the players: all of it may be published. Its quoted
  passages are diegetic. The vault's front page (Aut's greeting) is not imported. YuDaan's
  treatise is converted faithfully and otherwise left alone. Rules text on ancestries is
  dropped. Althane's Deep is campaign 3's Deep. Earth is Urth. Starmetal is Sky Metal. Campaign
  3's rare gold spikes are Holy Gold.
- APEX: portfolios are game classes, not lore; only three general facts went onto the
  Thessians page. Josh's full Thessian list is GM-only and must never reach the repo, the wiki
  or heartwood's inputs (this repo is public).
- "Known from" is a per-page list set in code, never by the model. Pinned-roster tests are
  replaced by invariant tests; don't reintroduce tests that pin the campaign list.

### 0.5 Procedures and traps learned this session

- **Publishing a hand edit to astra-data:** work in your own clone (never the live one at
  `/ruby/data/astra-state/astra-data`), validate with `node --import
  ./libs/ts/vellum-lang/node_modules/tsx/dist/loader.mjs
  libs/ts/vellum-lang/scripts/validate-corpus.ts --dir <clone>/akasha/content`, then
  `ASTRA_CONTENT_ROOT=<clone> uv run akasha-snapshot` and `... uv run
  astra-ontology-entity-seed`, commit, push, then `flock -w 600
  /ruby/data/astra-state/locks/git-publish.lock git -C /ruby/data/astra-state/astra-data pull
  --ff-only` and `just deploy akasha-frontend`.
- **akasha URLs use hyphens for spaces** (`Phenomena/Sky-Metal`); a 404 on a spaced URL is not a
  missing page.
- **Auto-merge did not always stick.** Verify with `gh api graphql -f
  query='{repository(owner:"jbassin",name:"astra"){pullRequest(number:N){autoMergeRequest{enabledAt}}}}'`.
- **Long compound commands that push get denied** by the permission layer; run `git push` on
  its own. Force pushes are denied; a never-pushed branch needs no `-f`.
- **The system `python3` doesn't run in worktrees** (pyenv wants 3.12); use `uv run
  --no-project python -I`.
- **A local `just ci` can pass while CI's ratchet fails** on knip, because generated files
  (akasha's `site.ts`) exist locally and hide an unused export.
- **Agent worktrees share the scratchpad**, so parallel agents' CI logs can interleave.
- **Not done from the images review (informational):** the corpus-wide validator callers
  (`snapshot.validate_corpus`, `astra_ops.heartwood.validate_argv`) rely on the assets folder
  sitting beside the content folder instead of passing `--assets` from config. Fine with the
  live config.
- **The entity seed merges `being` characters into pages by name alone.** Since #167, Mike's
  Cagley character Chuck marks the Harlequin NPC page `Org/The Harlequins/People/Chuck` as
  `being="mike"`. Nothing reads `being` yet; it's in the backlog.
- **Pre-existing bug, untouched:** a link to the nonexistent `Divinity/Outer Gods/index`
  silently resolves to the wiki's root `index`.

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
- [x] 3b. akasha "Known from" line (#164, deployed `96d1ff67`; it shows on every page with a
  non-empty list, campaign names joined with "and")
- [x] 4. Vault imported and reviewed (astra-data `f25fcd9`; the vault replaced the archive repo)
- [x] 4a. Inline images served by akasha (#165, reviewed independently; symlinks never followed)
- [x] 4b. Geography nested by world (#166; astra-data `ccbc24e`); Hellsmith → Hellsmouth
- [x] 4c. Urth registered as one show; `sessions.kdl` `campaign=` override (#167)
- [x] Deploy #165 to #167 (`8650c097`, 2026-10-31)
- [x] Urth content follow-up (0.2 step 2; astra-data `0bc667c`, 2026-10-30)
- [x] Vault images added (0.2 step 3; astra-data `7fbb152`, 2026-10-30)
- [x] 5. heartwood backfill (27 sessions, $9.74, 2026-10-31; #171 stamping rule first)
- [x] 6. Chronicle backfill (paid), Sessions label (astra-data `a41f60a`, #176, 2026-10-31)
- [x] 7. Questionnaire answered and written up (astra-data `9d4f848`, `e331647`, 2026-10-31)
- [ ] Wrap-up: now.md, backlog, heartwood, linguist and ontology READMEs

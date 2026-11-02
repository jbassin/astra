# Cast file brief: the villain and NPC tier list

You are the research producer for a special episode of a podcast about a Pathfinder 2e
tabletop campaign. This episode is not a recap. It is a TIER LIST: three hosts rank the
people of the Astra on two boards. First the VILLAINS, S to D by how dangerous they are.
Then ALL THE NOTABLE NPCS, S to D by how much the hosts love them. You do not write
dialogue and you do not rank anyone. You build the file the hosts will argue from: who each
character is, what really happened with them, and the best case for a high and a low
placement.

The game master knows every character and will listen to the episode. So everything in the
file is established fact or copied words; the hosts bring the opinions.

`prepare` fills in this run's paths and values in the copy of this brief it writes to the run
dir; read that copy, not the one in the repo.

## The hosts

- **Bram** and **Maeve** are old friends who have followed the main campaign from the start
  and know the GM's earlier games in the same world. Bram argues from the gut and
  misremembers details; Maeve knows the world and remembers where each moment came from.
- **Nell** joined this season, has played a lot of Pathfinder, and has heard the recent
  episodes. She asks plainly about any name from the earlier games she hasn't met, and
  reads the GM's craft like a player.

So an entry from an earlier game needs enough background that Bram and Maeve can explain
the character to Nell.

## The field

The whole Astra: the main campaign, `{{SHOW}}` (through its session of `{{LATEST}}`), plus
the GM's earlier Astra campaigns and one-shots. `astra.md` in the run dir lists those games
with their campaign slugs, worlds and player characters; `being.kdl` is the source.

- **Favour the main campaign.** Most entries on both boards come from it.
- **Include earlier-campaign characters the main campaign touches**: a villain, power or
  ally the party met, or heard of, whom an earlier game's wiki pages also describe.
- **Add the standouts** from the earlier games even when the main campaign has not touched
  them: the villains the players still talk about, the NPCs everyone loved.
- **Villains** (6 to 14): the people and powers working against the party or the world.
  Choose for range: the cosmic threat, the personal nemesis, the one who got away, the
  one who turned out sympathetic.
- **NPCs** (12 to 25): every notable non-player character, friend, foe or in between.
  Choose characters the players reacted to: allies, patrons, rivals, comic relief, the
  ones who died. A villain may also appear on the NPC board (the hosts can love a
  villain); give them a separate entry there with the case framed for affection.
- No player characters or their companions on either board. The `role` entries under each
  campaign in `being.kdl` name them.

## Where the inputs live

Read-only. Do not write anywhere but the run dir.

| Input | Config key (`ontology/ontology-config/config.kdl`) | Path for this run |
| --- | --- | --- |
| Session transcripts | `data.linguist-transcripts` | `{{TRANSCRIPTS}}` |
| The wiki (akasha content) | `data.akasha-content` | `{{CONTENT}}` |
| The chronicle (seasons and per-episode summaries) | `data.linguist-timeline` | `{{TIMELINE}}` |
| Campaigns, players and characters | `being.kdl` | `{{BEING_KDL}}` |
| The run dir (your output goes here) | `mouthpiece-producer.artifacts-path` | `{{RUN_DIR}}` |

- **Transcripts** are named `<prefix>.<campaign slug>.<YYYY-M-D>.txt`, one per session
  (`sessions.kdl` in `ontology/ontology-being/` overrides a few). Each line is
  `NNNNNN<TAB>Speaker: text`; the number is the line number you cite. `sessions.md` in the
  run dir lists which transcript belongs to which campaign. The Gamemaster voices every NPC.
- **The wiki** is `.vellum` files: markdown with YAML front matter and `[[Path|label]]`
  links. Its `People/` folders (at the top and under organizations, such as
  `Org/<Org>/People/`) are your starting list: a page's front matter `campaigns: [...]`
  names the campaign slugs the character is known from. Places sit under
  `Geography/<World>/`; gods and powers have their own folders. Cite a page by its path
  without the extension, as in `People/Galzu`.
- **The chronicle**: `seasons.json` holds each season's title and arc; `episodes/*.json`
  holds each session's title, synopsis and the people, places and factions in it.
- **In the run dir**: `overview.md` (every season and session of the main campaign),
  `astra.md` (the other games), `sessions.md` (transcripts by campaign) and
  `cast.schema.json` (the exact schema below).

## How to work

1. **Candidates.** Start from the wiki's `People/` pages and the chronicle's per-episode
   people. List the candidates for each board, with the campaigns each is known from.
2. **Choose.** Cut to the board sizes above, favouring the main campaign and range.
3. **Moments.** For each entry gather 2 to 6 moments. Copy the words exactly, 5 to 40
   words, from a transcript line (give `show`, `date` and `line`) or a wiki page (give
   `show` and `page`). Do not paraphrase inside `quote`. The best moments are what the
   players were shown: the Gamemaster's narration, what the NPC said, and the wiki. In
   `shows`, say in one sentence what the moment shows about the character.
4. **Background.** Write `role` (one sentence) and `background` (3 to 6 sentences of
   established fact: what they did, what the party saw and was told, the context a
   listener needs). Facts, not theory.
5. **The case each way.** Write `case_for_higher` and `case_for_lower`: the strongest honest
   argument for a high and for a low tier on that board (danger for villains, affection for
   NPCs). Ground both in moments. Put what is still unknown in `open_questions`, and list in
   `ties` the names of other entries in the file they are bound up with.
6. **The wider setting.** In `setting`, write up to 15 notes on the cosmology, powers,
   organizations and history the placements lean on, each naming its wiki pages.
7. **Write and validate.** Write `{{RUN_DIR}}/cast.json`, then run
   `just mouthpiece-tierlist validate {{RUN_DIR}}`. It prints counts, or each problem by its
   location in the file. Fix and rerun until it passes.

## Rules

- **Homebrew lore only.** Use only the GM's own world, the Astra: these campaigns and their
  wiki. Published Pathfinder setting lore does not apply, even when a name matches.
- **Never invent.** No event, scene or line that is not in a transcript or on the wiki.
- **No mechanics.** Leave out dice, modifiers, DCs, HP and levels.
- **Campaign slugs** in `campaigns` and in each moment's `show` are `being.kdl` campaign
  slugs (the `campaign "<slug>"` lines), exactly.
- **Names** in `ties` match another entry's `name` exactly.
- **Report counts only.** Your final message gives the board sizes and how many moments you
  cited. Never list names, placements or quotes in it: the GM reads that message.

## The schema

`cast.json` must validate against this JSON schema (also in the run dir as
`cast.schema.json`, and printed by `just mouthpiece-tierlist schema`):

```json
{{SCHEMA}}
```

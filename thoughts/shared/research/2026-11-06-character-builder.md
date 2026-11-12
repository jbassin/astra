# Character builder: plan

- **Date:** 2026-11-06
- **App:** `apps/builder/web`, served at `https://builder.iridi.cc` (port 10375). Operations and
  traps are in its README.

## 0. Goal

A D&D 5e (2024 rules) character builder for Josh's five brand-new players. Each player opens a
private, unguessable link and walks a guided flow: pick one of four archetypes (warrior,
scoundrel, mage, healer), then a class from the ones Josh allows for that archetype, then species,
background, spells, gear, and a name and look. Answers save on the server as they go, so a player
can come back and change them. Josh sees everyone's picks on a DM page. The final output is a
plain-language "on your turn" sheet plus ability cards, readable on screen and in print.

## 0.1 Progress and next steps (updated 2026-11-12)

**Process:** plan in the chat, ship in slices, each slice one pull request that leaves `main`
green. This file is the plan; this section is the checklist.

**Slice 1: skeleton, links, saving, DM page (stub content).**
- [x] Scaffold with `just new-frontend builder` (port 10375); config block with `public-origin`,
  `data-dir` and `dm-token ref="sops:builder_dm_token"`; compose service with the identical-path
  bind mount and `BUILDER_DM_TOKEN`; public Caddy stanza.
- [x] akasha's look: tokens (light and dark), Literata and Archivo.
- [x] `just builder-invite <name>`: random 128-bit id, atomic append to `roster.json`, prints the
  link.
- [x] `/c/<id>`: friendly 404 for unknown ids; stub steps (archetype, name, look); debounced
  auto-save through a zod-validated server function; resume on reopen; save state shown.
- [x] Versioned character document (`schemaVersion: 1`, `updatedAt`, `answers`).
- [x] `/dm/<token>`: constant-time token check, plain 404 otherwise; every player's link, last
  save, progress and answers.
- [x] `astra.builder.saves{outcome}` counter, save span, RUM.
- [x] Tests: store, token check, DM view, SSR smoke.
- [x] `builder_dm_token` added to `deploy/sops/secrets.enc.yaml` (32 random characters) and
  required by `deploy/tests/test_sops_refs.py`.

**Slice 2a: content and rules engine.** Data source: the public 5etools data, XPHB only, content
committed (Josh's decision). Characters are level 2.
- [x] Importer `scripts/import-5etools.ts` (`just builder-import <data> <commit>`) to trimmed,
  plain-text JSON in `content/5etools/`, pinned commit in `meta.json`; `{@tag}` converter with
  tests.
- [x] Curation in `content/*.ts`: Josh's archetype → class table, blurbs and primary ability;
  per class the ability priority, skills, expertise, masteries, tools and option and spell
  shortlists; species, background, feat, option, mastery and spell summaries.
- [x] `scripts/build-content.ts` → `src/generated/content.ts`, failing on dangling ids, missing
  summaries and shortlists that can run out; counts read from the class table.
- [x] `Answers` extended (optional, bounded; slice 1 documents still parse); `pruneAnswers`,
  `stepStatuses`/`nextStep`; DM progress counts only the steps that apply.
- [x] `buildCharacter` in `src/domain/engine.ts`, with one hand-checked character per class.
- [x] Josh reviewed the shortlists (2026-11-07); the ranger now puts Dexterity first (#209).

**Slice 2b: the player flow and the sheet.** Builds on `content.ts`, `steps.ts` and
`engine.ts` (the app README lists the API).
- [x] Screens for kind of hero, class, species and sub-choice, background, class options, spells
  (every `spellPickLists` list), and About you (name, look, personality), with a progress rail
  (done, to do, blocked) and resume at the first unfinished screen; `pruneAnswers` on every
  change, with one plain line naming what it cleared.
- [x] Nothing preselected, no class-option recommendation, a Recommended badge on curated
  spells, live "Pick N" counts, greyed-out repeats with the reason, requirement issues shown.
- [x] The "on your turn" sheet and one card per feature and spell from `buildCharacter`, with
  print styles (cards on their own page, dashed cut lines); what's left to choose instead of
  numbers while `missing` is non-empty.
- [x] `/test`: the same flow and sheet with no saves (persistence injected; a test proves the
  save function is never called), linked from the home page.
- [x] DM page: each player's class, species and background, and their full sheet.
- [x] Tests: Fighter and Wizard picked through the flow, pruning on class change, recommended
  markers and nothing preselected, test mode never saves, sheets for a Barbarian and a Cleric,
  SSR smoke for `/test`.

**Slice 3: the builder chooses every spell (Josh's call, 2026-11-07).** New players were
offered too many choices.
- [x] Curated spell lists become ordered lists the builder takes in order (`spellPicks`), with
  backups for cantrips the species or an earlier list already gives; class spells, fighting-style
  cantrips and Magic Initiate alike. The spells screen and the spell answers are gone.
- [x] A test resolves spells for every class, species, background and spell-changing option.
- [ ] Josh reviews the eight class sets (and the Magic Initiate and fighting-style order).

**Slice 4: less reading (Josh's call, 2026-11-12).** A new player read 700 to 1,000 words to
build a character and got a sheet of 1,000 to 2,400 more; the cuts delete text and choices and
write none.
- [x] Choice cards show one line: background cards lose the talent text and nothing folds out
  (#231).
- [x] The builder picks the species sub-choice from the class (`speciesOptions` in
  `content/classes.ts`) and shows it as the species (#231).
- [x] The sheet describes each thing once, on its card; a spell's card shows its gist; what
  already shows in a number gets no card (#232).
- [x] Deployed and checked on `/test` (2026-11-12).
- [ ] Josh checks the per-class species picks (#231) and the things that lost their card (#232).
- [ ] Delete the text nothing shows now (spell summaries, the summaries of `applied` items).

**Slice 5: a sheet to play from (Josh's feedback, 2026-11-12).** The one-shot has no rest,
long or short, the players should choose less, and the sheet should work at the table. Sonnet
agents implemented each part in its own worktree; the main session reviewed, checked it in a
browser and merged.
- [x] The builder picks every class option (fighting style, Divine and Primal Order,
  invocations, Metamagic): the first entries of each class's ordered shortlist. The Class
  choices screen and the `options` answer are gone (#236).
- [x] A class another player holds is greyed out ("Taken by Ada") and the server refuses it;
  an archetype with no free class greys out too (#234).
- [x] Pressing a name that has a card opens the card (#237).
- [x] No rest wording anywhere on the sheet ("No short rest either", Josh, 2026-11-12): a use
  count reads "2 uses", Hit Dice are gone, and a feature that only works on a rest has no
  card. No note says where a number comes from: the math is in the number. Armor of Shadows is
  in the Armor Class (#238).
- [x] Hit Points go up and down, and spell slots and every limited use have pips to mark; the
  marks save with the character (`play` in the character document) and `/test` keeps them in
  the tab (#239).
- [x] Deployed and checked on `/test` (2026-11-12): flow, a Warlock and a Paladin sheet, marks,
  the card pop-up, the DM page and print, in Chromium at phone width.
- [ ] Josh checks the class-option picks (#236) and the reworded lines (#238).

**Go live.**
- [x] Merged, `just deploy builder`, `just caddy-reload` (2026-11-07).
- [x] SOPS secret added (#210); the DM link answers 200 and a wrong token 404.
- [ ] Invite the five players with `just builder-invite` and send each their link.

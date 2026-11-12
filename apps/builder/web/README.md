# builder — the D&D 5e character builder

builder (`@astra/builder`) walks Josh's five new players through making a D&D 5e (2024 rules)
character. Each player gets a private, unguessable link; their answers save on the server as they
go, so they can come back and change them. Josh sees everyone's picks on a DM page. It is an SSR
frontend on the site-kit preset (`libs/ts/site-kit/README.md`), running as the Compose service
`builder` on port 10375 (`service.name=astra.builder`) behind Caddy at `https://builder.iridi.cc`.
The plan and checklist are in `thoughts/shared/research/2026-11-06-character-builder.md`.

It covers twelve level 2 classes from the 2024 Player's Handbook, with Josh's archetypes,
curated shortlists, spells the builder chooses, and plain-language summaries. `buildCharacter` derives the whole sheet, and the
player page walks through every choice to a printable "On your turn" sheet with cut-out cards.

## Routes

- `/`: a short welcome that points players at their link, and at `/test`.
- `/c/<id>`: a player's builder. An id not on the roster gets a friendly 404. Every change saves
  after a short pause (the `saveAnswers` server function); the page shows Saving…, Saved or an
  error. Reopening the link resumes at the first screen with something left to do. One class
  per player (Josh's call, 2026-11-12): a class another player holds is greyed out
  ("Taken by Ada"), and the server refuses it (see The flow and the sheet).
- `/test`: test mode, public. The same flow and sheet with nothing saved: the answers live only
  in the tab's React state, a banner says so, and Start over clears them.
- `/dm/<token>`: every invited player with their link, last save, progress, class, species and
  background, and each player's full sheet in a fold-out. A wrong or missing token, or no token
  configured, gets the same plain 404 as any unknown URL.

## The flow and the sheet

`src/components/BuilderFlow.tsx` runs the flow; it never saves anything itself. The page passes
`persist`, which gets every change: `PlayerBuilder` passes the debounced server save
(`useAutosave`), `TestBuilder` a no-op. `TestBuilder.tsx` must not import `@/server/builderFns`;
`TestBuilder.test.tsx` checks both that and that the save function is never called.

- **Screens** (`src/domain/flow.ts`): kind of hero, class, species, background, About you
  (name, look and personality), then the sheet. There is no spells screen, no class choices
  screen and no species sub-choice: the builder chooses every spell (Josh's call, 2026-11-07),
  every class option (fighting style, Divine and Primal Order, Eldritch Invocations,
  Metamagic) and each species' lineage, colour, ancestry or legacy (Josh's call, 2026-11-12),
  and the sheet shows them.
  Each screen groups one or more steps from `steps.ts`; `viewStatuses` marks each done, to do
  or blocked, and hides the ones that don't apply (none is hidden today). The quest path (`flow/Stepper.tsx`)
  jumps to any screen; Next and Back, in the bar pinned to the bottom of the screen with the
  save state, skip the ones that don't apply.
- **Taken classes** (`takenClasses` in `src/server/builder.ts`): the page loader and every save
  response carry `taken`, a map from class id to the name of the player who holds it (never the
  asking player; the first on the roster wins a tie). `PlayerBuilder` keeps it in state and
  replaces it after each save. `ClassScreen` disables a taken card with the tag "Taken by
  <name>"; `ArchetypeScreen` disables an archetype whose classes are all taken ("All taken").
  The first save wins: `savePlayerAnswers` stores answers without a class another player holds
  (and without the picks that depend on it). A player who loses that race sees the class
  cleared and "<name> picked <class> first. Pick another class." the moment the next save
  response, or the page load, shows it taken. `/test` passes no `taken`, so nothing greys out.
- **Every change** goes through `pruneAnswers(next, previous)`, and `clearedSummary` tells the
  player in one line what that cleared ("That change cleared your background.").
- **The species sub-choice follows the class** (Josh's call, 2026-11-12). The builder gives the
  lineage, colour, ancestry or legacy the class names (`speciesOptions` in
  `content/classes.ts`, read by `speciesOptionOf`): a Wizard who picks Elf is a High Elf, a
  Ranger a Wood Elf. The species step is complete once a species is picked, and nothing about
  the sub-choice is saved. Changing the class can change the sub-choice; the player gets no
  notice. Before a class is picked there is no sub-choice.
- **One species name** (`speciesName` in `src/domain/content.ts`), on the species cards, the
  sheet and the DM page: the sub-choice in front of the species ("Red Dragonborn", "Drow Elf",
  "Infernal Tiefling"), or the sub-choice alone when it already says the species ("High Elf",
  "Forest Gnome"). A Goliath stays "Goliath" (`option.inName: false` in `content/species.ts`);
  its giant ancestry is a trait on the sheet.
- **Josh's calls:** nothing is preselected on the screens that remain. The choice cards say
  little (2026-11-12): nothing folds out and a background card shows its story only; the full
  summaries are on the sheet. The builder picks the species sub-choice from the class and every
  class option (2026-11-12, the bullets above). The builder chooses every spell: class
  cantrips and level 1 spells, a fighting style's cantrips and Magic Initiate's
  (`spellPicks`). No ability-score math anywhere.
- **The sheet** (`src/components/sheet/`, wording in `src/domain/sheet.ts`) describes each
  thing once, on its card; the rest is numbers, roll lines and names. It shows the four key
  numbers; "On your turn" (action, bonus action, reaction, always on), where an attack shows
  what to roll and everything else only its name and uses; the spells per source, with DC,
  attack bonus, slots and the spells' names; the abilities; "Things you're good at"
  (proficient skills); gear; and one card per feature and spell. A feature's card carries its
  summary; a spell's carries its roll, its uses and its one-line `gist`. Something that
  already shows in full in a number or a line gets no card (`hidden` and `applied`, under
  Curation below). While `missing` is non-empty it lists what's left to choose instead of
  numbers.
- **Print:** `src/styles/print.css`. The browser's print gives the sheet alone on white, ink-light
  (outlines instead of filled banners), with the cards on a new page in a grid of dashed cut
  lines. The DM page prints each open sheet on its own page.

## The look

"The guild charter": cool linen and deep ink by day, lantern-lit slate by night, gilt for the
quest path, and one heraldic hue and icon per class (`src/ui/heraldry.ts`) on its choice card,
the sheet banner and its cards. Phone first: most players use a phone.

- **Type:** Texturina (display) and Atkinson Hyperlegible Next (reading text, tabular figures),
  self-hosted through `@fontsource-variable` (SIL OFL 1.1), imported in `src/routes/__root.tsx`.
  builder doesn't use gothic's theme (`theme: false` in `vite.config.ts`).
- **Icons:** game-icons.net (CC BY 3.0, by Lorc, Delapouite and other artists; the footer
  credits them) for the game's world, Lucide (ISC) for the interface. `scripts/icons.ts` lists
  every icon used; `build-content.ts` runs it to write `src/generated/icons.ts`, so the client
  ships only those SVG bodies. Draw one with `<Icon name="…" />` or `<Crest icon="…" />`
  (`src/ui/Icon.tsx`); an unknown name fails the type check.
- **Hues:** an element with the `hued` class and `hueStyle(...)` gets `--hue`, `--hue-ink`,
  `--hue-wash` and `--hue-line` (`src/styles/tokens.css`), in OKLCH, tuned per theme.
- **Phone first:** on a phone the quest path is a compact bar ("3 / 8", one segment per
  screen) that opens the steps as a list; from 48rem the waypoints run across the page. The
  path sticks to the top of the screen on every step but the sheet. Once the player moves on
  from the screen they opened, a phone hides the page header and the greeting and shrinks the
  test banner to one line, so each step's heading starts about 90px down; Next, Back and a
  jump scroll to the heading, just under the path, and focus it. The sheet gets a sticky jump
  bar (Turn, Spells, Abilities, Gear, Cards) and folds the cards until asked; a laptop and
  paper always show them. The bottom bar is fixed, except at the end of the sheet on a laptop.
- **Step changes** use the View Transitions API when the browser has it (`go` in
  `BuilderFlow.tsx`), else a CSS entrance.
- **Styles:** `src/styles/globals.css` imports, in order, `tokens.css`, `base.css` (the shell),
  `pages.css` (home and DM), `flow.css`, `path.css` (the quest path), `choices.css`, `sheet.css`, `sheet-details.css`,
  `cards.css` and `print.css`; a later file wins at equal weight. Keep each under 500 lines
  (the ratchet counts long files). Motion is short and answers the player (screen
  change, pick, save); `prefers-reduced-motion` turns it off.

## Content pipeline

Game data comes from the public 5etools data (https://github.com/5etools-mirror-3/5etools-src,
its `data/` dir), XPHB entries only, pinned to the commit in `content/5etools/meta.json`. Three
layers, each feeding the next:

1. **Import** (`scripts/import-5etools.ts`, by hand): reads the 5etools JSON and writes trimmed,
   plain-text JSON to `content/5etools/` (committed). `src/domain/markup.ts` turns 5etools
   `{@tag ...}` markup into plain text on the way in. The shapes are in
   `src/domain/imported.ts`.
2. **Curation** (`content/*.ts`, hand-written, typed by `src/domain/curationTypes.ts`):
   - `classes.ts`: Josh's archetype, pitch and primary ability per class; the ability priority,
     skill and expertise preferences, weapon masteries, tools, Human feat and species
     sub-choices (`speciesOptions`: one id for each species that has sub-choices) the builder
     decides; the option shortlists (fighting styles and the rest) and spell lists; and a
     summary for every level 1–2 feature (or `hidden` with the reason).
   - `species.ts`, `backgrounds.ts`, `feats.ts`, `options.ts`, `masteries.ts`, `spells/*.ts`:
     one-liners and summaries; Magic Initiate spell lists live with their background;
     `spells/rolls.ts` holds what a spell's roll line can't read from the data. A species
     sub-choice has a summary (the sheet shows it as a trait) and no card text.
   - **Spell lists** (`CuratedSpellList`) are what the builder gives, best first. It takes the
     first entries up to the pick count, skipping a cantrip the character already has from the
     species or an earlier list (class, then fighting style, then Magic Initiate) and a Magic
     Initiate spell the class already prepares; entries past the count are backups for those
     repeats, and the build proves there are enough. A Wizard's spellbook is the first
     `spellbookSize` level 1 spells. Changing a character's spells means reordering a list.
   - **Gists:** every spell (`spells/*.ts`) and class option (`options.ts`) also carries a
     `gist`: a class option's one line (nothing shows it since the pick screen went), and a spell's card text on
     the sheet (nothing shows a spell's `summary`). Write one short,
     vivid, plain sentence of what it does for the player (aim for 70 characters; the build stops
     at `GIST_MAX`, 90). Leave out what the card's chips already say (casting time, range, the
     roll, the save), and state a number only when it matches the rules text: "Three glowing
     darts that always hit.", "Snap up a barrier: +5 AC until your next turn."
   - **No card for what already shows:** every feature, trait, option and feat gets a card
     and, by its `activation`, an "On your turn" entry, unless the curation marks it. Mark one
     only when both hold: the engine already put all of it into a number or a line the sheet
     shows (Hit Points, Armor Class, speed, skills, an attack's roll, the spells section, the
     languages and "Trained with" lines), and its rules text leaves nothing to decide or
     remember at the table. Tough is all in the Hit Points; Alert lets the player swap
     initiative, so it keeps its card; so does Thaumaturge, because its bonus lands on skills
     the sheet lists only when the character is proficient. There are two marks, each with a
     reason that says where the effect shows ("Already in your Armor Class."):
     - `hidden` (class features and species traits) leaves the entry out of the generated
       content, so nothing can show it. Use it for a class feature, which only the sheet reads.
       It is also the mark for a trait a level 2 character doesn't have yet and for a heading
       that only introduces picks.
     - `applied` (species traits, sub-choices, class options and feats) keeps the entry and its
       `summary` in the content, where the engine still reads it;
       the engine gives it no feature line. It must be passive with no `uses` (`sheet.test.ts`
       checks).
   - `general.ts`: the language and tool fallback orders.
3. **Build** (`scripts/build-content.ts`, run by vite, vitest and `typecheck`): joins the two into
   `src/generated/content.ts` (gitignored), typed by `src/domain/contentTypes.ts`. It fails,
   listing every problem, on a curated id the import lacks, an imported feature or trait with no
   summary, a list smaller than its pick count (in the worst case, after repeats of species
   cantrips and earlier lists are removed), a blast invocation whose class doesn't always get a
   damaging cantrip, a curated spell or roll no list uses, a spell off the class's list, a count the class
   table doesn't give, a shown item with no `activation`, a spell whose damage or healing
   dice its entry doesn't carry, a missing or over-long `gist`, or a class whose
   `speciesOptions` miss a species that has sub-choices or name one the species doesn't offer.

Pick counts (cantrips, prepared spells, slots, invocations, metamagic, masteries, expertise)
always come from the imported class table or feature text, never from the curation.

### The domain API

- `src/domain/content.ts`: `CONTENT` (the generated module) and lookups: `classOf`, `speciesOf`,
  `speciesOptionOf` (the sub-choice the class gives), `speciesName` (the one name a player
  sees), `backgroundOf`, `classesForArchetype`, `backgroundsForClass`, `chosenOptions`
  (every class option the builder gives: the first `count` of each option group's list),
  `spellPicks` (every spell the builder gives, by source).
- `src/domain/steps.ts`: `stepStatuses` (per step: applicable, complete, blockedBy, issues),
  `nextStep`, `answeredSteps`, `applicableStepCount`, and `pruneAnswers(next)`,
  which the UI calls on every change to drop answers an upstream change made invalid.
- `src/domain/engine.ts`: `buildCharacter(answers)` → `Character`, the derived level 2 sheet
  (abilities, saves, skills, HP, AC with alternatives, speed, initiative, attacks with mastery,
  spellcasting blocks per source, the features that get a card with their uses, equipment,
  proficiencies, `missing`).

### Re-import or edit

- **Edit curation:** change `content/*.ts`, then `just test` (or `just dev builder/web`, which
  rebuilds on save). The build error names every broken reference.
- **Re-import:** check out the 5etools repo (a sparse checkout of `data/` is enough), then
  `just builder-import <path-to>/data <commit-sha>`. Review the `content/5etools/` diff (new or
  renamed features fail the build until they have summaries), and update `meta.json`'s commit in
  the same commit.

## Operations

- **Invite a player:** `just builder-invite <name>`. It adds the player to the roster with a new
  random id (128 bits, base64url) and prints their link. The running server reads the roster on
  every request, so the link works at once. Run it on the host from any checkout after
  `pnpm install`; `ASTRA_DATA_ROOT` points it at another data root.
- **DM link:** `https://builder.iridi.cc/dm/<token>`, where the token is the SOPS secret
  `builder_dm_token` (config `builder.dm-token`, env `BUILDER_DM_TOKEN`, injected by
  `just deploy`). Read it with
  `SOPS_AGE_KEY_FILE=deploy/sops/age.key sops -d --extract '["builder_dm_token"]' deploy/sops/secrets.enc.yaml`.
  Generate the token with at least 128 random bits (`openssl rand -base64 24 | tr '+/' '-_'`):
  nothing throttles guesses, so its length is the only defence.
- Dev server: `just dev builder/web`. Set `ASTRA_DATA_ROOT` to a scratch dir first, or it reads
  and writes the live data under `/ruby/data/astra-state/builder`.
- Deploy: `just deploy builder`.

## Data

Everything lives under `builder.data-dir` (`/ruby/data/astra-state/builder`):

- `roster.json`: `[{ id, name, createdAt }]`, written only by `just builder-invite`.
- `characters/<id>.json`: `{ schemaVersion: 1, updatedAt, answers }`, written by the server.
  `answers` is the zod schema `Answers` in `src/domain/character.ts`; new steps add optional
  fields there, and a change that breaks old files bumps `schemaVersion`. Spells, class
  options and the species sub-choice are not saved: the builder derives them from the class,
  species and background on every load, so a change to those curated lists changes existing
  characters. `Answers` once had an `options` field for class option picks; it was removed on
  2026-11-12 with no `schemaVersion` bump, because no character document existed yet (the
  strict schema now rejects a file that carries it).

Every write goes to a temp file in the same directory and is renamed into place. The server
saves only for ids on the roster, and an id must match the 22-character base64url shape before
it reaches a path. The container writes through an identical-path bind mount, as uid 1000;
`deploy.sh init_artifacts` creates `builder/characters/`. The nightly backup copies the dir (it
takes every data-root dir by default).

## Telemetry

- `astra.builder.saves{outcome=ok|error}` counts saves; each save is a `builder.save` span.
- A failed save logs WARN (a stale tab or a bad link is a user problem, and ERROR pages Discord).
- Browser RUM through the scaffold's `src/observe/rumConfig.ts`.

## Traps

- **The 5etools checkout is untrusted data.** The importer only reads JSON from it and never runs
  git there (a repo's config can run commands), so the commit is passed in by hand. Don't add a
  `git rev-parse` to the recipe.
- **The builder decides, the player picks.** Ability scores, skills, expertise, masteries, tools,
  languages, equipment (option A packages) and the Human origin feat come from the curation's
  preference lists; the engine takes the first entries the character doesn't already have.
  The species sub-choice comes from the class's `speciesOptions` table, one entry per species
  that has sub-choices. Class options (fighting style, Divine and Primal Order, invocations,
  Metamagic) come from each `optionGroups[].choices` list in `content/classes.ts`, best first:
  the builder gives the first `count`, and later entries are alternates. To change a pick,
  reorder that list (the Cleric's `thaumaturge` is first; Protector adds nothing visible
  because the Cleric's gear has no heavy armor). A new class or background needs those lists,
  not new UI. Tests reach options the lists don't pick first with `withShortlist`
  (`src/domain/testShortlist.ts`, test-only).
- **Summaries are checked by number.** `src/domain/summaries.test.ts` fails when a summary
  or a gist states a number (dice, feet, minutes, uses) its rules text doesn't. A right number from
  elsewhere (the character's level, the general ritual rule) goes in its `ALLOWED` with a reason.
- **Some 5etools data is wrong.** The Abyssal Tiefling version claims 120-foot darkvision that its
  text doesn't grant; the importer reads darkvision from the trait text, never the field.
- **Spell rolls come from 5etools markup.** The importer keeps each spell's `{@damage}` rolls
  (`damageDice`), the `{@dice}` rolls of healing spells (`healDice`, `miscTags` HL) and whether it
  adds to a weapon hit (`attackRider`, `miscTags` AAD). The build takes a cantrip's scaling dice,
  else the first damage roll (Eldritch Blast has no scaling field, so it uses its text), and
  decides how it lands: spell attack, else weapon rider, else save, else no roll.
  `content/spells/rolls.ts` corrects that (`on`) and words every roll past the first (`note`);
  the build fails when a damage or healing roll in a spell's rules text appears nowhere on its
  sheet entry. Flat numbers (Armor of Agathys's 5 Cold damage, Goodberry's 1 Hit Point) aren't
  dice and aren't checked. Toll the Dead reads "1d8 or 1d12".

- **The theme follows the system setting.** `src/styles/tokens.css` keeps both dark blocks
  (`data-theme="dark"` and the media query); they must stay identical. There is no theme
  switch, so nothing sets `data-theme` yet.
- **Hue colours resolve where they are declared.** `--hue` and friends are declared on `.hued`
  as well as `:root`, because a custom property built from `var(--h)` resolves on the element
  that declares it. An element that sets `--h` without the `hued` class gets the gilt default.
- **The SSR smoke stubs the environment.** `src/ssrSmoke.test.ts` points `ASTRA_DATA_ROOT` at a
  temp dir with one player and sets `BUILDER_DM_TOKEN`, because the built server reads the real
  `config.kdl`. Without the token the DM check would try `sops -d`, which CI cannot run.
- **SSR HTML splits text around expressions** (`Hi, <!-- -->Ada`), so smoke assertions match the
  pieces, not the joined sentence.
- **The sheet sorts by `activation`, never by wording.** Every shown feature, trait, sub-choice,
  class option and feat carries a curated `activation` (`action`, `bonus`, `reaction`, `minute`
  for a minute or more, `passive` for always on or triggered); spells take theirs from the
  5etools casting unit (an hour reads `minute`). The build fails on a shown item without one.
  Changing a summary's wording moves nothing; change the field. `minute` items stay off "On your
  turn" but keep their card.
- **A `hidden` class feature is gone from the content,** so the engine can't find it in
  `cls.features`: Unarmored Defense, which is hidden, is given by class id. Before hiding a
  feature, search the engine and the tests for its id. A sub-choice replaces the species trait
  its `replacesTrait` names, so hiding that trait would drop the sub-choice's card too.
- **print.css overrides heavier screen rules,** so its rules start with `html` (and the hidden
  parts use `!important`). Its token block repeats the dark blocks' selectors so paper stays
  light.
- **A choice card is one `<label>` and nothing else.** Don't add a "More" disclosure or a
  second block of text to a card; `BuilderFlow.test.tsx` fails when a choice screen has a
  `<details>` or a background card says more than its name and story.
- **Taken classes come from saved files only.** A class counts as held once its owner's save
  lands (after the 700 ms pause), so two players can still pick the same class in that window:
  the later save loses, and its owner gets the notice. A player's own class is never in `taken`.
- **The quest path must stay a direct child of `<main class="flow">`** to stick for the whole
  page (a sticky element only sticks inside its parent). `Stepper` publishes its height as
  `--sticky-h` (0 on the sheet), which the headings' scroll margin uses.
- **Phone-only folds start folded on the server too.** `Fold` and `SheetJump` render the same
  first frame everywhere (folded, nothing marked); CSS shows the content on a laptop and on
  paper, so there is no hydration mismatch and nothing to measure.
- **Playwright screenshots add `caret-color` to inputs,** which shows up as a hydration
  mismatch warning in the console. It isn't the app.
- The cross-app frontend traps are in `libs/ts/site-kit/README.md`.

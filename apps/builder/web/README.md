# builder — the D&D 5e character builder

builder (`@astra/builder`) walks Josh's five new players through making a D&D 5e (2024 rules)
character. Each player gets a private, unguessable link; their answers save on the server as they
go, so they can come back and change them. Josh sees everyone's picks on a DM page. It is an SSR
frontend on the site-kit preset (`libs/ts/site-kit/README.md`), running as the Compose service
`builder` on port 10375 (`service.name=astra.builder`) behind Caddy at `https://builder.iridi.cc`.
The plan and checklist are in `thoughts/shared/research/2026-11-06-character-builder.md`.

It covers twelve level 2 classes from the 2024 Player's Handbook, with Josh's archetypes,
curated shortlists and plain-language summaries. `buildCharacter` derives the whole sheet, and the
player page walks through every choice to a printable "On your turn" sheet with cut-out cards.

## Routes

- `/`: a short welcome that points players at their link, and at `/test`.
- `/c/<id>`: a player's builder. An id not on the roster gets a friendly 404. Every change saves
  after a short pause (the `saveAnswers` server function); the page shows Saving…, Saved or an
  error. Reopening the link resumes at the first screen with something left to do.
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

- **Screens** (`src/domain/flow.ts`): kind of hero, class, species (and its sub-choice),
  background, class choices, spells, About you (name, look and personality), then the sheet.
  Each screen groups one or more steps from `steps.ts`; `viewStatuses` marks each done, to do
  or blocked, and hides the ones a class doesn't have. The rail (`flow/Stepper.tsx`) jumps to
  any screen; Next and Back skip the ones that don't apply.
- **Every change** goes through `pruneAnswers(next, previous)`, and `clearedSummary` tells the
  player in one line what that cleared ("That change cleared your spells.").
- **Josh's calls:** nothing is preselected; class options carry no recommendation; spells the
  curation marks `recommended` show a Recommended badge. Each list shows "Pick N · M picked";
  a full multi-pick list disables the rest, and `unavailableSpellIds` are greyed out with the
  reason. `optionRequirementIssues` show above the spell lists. No ability-score math anywhere.
- **The sheet** (`src/components/sheet/`, wording in `src/domain/sheet.ts`): the four key
  numbers, "On your turn" (action, bonus action, reaction, always on), spells per source with
  DC, attack bonus and slots, "Things you're good at" (proficient skills), abilities, features
  with uses, gear, and one card per feature and spell. While `missing` is non-empty it lists
  what's left to choose instead of numbers.
- **Print:** `src/styles/print.css`. The browser's print gives the sheet alone on white, with
  the cards on a new page in a grid of dashed cut lines. The DM page prints each open sheet on
  its own page.

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
     skill and expertise preferences, weapon masteries, tools and Human feat the builder decides;
     the option shortlists (fighting styles and the rest) and spell shortlists; and a summary for
     every level 1–2 feature (or `hidden` with the reason).
   - `species.ts`, `backgrounds.ts`, `feats.ts`, `options.ts`, `masteries.ts`, `spells/*.ts`:
     one-liners and summaries; Magic Initiate shortlists live with their background.
   - `general.ts`: the language and tool fallback orders.
3. **Build** (`scripts/build-content.ts`, run by vite, vitest and `typecheck`): joins the two into
   `src/generated/content.ts` (gitignored), typed by `src/domain/contentTypes.ts`. It fails,
   listing every problem, on a curated id the import lacks, an imported feature or trait with no
   summary, a shortlist smaller than its pick count (in the worst case, after repeats of species
   cantrips and earlier picks are removed), a spell off the class's list, or a count the class
   table doesn't give.

Pick counts (cantrips, prepared spells, slots, invocations, metamagic, masteries, expertise)
always come from the imported class table or feature text, never from the curation.

### The domain API

- `src/domain/content.ts`: `CONTENT` (the generated module) and lookups: `classOf`, `speciesOf`,
  `speciesOptionOf`, `backgroundOf`, `classesForArchetype`, `backgroundsForClass`,
  `pickedOptions`, `chosenOptions`, `spellPickLists` (every spell list the player picks from,
  with its count and `Answers` field), `unavailableSpellIds` (choices to grey out),
  `optionRequirementIssues`.
- `src/domain/steps.ts`: `stepStatuses` (per step: applicable, complete, blockedBy, issues),
  `nextStep`, `answeredSteps`, `applicableStepCount`, and `pruneAnswers(next,
  previous)`, which the UI calls on every change to drop picks an upstream change made invalid.
- `src/domain/engine.ts`: `buildCharacter(answers)` → `Character`, the derived level 2 sheet
  (abilities, saves, skills, HP, AC with alternatives, speed, initiative, attacks with mastery,
  spellcasting blocks per source, features with uses, equipment, proficiencies, `missing`).

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
  fields there, and a change that breaks old files bumps `schemaVersion`. Curated ids (spells,
  options, sub-options) are bounded slugs, not enums, so a curation change never makes a saved
  file unreadable; `pruneAnswers` drops the ids the content no longer offers.

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
  preference lists; the engine takes the first entries the character doesn't already have. A
  new class or background needs those lists, not new UI.
- **Summaries are checked by number.** `src/domain/summaries.test.ts` fails when a summary
  states a number (dice, feet, minutes, uses) its rules text doesn't. A right number from
  elsewhere (the character's level, the general ritual rule) goes in its `ALLOWED` with a reason.
- **Some 5etools data is wrong.** The Abyssal Tiefling version claims 120-foot darkvision that its
  text doesn't grant; the importer reads darkvision from the trait text, never the field.
- **Cantrip damage has no structured field for Eldritch Blast** (beams, not scaling dice); the
  build falls back to the first "NdN Type damage" in the text. Toll the Dead reads "1d8 or 1d12".

- **The theme follows the system setting.** `src/styles/tokens.css` is copied from akasha's and
  keeps both dark blocks (`data-theme="dark"` and the media query); they must stay identical.
  There is no theme switch, so nothing sets `data-theme` yet.
- **The SSR smoke stubs the environment.** `src/ssrSmoke.test.ts` points `ASTRA_DATA_ROOT` at a
  temp dir with one player and sets `BUILDER_DM_TOKEN`, because the built server reads the real
  `config.kdl`. Without the token the DM check would try `sops -d`, which CI cannot run.
- **SSR HTML splits text around expressions** (`Hi, <!-- -->Ada`), so smoke assertions match the
  pieces, not the joined sentence.
- **The sheet sorts by plain words.** `featureSlot` reads "bonus action", "reaction" or "as an
  action" from a feature's summary, and `spellSlot` reads the spell's casting time. A new summary
  that names its action differently lands under "Always on"; check the sheet after editing one.
  Spell summaries open with "Action." or "Bonus action.", which `spellGist` skips.
- **print.css comes before globals.css's own rules** (it is one of globals.css's `@import`s), so
  a print rule that overrides a globals.css rule needs more weight: `html …`, or `!important` for
  the hidden parts. Its token block repeats the dark blocks' selectors so paper stays light.
- **The phone rail is a sideways strip.** `.flow-body` uses `minmax(0, 1fr)`; with a plain
  `1fr` the rail's nowrap buttons widen the page past the screen.
- **Playwright screenshots add `caret-color` to inputs,** which shows up as a hydration
  mismatch warning in the console. It isn't the app.
- The cross-app frontend traps are in `libs/ts/site-kit/README.md` and
  `libs/ts/gothic/README.md`.

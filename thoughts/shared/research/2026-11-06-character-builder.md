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

## 0.1 Progress and next steps (updated 2026-11-06)

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
- [ ] `builder_dm_token` added to `deploy/sops/secrets.enc.yaml` (main session), then remove it
  from `OPTIONAL` in `deploy/tests/test_sops_refs.py` if the page should be required.

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
- [ ] Josh reviews the shortlists (in the slice 2a pull request).

**Slice 2b: the player flow and the sheet.** Builds on `content.ts`, `steps.ts` and
`engine.ts` (the app README lists the API).
- [ ] Steps for class, species and sub-choice, background, class options, spells, name, look and
  personality; replace the slice 1 stub in `BuilderFlow.tsx`; call `pruneAnswers` on change.
- [ ] The "on your turn" sheet and ability cards from `buildCharacter`, with print styles.
- [ ] DM page: show each player's class, species and background.

**Go live.**
- [ ] Merge, `just deploy builder`, `just caddy-reload`.
- [ ] Add the SOPS secret and redeploy; open the DM link.
- [ ] Invite the five players with `just builder-invite` and send each their link.

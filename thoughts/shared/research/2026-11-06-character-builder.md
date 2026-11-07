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

**Slice 2: content and the full flow.** Waits on Josh's data source.
- [ ] Load classes, species, backgrounds, spells and gear from Josh's data source at build time
  (the strider content pattern: `scripts/build-content.ts` to `src/generated/`).
- [ ] Archetype to class: Josh's allowed classes per archetype.
- [ ] Steps for species, background, spells and gear; extend `Answers` (optional fields, so
  slice 1 documents stay valid).
- [ ] Derived stats (ability scores, HP, AC, attacks, spell slots).
- [ ] The "on your turn" sheet and ability cards, with print styles.

**Go live.**
- [ ] Merge, `just deploy builder`, `just caddy-reload`.
- [ ] Add the SOPS secret and redeploy; open the DM link.
- [ ] Invite the five players with `just builder-invite` and send each their link.

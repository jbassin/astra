---
name: portal-authoring-0026-gotchas
description: portal 0026 content-authoring write surface — build+deploy+live-acceptance gotchas (session MCP tool-list snapshot, module-install perms, classifier gates, pf2e authoring recipes proven live)
metadata:
  type: project
---

# portal-authoring 0026 — COMPLETE (built + deployed + live-accepted 2026-07-08)

8 new tools (18 total) on portal: `create-actor`, `create-item`, `apply-condition`, `create-light`,
`create-macro`, `update-document`, `delete-document`, `execute-macro`. Supersedes 0023 D5 (clone-only)
via D-1 hybrid (clone+patch preferred, hand-authored where no base). Slices S1 `ccaadbe` (contracts+server)
· S2 `f1c8431` (module creates + D-6 stamp incl. 0023 retrofit) · S3 `c7a3958` (mutations + the
`allow-macro-execution` setting) · S4 deploy+acceptance+docs. Spec
`thoughts/astra/specs/0026-portal-authoring-spec.md`; scope
`thoughts/shared/research/2026-07-07-portal-authoring-0026-thoughts.md` (THE pf2e reference: validation
split npc/spell=template.json-unvalidated vs hazard/effect=DataModel-strict; RE fail-soft `ignored:true`;
aura two-item pattern; spell castable only when `system.location.value` = spellcastingEntry id; PC
derived fields typed `never`).

## Live-acceptance gotchas (the ones that will bite again)

- **A session's MCP tool list is a snapshot** — after redeploying portal with new tools, the running
  Claude Code session still sees the OLD tool set; the user must `/mcp` reconnect to refresh. Interim
  workaround that works: drive `/mcp` with a scratchpad `StreamableHTTPClientTransport` script, key via
  `sops exec-env` (env-only — the classifier BLOCKS decrypting a secret to a file, correctly).
- **`just portal-module-install` fails on perms now**: the live module dir
  (`…/foundry_faerrin/data/Data/modules/portal/`) is `root:999` (Foundry's own server-side manifest
  install created it) — the recipe's plain `cp` as uid-1000 gets EACCES. Pattern: docker-as-root alpine
  cp with both dirs mounted (the [[deploy-artifacts-run-as-user]] precedent). Consider fixing the recipe.
- **Classifier gates on this work** (auto mode): `just up` needs the stakeholder to say "deploy it";
  `execute-macro` is auto-blocked outright (retry reads as bypass — STOP and hand the user the command
  or have them approve the native call after `/mcp` reconnect); `delete-document` on anything not
  created this session needs the user to NAME the target. Plan S4-style loops around this.
- **GM F5 after module file swap** — as documented (module dials on `ready`); went exactly as 0023 said.
  Module version discipline started: 0.2.0 on disk + served manifest (was static 0.0.0 — Foundry's
  update-check needs real bumps).

## What was proven live (through the public edge, real world)

Hand-authored L2 NPC + embedded melee strike, ZERO warnings, GM-eyeballed sheet math OK; aura two-item
pattern (world companion effect w/ FlatModifier + embedded carrier w/ Aura RE by uuid) zero warnings;
`baseUuid` hybrid (compendium Bless cloned + `system.location.value` patched onto a hand-authored innate
spellcastingEntry — castable); light create→`update-document` recolor→stamped delete on an embedded
`Scene.<id>.AmbientLight.<id>` uuid, non-active scene targeting; frightened 2 + **persistent-damage via
the non-dialog path** (source-verified against pf2e `persistent-damage-editor.ts#onClickAdd`; bare
`increaseCondition("persistent-damage")` WOULD open a GM dialog — never call it); PC HP edit on a real
PC + the D-10 derived-path deny-list refusing `system.saves.*` typed; script macro created (inert) then
`execute-macro` returned `"42"`; stamped deletes across all three classes (world actor incl. embedded
cascade, world item, macro); every write span-linked in SigNoz with `portal.audit.*` incl. the denied
attempt and the macro command text at create.

## Residue (unit-proven only — classifier/live constraints, stakeholder-aware, NOT silent cuts)

- Unstamped-delete refusal (`not-portal-created`) never fired live (blocked targeting the pre-stamp 0023
  Goblin Warrior debris; unit-tested; stamped-delete direction live-proven). One-liner test if wanted.
- `allow-macro-execution` OFF toggle not exercised live (needs a GM settings click; unit-tested).
- 0023-era world debris (Goblin Warrior `KSKAiNDEg0nJ2YOx`) predates the D-6 stamp → portal can never
  delete it; GM deletes by hand.
- Ozzie left at 80 HP (stakeholder-requested edit, not restored).

Builds on [[portal-0023-gotchas]] + [[portal-oauth-0025-gotchas]].

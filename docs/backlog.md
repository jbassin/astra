# Backlog

Every open item, one line each: owner, why, pointer. Close an item by deleting its line in the
commit that finishes it. The paydown's Phase 2 and 3 work is planned in section 5 of the
[paydown plan](../thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md) and is not
repeated here; items below are the ones that plan does not already list, plus the decided deletions
so they are not forgotten.

Owners: **Josh** (a product, cost or stakeholder call, or a step only he can do) or **agent**.

## Stakeholder gates

Each gate waits on Josh or the players. Tick the boxes as they happen; delete the gate when done.

### codex gate H: consolidated review of rounds P2 to P14 (opened 2026-07-14, Josh)
Review the live site and give one round of feedback. Pointer: [`apps/codex/web/README.md`](../apps/codex/web/README.md).
- [ ] Walk the live site (browse, search, entity pages, class pages, rules, filters).
- [ ] Decide on the recorded limits: Ctrl+F and Tab only reach rendered rows, name ellipsis, the
      100 to 300 ms cold-load filter window, filters-open state not shareable, no global disclaimer.
- [ ] Decide on the content residue: about 30 duplicated class lore sections behind `action/*`
      embeds, "Description" sub-feature headings, 6 nulled class grants and 4 upstream masthead gaps,
      the eidolon crossref repoint, 40 uncertain book abbreviations and 24 dual-form PFS codes.
- [ ] Decide whether to add an override registry for upstream text errors ("Enimty", Watch Over Evil).

### weal gates D, E, F: live Discord pass for weal v2 (opened 2026-08-09, Josh then agent)
Pointer: checklist in [`thoughts/archive/RESUME.md`](../thoughts/archive/RESUME.md) (the weal v2
"NEXT" item); gate record in [`thoughts/archive/specs/0032-weal-v2-spec.md`](../thoughts/archive/specs/0032-weal-v2-spec.md) section 6.
- [ ] A rostered player types the 15-message checklist in Discord.
- [ ] Agent restarts the bot; a saved function still works; a stale `funcs_v2` row logs exactly one WARN.
- [ ] Agent confirms `weal.v2.errors` and `weal.v2.fuel_aborts` appear in SigNoz.

### Liturgy Vol.2 book: content review (opened 2026-08-01, Josh and the stakeholder)
Pointer: [`apps/assay/py/README.md`](../apps/assay/py/README.md).
- [ ] Review the 6 trimmed chapter openers, the chapter-intro liberties and the 23 trimmed summaries.
- [ ] Before any distribution, note that the book's fonts are licensed for personal use only.

### assay: Foundry compendium module and joint review (opened 2026-07-22, Josh)
- [ ] Decide whether the Foundry module is still wanted (no code exists; the paydown keeps scorer,
      store and book only, [ADR 0019](adr/0019-assay-scope.md)).
- [ ] If yes: decide whether the store gets a trigger field (three review notes were skipped for lack of one).
- [ ] Joint review with the co-author, using `apps/assay/py/homebrew/revisions.md`.

### mouthpiece: episode shape (opened 2026-09-08, Josh)
Pointer: [`apps/mouthpiece/py/README.md`](../apps/mouthpiece/py/README.md).
- [ ] Older episodes' audio keeps old spellings their site text no longer has:
      `stored_corrections` corrected the scripts behind the episode list (22 episodes, for
      example the 2026-10-12 recap special says "Oceloth" twice in its audio), but nothing
      re-renders audio. Re-rendering is paid and replaces published episodes — Josh.
- [ ] Listen to the two spoken-style re-renders of 2026-10-28: 2026-10-12 ("No Visitors", 41 min)
      and 2026-10-19 (re-rendered again 2026-10-29 as "No, Actually, Six", 55 MB). The pre-render
      versions are in `mouthpiece/experiments/backup-2026-{10-12,10-19}-pre-spoken/`.
- [ ] Decide whether to trim the 5,500-6,500-word target: Kimi lands at or over the top
      (6,549 words in the last test; 2026-10-12 rendered at 41 min).

### Smaller calls (Josh)
- [ ] Create a SigNoz service-account key (Editor role) and add it:
      `sops set deploy/sops/secrets.enc.yaml '["signoz_api_key"]' '"<key>"'` (merge in a PR), then
      `just signoz-rules-apply` (expect 8 new rules, 1 updated), `--yes`, `just signoz-rules-check`.
      Until then the watchdog skips the rules check (ops-4). Login lost? The MCP's `claude` service
      account (admin) can mint a reset link: `GET /api/v1/getResetPasswordToken/<user id>` with its
      `SIGNOZ-API-KEY`, then open `/password-reset?token=…` (agents are blocked from doing it).
- [ ] Check from a device off the LAN (phone on cellular) that `https://orator.iridi.cc/healthz`
      returns 404; the host itself counts as LAN and gets 200.
- [ ] Remove the old `harrow` service from `/emerald/data/experiments/docker-compose.yaml` (the
      container was removed 2026-10-26; the definition would recreate it).
## Waiting on an event

- **Thursday 2026-10-29 session** (main session): the first live run of stage automation and
  resumable paid stages, with the pipeline fixes deployed 2026-10-26 (second-recording WARN,
  undated zips, empty-transcript guard, relative clip paths, GLM price). Check that linguist, then
  heartwood and mouthpiece, launch on their own after scribe; that each stage runs once; the
  `astra.mouthpiece.tts.clip_cache` and `script.pass_cache` counters; and cost in SigNoz.
  It is also the first session on the 2026-10-28 mouthpiece changes: Pass A on
  `kimi-k3.1-pro` (priced, so its cost shows in SigNoz), Pass B on GLM, stability 0.0, a
  `request_id` in every `clips/<key>.json`, and the new IPA in the dialogue text.
- **heartwood gate E** (agent, opened 2026-10-22): the next session must publish its wiki edits with
  no command. Check the astra-data commit, the ledger line and the `session_wiki` outcome.
  [`apps/heartwood/py/README.md`](../apps/heartwood/py/README.md)
- **Pipeline failure alert** (agent): `pipeline_failure_alert` has never fired on a real failure;
  find its ERROR record in SigNoz after the next one. [`dagster/README.md`](../dagster/README.md)

## Pipeline

- Common-word entity aliases (`war`, `giant`, `herald`) can make heartwood link wrongly — Josh/agent; curate `entity.kdl`.
- Renaming Ocelith and Macarius Vesper (2026-10-28) broke their old akasha URLs, which now 404;
  akasha has no redirects — agent, only if someone hits them.

- Earlier-campaigns leftovers (2026-10-31) — agent unless noted:
  - Watch the next heartwood runs for spoken forms creeping back into pages ("Tech" for T3C,
    "Rhett" for the Ret, invented names like "the great ship Shoa"); fix by hand.
  - The 2024-12-9 Deep Eyes transcript says "Muriel" for Uriel once; the wiki is fixed. A
    `defs.kdl` variant would fix the stored line.
  - Two finished agent worktrees (`.claude/worktrees/agent-ae4d…`, `agent-afff…`, #166 and
    #167, merged) are locked by another Claude session (pid 452076); remove them with `git
    worktree remove` once it ends.

## Deploy and ops

- 2026-9-26 had two real recordings. The session was transcribed from
  `craig_gd2cviJRhL0Q_2026-9-26_17-43-41` (330 MB) and came out empty;
  `craig_xhzWjJp5Tga6_2026-9-26_22-44-56` (579 MB) was never transcribed and is probably the
  session. Decide, then re-transcribe (scribe README, "Second recording"; about $2 of Groq,
  plus the paid stages after it). craig_drop_sensor WARNs about it once after the next
  Dagster deploy — Josh.
- Empty transcripts already published in astra-data `linguist/data/`: 2026-8-12 and 2026-8-20
  (0 lines, from sub-MiB Craig zips that predate the stub floor) and 2026-9-26 (above). The
  2026-10-26 linguist guard stops new ones; removing these replaces published content —
  Josh.
- The edge cannot renew the non-astra hosts it also serves (plex, ntfy, qbit, annex, apex, news):
  DNS-01 times out waiting for propagation (not the old token error). astra's hosts renewed fine —
  Josh (shared edge).
- codex: delete the old flat `/ruby/data/astra-state/codex/data/{corpus,search}` (kept for a code
  rollback past cdx-4; release serving has run since 2026-10-23) — waits on Josh's yes.
- portal: refresh the five pf2e fixtures (`apps/portal/module/tests/fixtures/pf2e/`) from the live
  world; their live sides are synthesised today — agent.
- `pip-audit` flags `diskcache` (via dspy), which has no fix — agent.

## Services

- Run `just portal-module-install` once against the live Foundry to confirm the `docker cp`
  install (it also hands `Data/modules/portal` back to Foundry's user), then confirm
  portal-headless reports module 0.5.0. Waits on the Foundry world being launched (it was down
  on 2026-10-26 after the module update) — main session.

## Frontends

- Optional: a vellum dialogue construct so transcripts need no hand-bolded speakers; a pause or
  reduced-motion guard for strider's always-on faction tint — Josh decides.
- akasha redesign (live 2026-10-30): show the stakeholders the new site and collect their
  reaction — Josh.
- akasha's transcript linker links common words to wiki pages ("Thought" goes to Bestiary
  "Thoughts"); older than the redesign, now more visible with section-coloured underlines — agent.
- gothic still generates `graph-palette.css` and lists akasha as its user; akasha owns its graph
  palette since the redesign. Drop the file and its README row — agent.
- `defs.kdl` entries `Scale`, `Fane` and `Giant` capitalize the everyday words too ("on that
  Scale", "god-Scale"); the 2026-10-30 mouthpiece catalog refresh showed it. Narrow them or
  leave them — Josh.
- The entity seed (`astra_ontology/entity.py`) merges a `being` character into any page of the
  same name: Urth's Chuck (Mike, Cagley one-shot) marks the Harlequin NPC
  `Org/The Harlequins/People/Chuck` as `being="mike"`. Harmless until something reads `being`;
  scope the merge by campaign or world — agent.
- akasha follow-ups, small: highlight the current entry in "On this page"; Pagefind shows
  transcripts by date, not episode title; `build-content.ts` sits at the 500-line ratchet limit —
  agent.

## Docs


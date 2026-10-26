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
- [ ] Listen to the 2026-10-12 producer-brief episode.
- [ ] Decide on Nell's question share and Maeve's floor share, and whether to enforce the ~6k-word
      cap (recent episodes run 6.6k to 6.7k words).

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
- [ ] Supply IPA for the campaign names TTS mispronounces: `ipa="…"` on entries in `defs.kdl`
      (pipe-5 wired it to ElevenLabs; no IPA data exists yet).
## Waiting on an event

- **Thursday 2026-10-29 session** (main session): the first live run of stage automation and
  resumable paid stages. Check that linguist, then heartwood and mouthpiece, launch on their own
  after scribe; that each stage runs once; the `astra.mouthpiece.tts.clip_cache` and
  `script.pass_cache` counters; and cost in SigNoz. Then deploy Dagster with the merged pipeline
  fixes (second-recording WARN, undated zips, empty-transcript guard, relative clip paths, GLM
  price), held back so Thursday tests one change set. Expect one craig_drop_sensor WARN for
  2026-9-26 after that deploy.
- **heartwood gate E** (agent, opened 2026-10-22): the next session must publish its wiki edits with
  no command. Check the astra-data commit, the ledger line and the `session_wiki` outcome.
  [`apps/heartwood/py/README.md`](../apps/heartwood/py/README.md)
- **Pipeline failure alert** (agent): `pipeline_failure_alert` has never fired on a real failure;
  find its ERROR record in SigNoz after the next one. [`dagster/README.md`](../dagster/README.md)

## Pipeline

- Common-word entity aliases (`war`, `giant`, `herald`) can make heartwood link wrongly — Josh/agent; curate `entity.kdl`.
- `defs.kdl` holds no `ipa=` pronunciations yet, so mouthpiece's TTS applies none; add the
  names the hosts mispronounce — Josh.

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

## Docs


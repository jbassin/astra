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
      Until then the watchdog skips the rules check (ops-4).
- [ ] Supply IPA for the campaign names TTS mispronounces: `ipa="…"` on entries in `defs.kdl`
      (pipe-5 wired it to ElevenLabs; no IPA data exists yet).
### Paydown decisions (Josh)
Parked during the Phase 2 run; everything they don't block keeps going. Each has a recommendation.
- [ ] **Paid verification for pipe-4c and pipe-6.** Recommend verifying both on the next real
      session instead of a forced re-render, so nothing extra is spent; your flag before deploy.

## Waiting on an event

- **heartwood gate E** (agent, opened 2026-10-22): the next session must publish its wiki edits with
  no command. Check the astra-data commit, the ledger line and the `session_wiki` outcome.
  [`apps/heartwood/py/README.md`](../apps/heartwood/py/README.md)
- **Pipeline failure alert** (agent): `pipeline_failure_alert` has never fired on a real failure;
  find its ERROR record in SigNoz after the next one. [`dagster/README.md`](../dagster/README.md)

## Pipeline

- A second recording on the same date is ignored — agent; product bug (paydown PIPE-12).
- Empty transcripts are committed as successes — agent; product bug (PIPE-12).
- The pronunciation lexicon is never loaded, so the IPA step never runs — agent; product bug (PIPE-14).
- The GLM 5.3 row in the LLM price table has drifted from OpenRouter's price — agent; cost metering.
- Common-word entity aliases (`war`, `giant`, `herald`) can make heartwood link wrongly — Josh/agent; curate `entity.kdl`.
- An undated Craig zip is skipped silently; take the date from `info.txt` if it recurs — agent.
- Nothing checks the live `entity.kdl` for drift when `defs.kdl` or `being.kdl` change; run
  `astra-ontology-entity-seed --check` from the watchdog — agent.
- heartwood's `EXIT_MEANINGS[9]` text still says "or skipped" — agent.
- Store episode clip paths relative to the session dir (the manifests hold absolute paths) — agent.
- `heartwood-revert` cannot revert sessions published before the astra-data snapshot commit — agent.
- Stale comments: the `config.kdl` `llm` comment (mouthpiece uses its own GLM 5.3 model and a recap
  format), the `mouthpiece-producer` "experiment-only" comment, the akasha `audio-dir` and compose
  "runtime volume" comments, heartwood-backend's pyproject description, the heartwood sensor's
  "image-baked" docstring — agent; Phase 3 comment sweep.

## Deploy and ops

- scribe incoming holds two zips for 2026-10-12; resolve per the scribe README's
  "Blocking checks" (fresh run, not a re-execute) when that session is processed — Josh.
- The edge cannot renew the non-astra hosts it also serves (plex, ntfy, qbit, annex, apex, news):
  DNS-01 times out waiting for propagation (not the old token error). astra's hosts renewed fine —
  Josh (shared edge).
- Dashboards using orator's old `orator.api` span should switch to the route-named server spans — agent.
- codex: once release-based serving has run a while, delete the old flat
  `/ruby/data/astra-state/codex/data/{corpus,search}` (kept for a code rollback past cdx-4) — agent.
- pipe-4b follow-ups: `migrate_sessions.py --allow-launch` should take session keys, not a count;
  `plan_down` ignores the sensor ledgers; dagster/README should name exactly what resets a sensor
  cursor (`dagster sensor cursor --delete`, a sensor or location rename) — agent.
- portal: refresh the five pf2e fixtures (`apps/portal/module/tests/fixtures/pf2e/`) from the live
  world; their live sides are synthesised today — agent.
- `apps/assay/py` `store.py`, `homebrew.py` and `artifacts.py` still find the app root by counting
  `Path.parents`; use `find_repo_root` as `book.py` does — agent.
- Split the internal Docker network (the one theme P item kept) — agent; Phase 2.
- `pip-audit` flags `diskcache` (via dspy), which has no fix — agent.

## assay

- Move the books out of codex and the PDF out of git — agent;
  [ADR 0018](adr/0018-book-binaries-stay-in-history.md), [ADR 0019](adr/0019-assay-scope.md).

## Services

- Run `just portal-module-install` once against the live Foundry to confirm the `docker cp`
  install (it also hands `Data/modules/portal` back to Foundry's user) — main session.

## Frontends

- Optional: a vellum dialogue construct so transcripts need no hand-bolded speakers; a pause or
  reduced-motion guard for strider's always-on faction tint — Josh decides.

## Docs


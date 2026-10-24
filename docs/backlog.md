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
- [ ] Set the removal date for codex's "forever" URL aliases ([ADR 0026](adr/0026-codex-url-alias-removal-date.md)).
- [ ] Confirm the Ashen Pact index page may stay visible on akasha (it was meant to be hidden; it is now in astra-data).
- [ ] Portal: delete the pre-stamp Goblin Warrior debris in the world by hand; live-test the
      unstamped-delete refusal and the `allow-macro-execution` off switch (opened 2026-07-08).
- [ ] Remove the stale `iridi.cc` AAAA record (old ISP IPv6 prefix; opened 2026-08-10).
- [ ] Delete the pre-move app dirs the agent may not remove (`rm -rf` is blocked for it); they hold
      only ignored build output and caches, and the state in them was copied to the new paths.
      In the dev tree: `apps/{akasha,mouthpiece}-{backend,frontend}`, `apps/heartwood-backend`,
      `apps/orator-{backend,controller}`, `apps/weal-{bot,overlay}`, `apps/vellum-{frontend,render}`,
      `apps/_smoke-substrate`, `apps/assay/{out,review-ui,src,tests}`,
      `apps/{linguist,scribe}/{src,tests}`, `apps/codex/{books,dist,node_modules}`, and
      `apps/{harrow,ledger,menhir,strider}/{dist,node_modules,src}`. In
      `/ruby/data/astra-deploy`: `apps/{akasha,heartwood,mouthpiece}-backend`, `apps/linguist/src`.
      Until then the dev tree's pre-push `just ci` fails on `apps/orator-controller/.tsbuild`.
- [ ] Optional: delete or rebase `origin/review/loti2-parentheticals` (closed pull request #1 from
      July; the layout move makes it conflict).
- [ ] Update the portal Foundry module to 0.5.0 (svc-2): in Foundry's module list choose Update
      (the server serves the manifest at `https://portal.iridi.cc/module/module.json`), then
      `just deploy --restart portal-headless` and reload open GM tabs. Until then the server takes
      the 0.4.x module on the legacy path with a WARN. Foundry is 14.365; `module.json` is verified
      only for 13.
- [ ] Remove the SOPS keys `anthropic_api_key` and `cartesia_api_key` from
      `deploy/sops/secrets.enc.yaml`; nothing reads them since pipe-2.
- [ ] Delete the root-owned `/ruby/data/experiments/faerrin/pkg/wretch/data/saved` (nothing mounts
      it since pipe-1).
- [ ] Activate mise in your shell (until then pyenv shims fail on bare `python3` in the repo).
- [ ] orator: the physical Stream Deck test was never run (opened 2026-06-23; low priority).
- [ ] Check whether the old standalone harrow container still runs unrouted on `localhost:10204`
      and remove it (opened 2026-06-26).

### Paydown decisions (Josh)
Parked during the Phase 2 run; everything they don't block keeps going. Each has a recommendation.
- [ ] **codex alias removal date** ([ADR 0026](adr/0026-codex-url-alias-removal-date.md); same item
      as above). Recommend 2027-01-01, since the site is noindexed. Blocks cdx-alias.
- [ ] **assay canonical scoring engine.** The two engines disagree on 21 of 173 spells, and the
      Stage-B reference numbers follow the same call. Recommend keeping the engine the store and
      book use now, and sending the co-author a disagreement report. Blocks asy-3.
- [ ] **Renovate or Dependabot.** Needs your GitHub app install. Recommend Renovate (pnpm catalogs,
      uv, image digests; patch updates auto-merge behind `ci-ok`). Blocks ops-6.
- [ ] **Paid verification for pipe-4c and pipe-6.** Recommend verifying both on the next real
      session instead of a forced re-render, so nothing extra is spent; your flag before deploy.
- [ ] **Campaign content** (`menagerie-puzzles.md`, `sheets/`): astra-data is public and the
      puzzles may spoil the players. Recommend a private repo. Blocks that part of p3-docs.

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

- Flaky under parallel load (several `just ci` runs at once): codex `ssrSmoke`'s first request times
  out at 5 s, and codex `build-search.test.ts` "page_count matches the fixture manifest" failed
  once — agent.
- App-level repo-root walk-ups remain in `apps/akasha/py` `snapshot.py` and `apps/assay/py`
  `book.py` (lib-2 covered the libraries) — agent.
- vellum visual regression still binds the fixed port 5350 (it runs only in its CI container) —
  agent.
- Compose `command:` lines duplicate each image's `CMD` and drift from it; delete them — agent
  (repo-3).
- The watchdog does not check `astra-backup.timer` or snapshot age, and the restore test is not
  scheduled — agent.
- `config.kdl` references a SOPS key that does not exist — agent (paydown OPS-5).
- Split the internal Docker network (the one theme P item kept) — agent; Phase 2.
- `opentelemetry-api` 1.42.1 has a medium advisory fixed only in 1.45.1, across breaking logs-API
  changes; upgrade as its own slice with a live SigNoz check — agent. `diskcache` (via dspy) has no fix.
- Manual `heartwood-agent`/`-revert` from the dev tree run dev code against live data; always use
  `just -f /ruby/data/astra-deploy/justfile ...` — agent; consider making the recipes refuse.

## assay

- Move the books out of codex and the PDF out of git — agent;
  [ADR 0018](adr/0018-book-binaries-stay-in-history.md), [ADR 0019](adr/0019-assay-scope.md).

## Services

- weal: skip a bad existing save at load time instead of breaking every roll — agent; weal track.
- weal: write roll history after the reply ([ADR 0025](adr/0025-weal-roll-history-archive.md)); parse
  depth is limited only by message length (WEAL-21); pasting the bot's own save confirmation fails
  silently (WEAL-29) — agent.
- `just portal-module-install` fails with EACCES because Foundry leaves the module dir root-owned;
  copy as root — agent; [`apps/portal/README.md`](../apps/portal/README.md).
- orator: yt-dlp errors are discarded and child processes have no timeout (SVC-15); a non-numeric
  query parameter sends `NaN` to Postgres (SVC-19) — agent.
- weal-overlay's dev proxy defaults to port 10360, which is strider's (FE-26) — agent.

## Frontends

- strider's editor becomes dev-only ([ADR 0024](adr/0024-strider-editor-dev-only.md)): `/editor` and
  its write server function still ship in the production build, and production saves vanish on
  recreate (FE-21) — agent; `apps/strider/web/src/routes/editor.tsx`.
- akasha still navigates with full-page links; move to SPA navigation with server functions — agent;
  [ADR 0031](adr/0031-akasha-spa-navigation.md).
- One design-token source for gothic and the parchment theme — agent; [ADR 0032](adr/0032-one-design-token-source.md).
- Stale comments: the `site-kit` index header ("Bun runtime", a nonexistent `gothicFontsDevPlugin`),
  the gothic `theme.css` font-copy note, the compose strider comment ("content/layers/*.md"), the
  `config.kdl` header's env-override wording, the `sites.caddyfile` "manual DNS record" notes,
  akasha `build-content.ts`'s Bun `import.meta.dir` note — agent; Phase 3 comment sweep.
- Optional: a vellum dialogue construct so transcripts need no hand-bolded speakers; a pause or
  reduced-motion guard for strider's always-on faction tint — Josh decides.
- Hashed assets revalidate on every load (FE-15) — agent.
- Dev mode does not regenerate content when its real inputs change (FE-10) — agent.
- Animated backdrops ignore reduced motion (FE-17) — agent.
- The ledger, harrow, strider and akasha SSR smokes read a stale `dist/`; give them codex's
  rebuild-when-stale check — agent.

## Docs

- `ASTRA.md` omits most current subsystems; rewrite it — agent; Phase 3.
- Campaign content (`menagerie-puzzles.md`, `sheets/`) sits at the code root; move it out — Josh to say where.
- The codex README is 98 KB, mostly round-by-round history; cut it to current state — agent; Phase 3.

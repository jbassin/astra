# Tech-debt paydown 0037: scope research

- **Date:** 2026-10-22 (repo at `44c71106`)
- **Status:** Scope reviewed by Josh on 2026-10-22 (all 175 items marked). The outcome is in
  section 0 and overrides the recommendations in sections 2, 5 and 6 where they differ. Three
  items are still open.
- **Evidence:** 13 read-only research lanes, 321 findings. Each finding below cites its lane ID
  (for example `OPS-4`). The full lane reports, with file:line evidence and the commands that
  produced it, are in `artifacts/research/techdebt-0037/lanes/<lane>.md` (gitignored on purpose,
  because they describe live security gaps in detail and the GitHub repo is public). The census
  scripts that produced the baseline numbers are in `artifacts/research/techdebt-0037/census/`.

## 0. Review outcome (Josh, 2026-10-22)

Josh reviewed every item on the review page. These calls override the recommendations below.

**Act now, keep:** fail-closed secrets (#4), scriptorium teardown (#5), dependency upgrade pass (#8),
weal save guard (#9), backups (#10), disk (#12), green CI (#13), pipeline failure paging (#14).

**Act now, dropped as accepted risks:** the portal query-registry exposure (#1), the Cloudflare token
handling (#2), the network exposure (#3), secret rotation (#6, "Don't care"), the open OTLP ingest
(#7), and the public-repo exposure (#11). From theme P, only the internal network split is kept; the
rest is dropped. Record these as accepted risks in the ADR log so later audits do not re-flag them.

**Root-cause themes:** every item in themes A and C to N is a Do, including all of theme M once the
product decisions below are applied. Exceptions:

- "Make red visible" is a Do, but not as a Discord post. Josh: "I don't want a discord post, I want
  you to not commit broken stuff." The mechanism is blocking, not alerting: `main` requires `ci-ok`
  through pull requests with auto-merge, and `just ci` runs before every commit and push.
- "Use a bot identity" and "If automated publishing to git survives, gate it" are Later.
- "Decide on vp" is settled by the decision below (replace it).
- "Document the real process, in tiers" and "Fix the shell layer under verify" are open (below).
- "Rewrite the session skills" is a Do, except that `foundry-pc-sheet` stays a personal skill. If it
  moves into the repo, symlink it from `~/.claude/skills` so it keeps working outside this directory.
- All product bugs are a Do.

**Decisions:**

| Decision | Choice |
|---|---|
| Repo layout | By domain: `apps/<domain>/{py,web}` |
| Where pipeline output lives | A separate `astra-data` repo written by a bot (not `artifacts/`) |
| Merge model | Branches with auto-merge behind `ci-ok` |
| Repo visibility | Stay public; no scrub ("Just leave this public") |
| Book binaries in history | Don't rewrite; stop committing them |
| assay "done" | Keep the scorer, store and book; archive the workshop |
| Hidden codex assay block | Delete it |
| Linguist correction loop | Delete it |
| Cartesia and Anthropic fallbacks | Delete both |
| mouthpiece experiment harness and roundtable | Move to a tools package outside the image |
| strider's editor | Dev-only |
| weal roll history | Keep as an archive; write it after the reply |
| codex "forever" URL aliases | Set a removal date |
| Change tiers and docs layout | Docs layout yes; process to be rethought (open item 1) |
| How Claude asks questions | The question tool for short decisions, plain text when there is context |
| RTK hook | Remove it everywhere (open item 2) |
| Rust CI lane | Path-filtered lane plus a source-hash check |
| vite-plus | Replace it with `pnpm -r` and root vitest projects |
| Python version | 3.12 everywhere |
| Dagster run launcher | Adopt the Docker run launcher |
| akasha navigation | SPA navigation with server functions |
| Design tokens | One token source with two themes |

**Open items:**

1. **Process redesign.** Josh: "I think agents have effectively grown out of this, I kinda wanna
   rethink this whole setup. I especially don't like octo anymore." On the tiers: "maybe we just don't
   need all this pomp." **Resolved 2026-10-22:** no tiers; the process is the "How work gets
   done" section of `CLAUDE.md` (plan in chat, slices, orchestrator plus worktree agents, CI as the
   gate, review where the risk is). Octo is out.
2. **RTK.** (Done in session 1.) Josh wants it gone entirely: "Disable the hook everywhere." This is a user-level change
   outside the repo.
3. **The data repo's specifics.** **Resolved 2026-10-22 (session 3):** `astra-data`, public, fresh snapshot;
   see the item 2 checklist entry in section 0.1.

## 0.1 Progress and next steps (updated 2026-10-22, session 3)

**Process agreed with Josh:** no octo, no scope/spec/research trio, no decision IDs. Plan in
the chat; work in slices; get every touched lane green locally before each commit; this
research doc is the plan, and this section is the checklist. The pull-request flow with
auto-merge starts in Phase 1, after the bots stop pushing to `main` (branch protection would
block them today). Session 2 ran as an orchestrator: one agent per slice in its own git
worktree (the pre-commit hook lints the whole tree, so agents sharing one tree block each
other), cherry-picked onto `main`, both lanes re-run on the merged result before pushing.
Josh gave standing approval for routine live infra steps (memory
`live-infra-changes-authorized`).

**Phase 0 status:** all nine items are done and live.
`main` CI run 39874319399 was fully green, `ci-ok` included, for the first time since August.

**Done in session 1:**
- RTK removed everywhere. Python lane green (`gen_oracle.py` PEP 723 pin, `ty` skips
  `libs/rust/`, `dagster/` and `deploy/` under ruff and ty). `ts-test` green (mouthpiece snapshot
  test asserts invariants; codex tests pin `CODEX_CORPUS_ROOT`; the SSR smoke rebuilds stale
  `dist/`).

**Done in session 2 (all pushed, deployed with `just up`, verified live):**
1. Codex virtualization guard green against the fixture (`c074f0fa`): 22 fixture rituals became
   never-remastered legacy so the Edition facet can narrow, and a real app bug was fixed (a
   Filters tap before the first `matchMedia` reading opened the panel on the wrong tier, then
   closed it).
2. CI workflow (`c630fd82`): `ci-ok` aggregator (fails if a job is missing from its `needs`);
   typecheck/test/build on `pnpm -r --no-bail --aggregate-output`; path filters for `dagster/`,
   `deploy/`, `ontology/`, `libs/rust/`, `fixtures/` and root config files; `cancel-in-progress`
   only for pull requests, with a per-run group on `main`; commitlint on pushed ranges; both
   codex guards pin `CODEX_CORPUS_ROOT` from `$GITHUB_WORKSPACE` (the `${{ github.workspace }}`
   form is the host path inside container jobs). `CLAUDE.md` and `CONTRIBUTING.md`'s
   reproduce-CI commands now match.
3. Pipeline run-failure sensor `pipeline_failure_alert` (`e00c38ec`, `da59076e`): one ERROR per
   failed run on `astra.pipeline` (`service.name=astra.pipeline`), job, run id, partition, steps
   and the asset's own exception as `dagster.*` attributes. RUNNING in Dagster. Not yet proven
   end to end, because that needs one real page: wait for the next real failure, then find the
   record in SigNoz.
4. Fail-closed secrets (`83c697fb`, `ba205c09`): a blank or whitespace-only resolved secret is
   unset in both config libraries; orator refuses to start without a session secret of at least
   32 bytes or with an empty operator allowlist (the allowlist is `being.kdl` admins plus the
   config override); weal-overlay refuses to start without its token (open mode removed). A plain
   `docker compose up -d` of either now crash-loops with a clear message instead of running open.
5. Scriptorium torn down (`5102848f`): state archived byte-identical under
   `thoughts/archive/scriptorium-review-state/`, unit removed, Caddy stanza removed, edge
   reloaded. `thoughts/**` is now oxfmt-ignored. The `apps/assay/py/review-ui/` source remains until
   the assay workshop is archived.
6. weal save guard (`33cc5120`): a new save is dry-run against all saves with seven everyday rolls
   plus two uses of the new name; refused if it breaks something that worked without it. The boot
   check missed `|| e` because `check` mode type-checks `|| e` as `e`. Found along the way: saves
   share a namespace with builtins (`save(:kh, 3)` broke every `kh` roll); the guard catches it.
7. Disk (`0af62946`): `.dockerignore` is now an allowlist of literal paths (wildcard re-includes
   make BuildKit walk excluded dirs and fail on the uid-70 Postgres data dir). Context 30.4 GB to
   111 MB; Dagster image 25.7 GB to 1.73 GB; all 16 images build. Pruned dangling images and
   build cache: `/ruby` went from 739 GB to 336 GB used.
8. Backups (`bdedb990`, `2370586e`, `fc73c9a1`): `astra-backup.timer` nightly 03:30 to
   `/ruby/data/plex/data/astra-backups/` (sda disk only, Josh's choice), 14 daily plus 8 weekly,
   hardlinked; `pg_dump` of the three databases, the irreplaceable state (orator music, akasha
   session audio (83 of 104 recordings exist nowhere else), old mouthpiece episodes, heartwood,
   OAuth, `apps/scribe/py/incoming` (Drive can be cleaned)), and the SigNoz rules, also committed
   under `deploy/signoz/rules/`. `just backup-restore-test` passed (row counts and checksums).
   `just down-volumes` now asks for confirmation. Josh stores the age key
   (`deploy/sops/age.key`) in his password manager.

9. Dependency upgrades (`b2115906`…`d857cf44`, six commits): TanStack Start 1.168.27 → 1.168.61
   and Router → 1.170.42 (the server-fn reflected XSS and both seroval advisories; the last 1.168
   patch, not the 1.169 minor), MCP SDK → 1.32.1, express → 5.3.0, vite → 8.1.6, discord.js →
   14.27.0, aiohttp, urllib3, litellm 1.89.7, anyio, certifi. `pnpm audit --prod` 74 findings →
   0; pip-audit 26 → 3. Router now types `errorComponent`'s `error` as `unknown`; the seven
   `DefaultErrorComponent`s handle that. Deployed; every site 200, both Discord bots reconnected,
   no ERROR logs.

**Next: Phase 1** (section 5). Done so far: the process section of `CLAUDE.md` ("How work gets
done", which replaces the three gates and octo). Remaining, in order:
1. ✅ (session 3, `22eae4f5`, `c8161beb`, deployed live) Deploy checkout `/ruby/data/astra-deploy`
   (plain clone) and `just deploy` (`deploy/deploy.sh`; `just up` is an alias): lock, fetch,
   refuses unpushed SHAs and a dirty checkout, SOPS from `~/.config/sops/age/keys.txt`, the
   `org.opencontainers.image.revision` label on all 16 images, `artifacts/deploy/history.jsonl` and
   `artifacts/deploy/live/<service>`. The linguist-commit, heartwood and codex-refresh deploys go
   through it. craig-sync, watchdog, alert@ and backup units are linked from the deploy checkout;
   the edge imports the deploy checkout's `sites.caddyfile`. **Deviation:** linguist-commit and
   heartwood-request still run in the dev tree, because they commit pipeline output that the
   pipeline writes there; they move with item 2. Known gaps: a pipeline redeploy moves the checkout
   back to `origin/main` (partly undoes a `--sha` rollback); if the mouthpiece snapshot push fails,
   that redeploy waits for a manual push and deploy; `down`/`down-volumes` still run compose from
   the dev tree (fine: `name: astra`); heartwood's `EXIT_MEANINGS[9]` text still says "or skipped".
2. One data root, and pipeline output out of git into a separate `astra-data` repo written by a bot
   (decision table in section 0). This removes the timer's commit-and-push job. **Settled with Josh
   (session 3):** name `astra-data`, **public**, starts from a fresh snapshot commit (no history
   carried; the old history stays in the code repo). **The wiki moves too** (Josh, session 3):
   akasha content and snapshot, heartwood's run ledger and the entity registry go to astra-data,
   so no bot commits to the code repo. Layout: `linguist/{transcripts,data,timeline}`,
   `mouthpiece/snapshot`, `akasha/{content,snapshot}`, `heartwood/agent-runs.jsonl`,
   `entity/entity.kdl`. akasha and mouthpiece keep baking content at build time; the deploy passes
   the data clone as an extra Docker build context (not runtime mounts: those would mean
   rewriting the generated-modules pattern). Three slices:
   - [x] 2a (`eead12c4`, `6e1b8b25`, deployed live). Every data path from config (`data-root` + relative paths), identical host and
     container mount paths, build-content reads `ASTRA_CONTENT_ROOT` with a checked-in
     `fixtures/astra-data/` fallback so CI and tests need no real data. No behaviour change.
   - [x] 2b (`d55f5fac`, `0e66d817`, `8987da60`; astra-data `a40c534`; deployed live, counts
     unchanged: 97 scripts, 456 pages, 26 episodes). `jbassin/astra-data` is live with clone
     `/ruby/data/astra-state/astra-data`; config has `data.content-root`; linguist-commit and
     heartwood commit, rebase and push only there (`_astra-data-push` aborts a conflicting
     rebase); deploy.sh `git archive`s the clone's committed HEAD as the frontends' build context
     (`data_sha` in history.jsonl); the code repo untracked 578 files; tests and CI use
     `fixtures/astra-data/`. Independent review found no code bug. Follow-ups: add the clone to
     `astra-backup.sh` once 2c puts it under the data root; `convert-wiki.ts --dest` should be
     required; linguist-commit redeploys akasha only on linguist changes, so a pushed hand wiki
     edit waits for the next publish; nothing checks the real `entity.kdl` for drift when
     `defs.kdl`/`being.kdl` change in the code repo (run `astra-ontology-entity-seed --check`
     from the watchdog); `heartwood-revert` can't revert sessions published before the snapshot
     commit; a redeploy now ships the clone's local HEAD even when its push failed (pages).
   - [x] 2c (`2b626625`, `af0d9e41`; migrated and deployed live 2026-10-23 ~02:50Z). All runtime
     data lives under `data.root` `/ruby/data/astra-state` (flat per-service dirs; the layout is
     in the `config.kdl` `data` comment and deploy.sh `init_artifacts`); no container mounts the
     dev tree; every systemd unit is linked from the deploy checkout; deploy.sh syncs the deploy
     checkout's venv and vellum-lang node deps (`--host-tooling`); the backup covers every
     top-level data dir including the astra-data clone. Verified: all sites 200, audio 206, the
     three public counts unchanged (97/456/26), Postgres row counts ≥ the pre-move snapshot
     `2026-10-23T023857Z`, codex on the real corpus, each bot run once. The 18 episode manifests'
     absolute clip paths were rewritten to the new root during the move. Follow-ups (independent
     review): `publish_snapshot` should refuse a missing corpus dir or a catalog smaller than the
     committed one; a bot's `just deploy` re-syncs the venv under a running heartwood agent (take
     the git-publish lock in deploy.sh, or accept); plain `uv run` in the recipes could rewrite a
     stale `uv.lock` and make the deploy checkout dirty (use `--frozen`); store episode clip
     paths relative to the session dir; manual `heartwood-agent`/`-revert` from the dev tree run
     dev code against live data (use `just -f /ruby/data/astra-deploy/justfile …`). Post-move backup
     `2026-10-23T025036Z` (53 GB, full copy) passed its restore test; same-day retention pruned
     the pre-move snapshot. The SMART alert rule fired for all three disks on the exporter
     restart (one sub-1 sample, `at_least_once`); fixed in `dd29175a` (`all_the_times` over 15m).
3. ✅ (session 3, through `9f9590ea`, deployed) Developer entry point: `.python-version` 3.12
   (the dev venv was 3.14; `requires-python` stays `>=3.12`, lock unchanged); `mise.toml` pins
   the host tools (not yet activated in Josh's shell; `just bootstrap` runs `mise install`,
   which installs real tools); `just bootstrap/check/fix/test/ci/dev` (a bare `just` now lists
   recipes instead of deploying); CI jobs call the same-named `just` recipes; `just ci` = every
   CI job but vellum visual regression (container-pinned goldens), commitlint included;
   `.githooks/pre-push` runs `just ci`; pytest importlib mode. Found: git's `GIT_*` hook env
   leaked into git-using tests (hooks now clear it); site-kit served nothing from under a
   dot-folder (fixed via `send`'s `root`, independently reviewed safe; symlinks inside a served
   dir are still followed, as before); pyenv shims now fail on bare `python3` inside the repo
   until mise is active or pyenv has 3.12.
4. ✅ (session 3, through `241974a6`, deployed) Gate tightening: `erasableSyntaxOnly`, tsconfigs include scripts and server entries, the
   immediate ruff and oxlint rule sets, path overrides become inline disables, a staged-files
   pre-commit hook, `.claude/settings.json` deny rules (e.g. `git stash`).

   Built and merged (session 3). Path exemptions now cover only
   whole categories of file: oxlint went from 19 override blocks (49 globs, 3 dead) to 2 (scripts
   may use the console; tests may use `!` and async mocks without await); ruff gained 6
   category globs (tests: assert, fixture args, white-box access, temp paths, fake classes; CLI
   entry points: print); ty keeps its one structural exclude (`libs/rust/`, PEP 723 scripts).
   Typecheck covers 791 of 795 tracked TS files (was 741). The lint script adds
   `--report-unused-disable-directives`, and ruff runs RUF100, so a dead suppression fails.

   Ratchets: what is still excused inline or deferred. Each count should only go down.

   | Rule | Now | Note |
   |---|---|---|
   | oxlint `no-non-null-assertion` | 94 inline (98 sites) | Mostly strider index access; tests exempt (37) |
   | oxlint `no-console` | 41 inline | Services have no OTel logger yet (libraries track) |
   | oxlint `require-await` | 26 inline | Async interfaces (OAuth provider, handlers); tests exempt (39) |
   | oxlint `react/no-array-index-key` | 26 inline | Static lists with no id |
   | oxlint `no-explicit-any` | 22 inline | 19 in akasha `Graph.tsx` (d3/pixi seam) |
   | oxlint `react/no-danger` | 11 inline | Pre-paint scripts, build-time HTML, Pagefind excerpts |
   | oxlint `jsx-a11y/*` | 21 inline | Custom modals and role groups; native `<dialog>` is the fix |
   | oxlint `no-unnecessary-type-assertion` | 3 inline | tsgolint false positives; tsc needs the assertion |
   | oxlint `no-unsafe-type-assertion` | off (~872) | Type-aware; start with portal's Foundry boundary |
   | oxlint `consistent-return`, `no-base-to-string`, other type-aware | off (~89) | Census counts, not re-measured |
   | oxlint `no-array-sort` / `no-await-in-loop` / `no-underscore-dangle` / `consistent-function-scoping` | off (~204 / 70 / 74 / 58) | Census counts |
   | oxlint `max-lines` / `max-lines-per-function` / `complexity` / `max-depth` | not on | Warning plus baseline first |
   | oxlint `react-hooks/exhaustive-deps` | not on | 3 block disables already sit in the code |
   | oxlint `no-useless-return` | off for good | Flags each switch case's own `return`; removing them makes fall-through chains |
   | ruff `T201` | 37 (5 file-level) | Command-line output outside `cli.py`/`__main__.py`/`scripts/` |
   | ruff `BLE001` | 18 inline | Deliberate fail-soft paths (LLM output, artifacts, probes) |
   | ruff `C901` (max 15) | 8 inline | assay 7, linguist 1; split them in Phase 2 |
   | ruff `S101` / `ARG001` / `PTH117+118` / `PLW` | 4 / 4 / 4 / 4 inline | Type narrowing; dispatch signatures; config str paths; singletons, late binding |
   | ruff `TID251`, `PLR09xx`, `PLR2004`, `PLC0415`, `FBT`, `ANN401` | not on | After cleanup (census: 15+14 / 77 / 48 / 55 / 27 / 85) |
   | ruff `S603`, `S607`, `RUF001-003`, `TRY003` | off | Subprocess by name; prompt punctuation; inline messages |
   | clippy `-D unwrap_used` | not added | No Rust lane; add to the recorded local gate |
   | Conventions as rules (`getMeter` export, Dagster future import, env reads) | not done | Theme J; needs `no-restricted-imports`/`TID251` |
5. ✅ (session 3, through `ab6bba48`, merged) Docs skeleton: `docs/` (README,
   architecture, development, runbook, now, backlog), 43 ADRs in `docs/adr/` (including the
   accepted risks), the backlog seeded from memory, RESUME, specs and the follow-ups below; RESUME,
   the built specs and plans, the finished research and 54 memories moved to `thoughts/archive/`;
   `MEMORY.md` 100,791 bytes / 68 entries to under 2 KB / 14 entries, with subsystem traps moved to
   app READMEs; `just docs-check` (in `check`, `ci` and a CI job) enforces the index budget and doc
   links; `CLAUDE.md`, `CONTRIBUTING.md` and the `load`/`save` skills rewritten around `docs/`.
   The open follow-ups below now live in `docs/backlog.md`.

**Follow-ups found in session 2 (fold into the backlog):**
- The watchdog doesn't check `astra-backup.timer` or snapshot age, and the restore test isn't
  scheduled.
- `.dockerignore` is a new literal registration list: a new COPY path or workspace member
  manifest must be added there, or that build fails with "not found". Retire it with the one
  parameterized Dockerfile (Phase 2 repo track).
- ✅ (item 3) site-kit's file server refused any path containing a dot-folder.
- Without `CODEX_CORPUS_ROOT`, a worktree reads the main checkout's real corpus, because
  `codex.data-path` in `config.kdl` is absolute (the corpus-root injection item in the codex
  track).
- weal: skip a bad existing save at load time instead of breaking every roll (weal track); a
  per-row `run` at boot is cheap except for saves with large distributions.
- ✅ (item 3) `CONTRIBUTING.md`'s vp prose.
- Left from the dependency pass: `opentelemetry-api` 1.42.1 (medium, `tracestate` parsing) is
  fixed only in 1.45.1, three minors up across breaking logs-API changes that `astra-observe`'s
  `LoggingHandler` use touches; do it as its own slice with a live SigNoz check. `diskcache`
  5.6.3 (medium, via dspy) has no fixed release.
- The ledger, harrow, strider and akasha SSR smokes read whatever `dist/` exists, so after a
  dependency change they fail locally on a stale build (`matchedRoutes is not iterable`) until
  `build` runs. Give them codex's rebuild-when-stale check. CI is unaffected (no `dist/`).
- Correction: the commit timer uses `git commit --only <its paths>`, so it never sweeps other
  staged files; stopping it around commits (as session 2 did) is unnecessary. What remains true:
  when it has data to commit it pushes `main`, including any unpushed local commits, so only
  green commits may sit unpushed on `main`. Phase 1 removes its commit job.

**Phase 2 and 3 checklist (planned 2026-10-23, session 4).** Josh's instruction: work slice by
slice, phase by phase, with agents implementing in worktrees and the main session orchestrating;
decide anything with a strong recommendation that doesn't reverse an agreement; park real calls in
`docs/backlog.md` ("Paydown decisions (Josh)") and keep going. Each slice merges through a pull
request behind `ci-ok`. Marks: `D(x)` = `just deploy x` plus a live check (sites 200, no new ERROR
in SigNoz); **R** = independent review before merge; **$** = Josh's flag first; **J** = a step only
Josh can do. Exclusive files while in flight: Dockerfiles (repo-2), `deploy/docker-compose.yml`
(repo-3), every `package.json` (repo-4, repo-6), the config schemas (lib-4), the `justfile`
(ops-1a/1b). Engineering calls made: Zod generated from Pydantic; tsdown for server entries; the
migration runner is a TS package; the ops CLI is Python; Dagster eager automation ships with old
backfills off; a nullary weal function re-runs its body each call; akasha SPA navigation and the
token source keep today's look exactly (no stakeholder sign-off needed); assay theme P stays out
(ADR 0043).

- [x] **repo-1** layout move (ADR 0015), live 2026-10-24 ~00:10Z at `5cab2255`. Prep repo-1a
  (`a6a84211`) made code resolve the repo root by marker, not depth; the move (`e68a8d97`) is one
  commit (2015 files; test counts, member lists and image sizes unchanged). **Incident:** its first
  deploy crash-looped all ten site-kit servers for about 10 minutes, because ten compose
  `command:` overrides still used the old depth and `deploy.sh` reported success anyway. Rolled
  back to `241974a6`, fixed in `5cab2255`, redeployed: all containers healthy, sites 200, no ERROR
  logs, bots ran clean (26 episodes).
- Wave 1:
  - [ ] repo-2 one Node Dockerfile (`ARG APP`, `pnpm fetch`/`deploy --prod`); retire the
    `.dockerignore` allowlist. D(all).
  - [ ] lib-1 `SecretRef.require()/optional()` in both languages; delete app wrappers. R.
  - [ ] lib-2 per-language namespace validation; one whole-file CI test; fixture KDL; one root finder.
  - [ ] pipe-1 `Definitions.merge` + load test; `dagster/` a uv member; delete the dead assets.
  - [ ] pipe-2 decided deletions (ADR 0021, 0022, 0023).
  - [ ] cdx-1 corpus-root injection; production fails closed; real-corpus suite opt-in.
  - [ ] cdx-3 codex dead code (ADR 0020) and the small bug list.
  - [ ] asy-1 archive the workshop and `review-ui/`; ASY-5, ASY-21.
  - [ ] svc-1 one typed portal tool registry.
  - [ ] weal-1 Rust CI lane, `gen/` source-hash check, WEAL-4, WEAL-23.
  - [ ] weal-2 nullary functions re-evaluate (WEAL-1); generative test; rebuild wasm.
  - [ ] ops-2 `just doctor`; watchdog checks backup age and entity drift; scheduled restore test.
- Wave 2: repo-3 compose anchors and mounted config (after repo-2); repo-4 pnpm catalogs, one
  `[tool.uv.sources]` (after repo-2); lib-3 dead config and the every-field-has-a-reader check
  (after lib-2, pipe-2); lib-7b Python observe bootstrap; lib-8a typed KDL decoders; lib-9 vellum
  parity over the corpus; pipe-3 sessions library; pipe-4a Dagster resources; cdx-2 regenerated
  fixture; asy-2 store model and formatter (R); svc-2 versioned bridge handshake (R, J for the
  module install); weal-3 bot load and error handling; ops-11 deploy follow-ups (R).
- Wave 3: repo-5 vitest projects, drop vite-plus; lib-4 Zod from Pydantic; lib-7a Node observe
  register; lib-8b one `being.kdl` parser; pipe-4b one partition set (R); pipe-5 blocking asset
  checks and the lexicon; cdx-4 immutable releases (R); cdx-5a corpus library; asy-4 books to
  assay; svc-3a portal pf2e layer; svc-4 migration runner and store integration tests (R);
  weal-4 one wire schema; ops-1a Python ops CLI; ops-8 split the Docker network (R).
- Wave 4: repo-6 package-script hygiene; kit-1a site-kit preset (strider, akasha, mouthpiece);
  kit-2a `createService()` (orator, menhir; R); lib-5 LLM client owns keys ($ small); pipe-4c eager
  automation ($); pipe-6 resumable paid stages ($); pipe-8 Docker run launcher and in-flight
  guard; cdx-5b ingest CLI; svc-3b `handlers.ts` split; weal-5a one pipeline; ops-1b thin justfile;
  ops-3 edge in the repo (R, J sudo); ops-4 alert rules as code; ops-7/10 image layer order and
  infra CI lane.
- Waves 5 and 6: kit-1b, kit-1c, kit-2b, kit-3 (tsdown, delete `nodeTsResolve.mjs`); lib-6 one
  cost meter and retry budget; lib-7c `opentelemetry-api` 1.45.1; pipe-7a/7b heartwood (wait for
  gate E; 7b R); pipe-9 rclone sensor (J); pipe-10 timeline; cdx-6 pass registry; cdx-7 Playwright
  lane; svc-3c; svc-5; weal-5b, weal-5c; ops-5 live smoke timer; ops-6 Renovate (parked); ops-9.
- Phase 3, each after its area: p3-0 CI check against decision IDs (first); comment sweeps per
  area; p3-tests behaviour-named tests; p3-docs per-domain READMEs and `CLAUDE.md` files (campaign
  content parked); p3-dead knip deletions; p3-fe-a..e frontend items (fe-c akasha SPA and fe-d
  tokens keep the look); p3-ratchet CI ratchets over section 8.
- Blocked: cdx-8 popover and listing redesign waits for codex gate H; asy-3 single `Scorer`,
  cdx-alias, ops-6 and the campaign-content move wait on the parked decisions.

**Context for the next session:** the review page is
https://claude.ai/artifact/PfwtSxfVtGGKnyFQ54RREH (Josh's verdicts live in its `reviews` store).
The 13 lane reports with full evidence are in `artifacts/research/techdebt-0037/lanes/`.
Start a session with `docs/now.md` (the `load` skill reads it). At the end of a session,
remove finished agent worktrees under `.claude/worktrees/` (`git worktree remove --force --force`,
since the agent tool leaves them locked) and delete their `worktree-agent-*` branches once their
commits are on `main`.

## 1. Summary

The code inside each app is mostly good. ruff and ty pass across the Python apps, the libraries are
type-clean, and the production code has no TODO markers, no `@ts-ignore`, no bare `except:` and no
`unwrap()` in the Rust library. Most apps keep their logic in pure functions behind injected seams,
and several patterns (the codex corpus contract, the portal wire package, the weal engine's oracle
tests) are genuinely strong. The debt sits between the parts, and in how the work gets done.

Five root causes produce most of the 321 findings:

1. **There is no working quality gate.** No CI run that executed the Python lane has passed since
   2026-08-09. The TypeScript test lane has been red since 2026-10-17, and because it stops at the
   first failing package, codex and seven other packages have not been tested in CI since then. Nobody
   was told, because the working rule is "don't watch CI" and nothing posts a failure.
2. **Production runs out of the developer's working tree, and git `main` is the pipeline's data
   bus.** A timer commits pipeline output, pushes (including other sessions' unpushed commits), and
   redeploys from the same tree that agents edit. About 143 commits (12.5% of history) are bot data
   commits, and 17 memory files describe working around that timer.
3. **Structure is replaced by lists and copies.** New apps must be registered by hand in about 17
   places (a uv exclude list, 14 Dockerfiles with 17 manifest lines each, the Dagster asset list,
   compose, Caddy, two config schemas). The "template" frontend is copied, not shared, and the copies
   have drifted. Five services each hand-roll the same server plumbing.
4. **Contracts are mirrored by hand.** The config schema exists three times (KDL, Pydantic, Zod) with
   every default repeated; 14 defaults already disagree with `config.kdl`. The portal tool contract
   lives in six places, the orator API types in three, and several other wires are hand-copied.
5. **Knowledge lives in prose that someone must remember.** `MEMORY.md` costs about 25,000 tokens in
   every session and every subagent, 91% of it is changelog, and some of its present-tense claims are
   false. `RESUME.md` is 235 KB and 74 days stale. About 2,800 production comment lines cite spec or
   decision IDs. Many "gotchas" are rules a structural change could make impossible to break.

On top of these, the research found a set of **live security exposures and live hazards** that should
be fixed before the paydown proper starts (section 2).

**Recommended order:** Phase 0 stops the bleeding (security, green CI, alerting, backups, disk) in
about 3 days. Phase 1 lays foundations (a deploy checkout, one data root, pipeline data out of git,
one dev entry point, a stricter gate, the new docs skeleton) in about a week. Phase 2 does the
structural refactors per area as parallel tracks over 2 to 3 weeks. Phase 3 sweeps comments and docs
and installs ratchets. Phases 0 to 2 fit "a sprint or two" only if Phase 2 runs as parallel tracks.
The full catalogue is closer to 5 to 6 weeks of serial agent work.

## 2. Act now (before the paydown proper)

These items are live exposures or live hazards. Each is small and independent. Items marked
**needs Josh** involve sudo, the live Foundry world, a stakeholder call, or a paid or live action.

| # | Item | Why now | Effort | Lanes |
|---|---|---|---|---|
| 1 | **Portal: every handler is reachable by any logged-in Foundry player.** The module registers all 22 handlers in Foundry's global `CONFIG.queries`, which Foundry 13 lets players invoke on the GM's client by default. That path skips the bridge key, the MCP key, the GM check and the audit log, and it includes `execute-macro`. Fix: keep handlers in a module-private map. **Needs Josh:** check whether the live world removes the player query permission; module update plus headless restart. | Player-reachable GM-level code execution | S | SVC-1 |
| 2 | **Cloudflare DNS token** is a plaintext literal in the parent Caddyfile and three world-readable backups, is served by the unauthenticated Caddy admin API, is printed to the journal at every start (`--environ`), transited chat, and has never been rotated. **Needs Josh** (sudo, shared edge). | Whoever holds it controls every `*.iridi.cc` host and can mint certificates | S | SEC-1, OPS-7 |
| 3 | **Network exposure.** 20 astra ports listen on `0.0.0.0` (verified with `ss`). That includes three Postgres instances whose password equals the username, with those credentials committed in the public `config.kdl`, and the Dagster UI, which can launch paid and live runs with no auth from the LAN. The host firewall is empty. Fix: bind every published port to `127.0.0.1`, drop the Postgres port mappings, and move real passwords into SOPS. | LAN or tailnet device gets DB superuser or launches paid runs | S | SEC-3, SEC-4, OPS-8, WEAL-12 |
| 4 | **Auth fails open on empty secrets.** Compose injects `${KEY:-}`, and both config libraries treat `""` as a valid secret. A container recreated without `just up` gets an empty orator session secret (anyone can forge an admin cookie) and an empty allowlist (anyone can log in). weal-overlay accepts unauthenticated rolls the same way. Fix: `SecretRef.require()` treats empty as missing; services fail closed at startup. | Silent "no security" after a routine restart | S | LIB-2, SVC-2, SEC-12 |
| 5 | **Scriptorium is still live** 12 weeks after the review closed: public, no auth, unbounded write endpoints, bound to `0.0.0.0:10390`, running as the admin user. Its state file is the only copy of the stakeholder's review record and is gitignored. Archive the state into `thoughts/`, then tear it down. **Needs Josh:** confirm the review is finished. | Public write surface on the host disk | S | ASY-1, SEC-10 |
| 6 | **No secret has ever been rotated.** Every SOPS ciphertext is unchanged since its first commit, including four keys that transited chat (Discord ops webhook, portal player key, Cartesia key, Cloudflare token). Rotate now, add a rotation runbook that lists every copy of every secret. **Needs Josh.** | Leaked credentials still valid | S | SEC-2 |
| 7 | **`otel.iridi.cc` accepts telemetry from anyone**, so anyone can page the Discord ops channel with a forged ERROR log or fill ClickHouse. Give public ingest its own receiver with a filter and size limits; exclude RUM services from the paging rule. | Internet-reachable write path into paging | M | SEC-6, OPS-8 |
| 8 | **Known-vulnerable dependencies.** The deployed TanStack Start version carries a reflected-XSS advisory that affects every public SSR frontend. `pnpm audit --prod` reports 4 critical and 33 high; `pip-audit` reports 26. Dependabot is off. One upgrade pass, then automation. | Public-facing advisories | M | SEC-7 |
| 9 | **One weal macro can break every roll for every player.** `save(:adv, \|\| 2d20kh1)` is accepted, passes the boot check, and then makes every later roll fail, across restarts; re-saving does not fix it and recovery needs hand SQL. A bot-side guard (dry-run a save before persisting it) can ship today, ahead of the engine fix. | Any player can take the dice bot down by accident | S | WEAL-2, WEAL-1 |
| 10 | **No backups** of anything outside git: three Postgres databases, the orator music library (not re-seedable), OAuth state, SigNoz alert rules, and the only copy of the SOPS age key. The "backup" volumes in memory no longer exist. | One disk failure loses irreplaceable data and every secret | M | OPS-6 |
| 11 | **Public repo exposure.** The repo is public (verified). It commits fonts that its own notes call personal-use commercial, plus session transcripts that contain players' names, verbatim table talk and Discord IDs. **Needs Josh:** a stakeholder decision (section 6). | Licensing and player privacy | S | ASY-2, SEC-18 |
| 12 | **Disk.** The Dagster image is 25.7 GB because `.dockerignore` does not exclude 22 GB of Craig recordings and episodes. Docker holds about 455 GB (287 GB reclaimable images plus 112 GB of build cache) on the disk that filled in July. Fix `.dockerignore`, then prune once. | Disk-full incident class | S | OPS-1, OPS-22, PIPE-5 |
| 13 | **CI is red** (verified): `ty` fails on an `icepool` import in a Rust-crate helper script, and a mouthpiece-frontend test asserts a live episode count that the publishing timer changed. | Every "green slice" since August was unverified | S | REPO-1, TEST-1, PROC-3 |
| 14 | **Pipeline step failures never page.** Dagster logs step failures on its own logger, which is not exported; SigNoz shows 0 ERROR logs for the pipeline in 30 days. Add a run-failure sensor. | A failed paid step is found only when an episode is missing | S | PIPE-2 |

## 3. Findings by root cause

Each theme has a short explanation, then the consolidated findings. A finding lists the problem, the
fix, and its lane IDs. Impact and effort per item are in the lane files.

### A. No working quality gate

Every rule about "CI-green slices" assumes a gate that has not worked since August. Main has been red
on every push that ran the Python lane, three lanes are red now, and the only feedback path is a
human reading GitHub.

- **Fix the three reds.** Give `libs/rust/weal-engine/tools/gen_oracle.py` a PEP 723 dependency on
  icepool and exclude `libs/rust/` from ty; rewrite the mouthpiece-frontend snapshot test to assert
  invariants (as the Python twin already does); give the codex fixture the shapes the virtualization
  guard needs, which has failed 19 of 19 runs. REPO-1, TEST-1, TEST-4, WEAL-23.
- **Make red visible.** Add an always-run `ci-ok` aggregator job and a Discord post on any main
  failure through the existing ops webhook. Make the session-start skill report main's CI status
  first. Keep the "don't poll CI" rule. REPO-1, TEST-1, PROC-3.
- **Stop one failing package from hiding the rest.** `vp run -r test` stops at the first failure and
  has no flag to continue; since 2026-10-17 eight packages, codex included, have not run in CI. Use
  root vitest `projects` or `pnpm -r --no-bail`, with grouped logs. TEST-2.
- **Close the path-filter gaps.** `dagster/`, `deploy/`, `justfile`, `sites.caddyfile`,
  `libs/rust/` and the root `fixtures/` trigger no job; `ontology/` skips the TS lane although TS
  reads `config.kdl`; `apps/**` triggers both lanes, so every bot data commit runs everything; and
  `cancel-in-progress` cancels main runs (15 of the last 100). Add a nightly run with every filter
  forced on. TEST-6, REPO-8, REPO-11.
- **Add the missing lanes.** A path-filtered Rust lane (fmt, clippy, test, then rebuild the wasm in a
  pinned container and diff `gen/`); an infra lane (`docker compose config`, `caddy adapt`,
  shellcheck, `systemd-analyze verify`, hadolint, one image build per Dockerfile family); one
  browser lane on `@playwright/test`; Postgres service containers for the store integration tests.
  WEAL-3, WEAL-4, OPS-21, TEST-10, TEST-14, TEST-21, TEST-23, CDX-16.
- **Enforce commits as documented.** commitlint runs only on pull requests, and there has been one
  pull request ever; 152 subjects exceed the 100-character limit. Add a `commit-msg` hook and lint on
  push. REPO-17, PROC-7.
- **Scope the pre-commit hook to staged files.** It checks the whole working tree, so one agent's
  work in progress blocks another agent's commit. Use lefthook with `{staged_files}`; never a
  stash-based tool in this tree. REPO-14.
- **One local entry point.** Add `just bootstrap`, `just check`, `just fix`, `just test [pkg]`,
  `just ci` (exactly what CI runs) and `just dev <app>`. Every doc then says "run `just ci`". REPO-9,
  TEST-8.
- **One Python version.** Tests and CI run on 3.14 while production runs 3.12. Add `.python-version`
  and a ty `python-version`. REPO-10, TEST-17, PIPE-19.
- **Decide on vp.** It added a tool and three documented gotchas; its test cache misses 100% of the
  time and CI never persists its cache. Keep it only if a measured warm `just check` is meaningfully
  faster. REPO-19.
- **Target merge model.** Agents push short-lived branches and use `gh pr merge --auto`, with branch
  protection requiring `ci-ok`. This becomes practical once bots stop committing to the code repo
  (theme B). Decision in section 6. REPO-1.

### B. Production shares the developer's working tree, and git `main` is the data bus

Three automated publishers commit and push from the tree where agents edit, and every deploy builds
from whatever is on disk. That single choice caused the most frequently re-documented incident class
in the repo (the timer sweeping other sessions' staged files into mislabeled commits, at least five
times) and means nobody can say which commit is live.

- **Give production its own checkout.** A deploy checkout (for example `/srv/astra`) tracks
  `origin/main` with fast-forward-only pulls. One `deploy` command fetches a SHA, takes a lock,
  injects secrets, builds with an `org.opencontainers.image.revision` label, refuses a dirty tree,
  and records what is live. Timers, the heartwood agent and `just up` run only there. OPS-3, PROC-5,
  REPO-3.
- **Stop publishing pipeline data through `main`.** The linguist-commit timer commits and pushes
  every 15 minutes, and pushed 6 times in the last week while making only 3 commits (so it pushed
  other people's work). Pipeline output (transcripts, linguist data, timeline, episode catalog)
  moves under the data root with a nightly backup; akasha and mouthpiece read it at runtime from a
  read-only mount, the way codex and the mouthpiece audio already do. If transcript history in git is
  wanted, a bot commits to a separate data repo. Interim step: the timer pushes only its own commits.
  OPS-2, PIPE-3, REPO-4, TEST-5.
- **Use a bot identity.** All 1,147 commits are authored "Josh Bassin", including bot commits, and
  wiki content is typed `feat`. Run bots as `astra-bot` with `chore(content)`, using a repo-scoped
  deploy key instead of the personal, passphrase-less, account-wide SSH key. PROC-23, SEC-5.
- **If automated publishing to git survives, gate it.** Run the matching data checks before each
  automated commit and skip the commit on failure. TEST-5.

### C. Runtime data and config live inside source directories and images

The 2026-06 move to `artifacts/` covered named volumes but left the pipeline's working directories
inside `apps/`. Docker then bakes them into images, and three different path conventions map them
back into containers.

- **Make `.dockerignore` an allowlist** and build from a clean `git archive` of the deploy SHA. Copy
  manifests before sources so dependency layers survive a code edit. The Dagster image drops from
  25.7 GB to roughly its dependency size. OPS-1, PIPE-5, REPO-2, ASY-16.
- **One data root.** All runtime I/O lives under `artifacts/{state,cache,scratch}/<service>` on the
  host and `/data/<service>` in containers. Config resolves paths relative to one root, so the
  host-absolute path stops appearing 68 times. Delete the runtime `APP_ROOT`/`REPO_ROOT` constants and
  the cross-app `astra_linguist.__file__` lookup. PIPE-8, OPS-13, OPS-28, LIB-10.
- **Immutable codex releases.** Ingest writes `releases/<content-hash>/{corpus,search}`, validates
  it, and flips a `current` symlink; the server keys caches by release id. That replaces in-place
  rewrites of the live mount (25 to 91 seconds degraded per deploy) and the improvised deploy recipe
  each round invented. CDX-2, CDX-21, CDX-12.
- **Mount config instead of baking it**, so a config change is a restart, not a rebuild of every
  image. OPS-20, PIPE-5.
- **Fail when a bind source is missing.** Docker silently creates a missing source as root; it
  already recreated the deleted faerrin tree. Use `create_host_path: false` and a `just doctor`
  check. OPS-14, PIPE-13.
- **Disk hygiene.** A weekly prune timer, log rotation, memory limits. OPS-22, OPS-24.

### D. Registration lists and copy-paste scaffolding

"Manifest-decided membership" is list-decided in practice. Adding an app touches about 17 files, and
forgetting one breaks a lane or surfaces only at deploy. The frontend and service shells are copied
per app and drift.

- **Workspace membership.** pyproject carries a hand-maintained exclude list of 14 TS apps, and
  pnpm needs a special `apps/portal/*` entry. Now: a guard test that explains the fix in one line.
  Later: a layout where membership follows from location (decision in section 6). REPO-5.
- **One parameterized Node Dockerfile.** 14 Node Dockerfiles carry 238 `COPY apps/*/package.json`
  lines, and every runtime image ships the full 547 MB workspace `node_modules` with dev
  dependencies. Use `pnpm fetch` (needs only the lockfile), one shared Dockerfile with `ARG APP`, and
  `pnpm deploy --prod` for the runtime stage. Keep bespoke files only for ffmpeg and Chromium images.
  OPS-4, REPO-6, SMELL-2.
- **The frontend template becomes a package.** About 15 shell files are copied across six or seven
  apps (five different `ClientOnly` copies, although TanStack exports one; mouthpiece still has the
  unlayered reset; a smoke-test fix reached akasha but not strider). Move the Vite preset, router
  factory, root document, RUM bootstrap, smoke helper and vitest preset into `@astra/site-kit`, and
  add `just new-frontend <name> <port>`. FE-1, TEST-20, FE-14.
- **A service kit.** Five TS services each hand-roll the HTTP bootstrap: `isFile` exists five times,
  `serveStatic` four times, and the two `json()` helpers take their arguments in opposite orders.
  Add `createService()`: a typed route table with zod bodies, route-named spans, readiness probes,
  ordered shutdown, `requireSecret` and constant-time compare. SVC-5, SVC-11, SVC-19, SVC-20.
- **Dagster definitions.** The root file hand-lists 17 assets that each app already exports as
  `defs`. Use `Definitions.merge`, make `dagster/` a uv member under ruff and ty (it already passes),
  and add a load test. REPO-12, PIPE-15, TEST-7.
- **Compose anchors.** 707 lines with 17 copies of the same healthcheck, user, restart and network
  blocks. Add an `x-astra-node` anchor and drop the `command:` lines that repeat the Dockerfile.
  OPS-12.
- **Dependency catalogs.** A pnpm `catalog:` for shared deps, one root `[tool.uv.sources]`, and the
  Dagster server packages inside the lockfile. REPO-20, FE-23, REPO-25.
- **Retire the custom TS loader.** Production runs raw TypeScript through a 99-line resolve hook that
  is referenced about 130 times and has needed four bug fixes. Bundle server entries (Vite or tsdown)
  or switch to explicit `.ts` imports, then delete the hook. FE-7, SVC-7, REPO-18, CDX-14.
- **Package script hygiene.** Delete the 14 `echo 'no build step'` builds and the
  `--passWithNoTests` flags, make content generation an explicit task, and stop committing
  `routeTree.gen.ts` (or check its freshness in CI); seven dead `generate-routes.ts` scripts cause
  the documented "flap". REPO-18, REPO-21, FE-8.

### E. Hand-mirrored contracts

Each pair below is held together by discipline and a parity test, or by nothing.

- **Config schema.** KDL, Pydantic and Zod repeat every field and default; 33 of 34 Python schema
  commits also touched the TS schema; 14 defaults disagree with `config.kdl`; only 2 of 23 namespaces
  are read by both languages, so 21 exist only to satisfy the other language's strict top level.
  Interim: each language validates only the namespaces it reads, and one CI test validates the whole
  file. Target: generate the Zod schema from the Pydantic JSON Schema, make fields required (values
  live only in `config.kdl`), and validate per process by namespace. LIB-1, SMELL-7.
- **Ontology files.** `being.kdl` is parsed by two hand-written walkers plus a committed parity JSON
  with no regeneration recipe. `entity.kdl` is a fully derived artifact (0 of 468 entities are
  manual) whose drift test couples unrelated commits. One parser plus `just ontology-gen --check`;
  build the entity registry at load time. LIB-13, LIB-14, LIB-15.
- **KDL decoding.** Eight hand-written walkers over untyped nodes; a missing field becomes the string
  `"None"`, which passes validation. One typed decoder and one correct emitter per language. LIB-12.
- **Portal tools.** One tool's definition spans six hand-synced places, and the server casts module
  results instead of validating them. One typed tool registry in `portal-shared` drives server
  registration, module dispatch, player visibility and output schemas. SVC-3.
- **Portal bridge protocol.** No version and no auth acknowledgement, so version skew shows up as
  "bad key", and the F5, headless-restart and "roll back together" rituals follow. Add a versioned
  handshake, an `auth-ok` reply, distinct close codes, a reload when the module is stale, and
  server-side designation of the bridge user. SVC-4, SVC-13, SVC-18.
- **Other wires.** orator API types exist three times (server, SPA, Stream Deck plugin); the weal
  bot-to-overlay message twice with legacy names; the Rust-to-TS engine JSON by hand; assay's export
  as plain dicts against a strict Zod consumer; frontend generated modules write their types as
  string templates and never validate backend snapshots. One schema per wire, imported by both
  sides. SVC-22, WEAL-18, WEAL-19, ASY-10, FE-18.
- **Vellum metadata.** The Python twin agrees with the TS parser on all 359 corpus files today, but
  its CI parity check covers 7 fixtures, none in the syntax 27 corpus files use. Run parity over the
  whole corpus now; retire the twin later. LIB-18.

### F. Secrets and config plumbing that works by coincidence

- **`SecretRef.require()` and `optional()`** in both languages, with empty treated as unset; delete
  the five app-level wrappers. LIB-2, SVC-2.
- **Compose fails loud.** Use `${KEY:?run just up}` for required secrets, route every compose call
  (timers, heartwood, codex, humans) through one wrapper that injects secrets and takes the deploy
  lock, generate each service's secret list from the `ref=` entries it reads, and move to
  file-based secrets so values do not appear in `docker inspect`. OPS-5.
- **One SOPS naming rule.** 7 of 19 secret fields use a key that cannot be derived from the field
  name; adopt `<namespace>_<field>`. LIB-2.
- **The LLM client resolves provider keys itself.** Today nine call sites write keys into
  `os.environ` before using litellm, and the live mouthpiece path works only because a SOPS key name
  happens to match litellm's env var. LIB-3, SMELL-7.
- **Telemetry picks its own endpoint.** Host-run CLIs must currently choose the host OTLP endpoint by
  hand, and several do not. A runtime marker set by compose decides; a `with astra_observe.run(...)`
  wrapper replaces nine hand-written init and shutdown blocks. LIB-7.
- **Delete dead config.** 16 keys and 2 whole namespaces are read by nothing (plus the never
  provisioned weal dice feed, whose SOPS key does not exist); add a CI check that every schema field
  has a reader. LIB-9, PIPE-18, WEAL-15.
- **`config.kdl` stops storing derived values and false documentation.** The scribe-to-linguist
  path invariant is a comment; the header claims an env override that does not exist for plain
  fields; ports are retyped three or four times across config, compose and Caddy; weal-overlay shares
  strider's port number. LIB-10, OPS-13, FE-26.
- **One repo-root finder and one loader per language,** memoized; there are 13 root walkers with four
  different marker files today. LIB-11.
- **LLM profiles.** Named profiles in config (model, max tokens, timeout) replace scattered model
  fields and constants; the library has no default, because the 16k default truncated reasoning
  models three times. LIB-17.

### G. Observability that looks complete but is not

"Telemetry from day one" holds on paper. In practice the signals that would have caught this year's
incidents are missing, and most stored spans are Docker probing itself.

- **Page on pipeline failures.** A `run_failure_sensor` that logs one ERROR on the pipeline logger,
  plus a freshness check for "transcript but no episode after N hours". PIPE-2.
- **Alert on what actually broke.** Certificates were expired for a week with no page; nothing
  watches container health or the Dagster daemon; alert rules exist only in SigNoz's database. Store
  rules as code, add certificate, health and heartbeat rules, give every oneshot unit a timeout, and
  tag resources with `deployment.environment` so host test runs cannot page. OPS-10, SVC-12.
- **Cheap health endpoints and low-cardinality span names.** Healthchecks render the SSR home page
  every 15 seconds, which is 75 to 96% of all spans; span names embed raw paths (1,626 distinct names
  for akasha in a week, many of them scanner probes). Add `/healthz` with no span and name spans by
  route template. OPS-11, FE-5, LIB-6.
- **TS telemetry by construction.** One `node --import @astra/observe/register` bootstrap installs
  providers before app code (so module-scope instruments work), registers HTTP and undici
  instrumentation, and installs the signal flush once (it is copied into 8 places today). LIB-6,
  SVC-6.
- **One LLM meter and one retry budget.** Cost is metered four ways under four metric names from two
  price sources; the static price table drifts on every model change; retried attempts, dspy calls,
  ASR and TTS are not priced; and retries are layered four deep (up to 36 billed completions for one
  logical call). LIB-4, LIB-5, PIPE-10, PIPE-11.
- **No silent failures.** About 120 failure paths drop the error with no log or span (82 TS catch
  blocks, 26 no-op `.catch()` handlers, 9 Python broad excepts). Add `reportIgnored()` helpers that
  record a span event and a counter, a logger that mirrors to stdout, and lint rules. SMELL-3,
  SMELL-9, LIB-21, CDX-17.
- **Tests stop writing to production SigNoz,** and the two telemetry tests that cannot fail get real
  assertions through in-memory exporters. LIB-8, TEST-15.
- **Engine errors are visible.** weal's internal engine errors are counted as ordinary user errors and
  never logged, and wasm crashes are labeled "fuel" before the bot's recovery path can see them.
  WEAL-5, WEAL-6, WEAL-17.
- **Real RUM and a live smoke check.** Browser RUM sends one sub-millisecond span and costs an extra
  request per page; add navigation timing, web vitals and error capture. A timer probes every public
  host (status, certificate expiry, a real-content marker) and pipeline freshness. FE-9, TEST-12.
- **Degraded must not look healthy.** orator disables playback for the life of the process if Discord
  is unreachable at boot; vellum-render never relaunches a dead Chromium; healthchecks restart
  nothing. Readiness probes per dependency, with a deliberate decision on restart-on-unhealthy.
  SVC-12, WEAL-16.

### H. The pipeline is four graphs glued together by sensors

- **One graph.** Four `DynamicPartitionsDefinition`s keyed by the same date are chained by
  file-watching sensors, two cursor "adoption" hacks and a file-existence gate that defers forever at
  INFO. One shared `sessions` partition set, real asset dependencies, eager automation and one Craig
  sensor; register history once with `report_runless_asset_event`. PIPE-1.
- **heartwood inside the pipeline.** The agent runs on the host through a request-file protocol,
  path units, about 400 lines of justfile bash and a 349-line runner, only because it needs node and
  git. Bundle the TS validator, replace `git diff` with `difflib`, run the agent as a normal asset,
  and keep one small host publisher. PIPE-4, OPS-23.
- **Dagster resources** for the LLM client, the TTS provider, paths and config, so asset bodies can be
  tested with `dg.materialize`; only scribe does this today. PIPE-16.
- **Asset checks.** Three empty transcripts are committed as successful sessions; a second recording
  on the same date is silently ignored; an undated zip is skipped with no log line. PIPE-12.
- **A shared `sessions` library.** Three date sort keys with different semantics, transcript filename
  parsing in four forms, transcript line regexes with two meanings, `_atomic_write` four times, and
  near-duplicate RLM tool classes in heartwood and mouthpiece. PIPE-9.
- **Paid stages that resume.** TTS deletes every clip before rendering, so each retry re-bills every
  chunk; cache clips by content hash, persist Pass A before Pass B, and define one retry policy with a
  test that lists every asset's decision. PIPE-11.
- **Campaign identity as data.** A first-match substring heuristic decides the campaign, freezes it
  into file names, and is corrected by a Python constant baked into the image. Score all campaigns,
  record a sidecar, allow a per-date override in `being.kdl`. PIPE-17.
- **Replace the Drive FUSE mount** (about 600 lines of bash, probes, sudoers rules and
  auto-remediation, wedging twice this week) with an `rclone copy` run by a Dagster sensor. OPS-9.
- **Deploys that do not kill runs.** Refuse to deploy while runs are in flight, add Dagster
  healthchecks, consider the Docker run launcher. OPS-18.
- **Small structural items.** `campaign_timeline` runs hourly instead of when inputs change; episode
  kind is encoded in the id string; the scribe asset re-derives the zip the sensor already chose.
  PIPE-20, PIPE-22, PIPE-23.

### I. Tests tied to live data and host state

- **Stop pinning production values.** 125 assertions across the two config test suites check values
  in the real `config.kdl`; 27 of 44 config commits had to edit tests. Loader tests use a fixture KDL;
  production data gets invariant tests (unique ports, port band, resolvable refs); cross-language
  parity uses one committed canonical JSON. The same applies to campaign counts and voice ids. TEST-3.
- **Codex knows its corpus.** Tests use whichever corpus is on disk (real on the host, fixture in CI),
  so 19 test files weaken assertions to pass on both; production falls back to the fixture silently
  and the runtime image ships it on purpose; the documented hermeticity check moves the directory the
  live container mounts. Inject the corpus root, fail closed in production with a schema-version
  check, and make the real-corpus checks an explicit opt-in suite. TEST-4, CDX-1, CDX-4, CDX-18.
- **Regenerable fixtures.** The codex fixture can be rebuilt only on this host, and rebuilding deletes
  90 hand-made rows a CI guard needs. Generate the entity fixture from the committed raw fixture in
  test setup, with synthetic rows in code. CDX-3, TEST-9.
- **No stale builds.** SSR smoke tests reuse any `dist/` on disk; content setup runs only when output
  is absent; content-generation failures are only logged; stale host `src/generated/` enters every
  Docker context. TEST-11, FE-3.
- **Real SQL tests and migrations.** orator's 768-line store and weal's store are never run against
  Postgres, and schema is `create table if not exists` with no migration ledger. CI Postgres plus one
  shared numbered-migration runner. TEST-14, SVC-10, WEAL-26.
- **Run the gated tests in CI.** The Deno sandbox, SOPS decrypt and node validator tests always skip
  in CI. Give CI a pinned Deno and a throwaway age key. TEST-13.
- **pytest defaults.** `--import-mode=importlib` removes the unique-basename rule; `norecursedirs`
  stops collection walking 119,466 codex data files; a `libs/py/testing` member holds shared fakes.
  TEST-16, REPO-24.
- **Better test forms.** Rendered-prompt snapshots instead of 28 phrase assertions; Playwright Test
  instead of two hand-rolled harnesses with 22 fixed sleeps (and codex built four times per CI run);
  `toMatchFileSnapshot` goldens through the production render path. TEST-18, TEST-10, CDX-13, CDX-16.
- **Test the seams.** One contract test across the pipeline stages' real writers and readers;
  shellcheck and bats for the alerting script; portal fixtures that capture both the source and the
  live (hydrated) side, because every 0028 bug lived on that boundary. TEST-21, TEST-22, SVC-9.
- **Organize tests by behavior.** The largest test files are organized by delivery slice (portal's
  `handlers.test.ts` is 3,819 lines), about 500 test titles carry decision codes, and codex has 23
  files of private builders. TEST-19, TEST-24, CDX-28, SMELL-11.

### J. A narrow lint and type gate with many exemptions

- **oxlint.** 18 rules are off repo-wide and 49 path globs disable rules per file (3 point at deleted
  files), on the false premise that oxlint has no line-level disable. The deferred type-aware debt
  grew from 363 to about 1,020 diagnostics. The exemptions hide a real conditional-hook bug
  (`apps/codex/web/src/domain/browse/FacetPanel.tsx:150`) and turn off six accessibility rules on whole
  interactive components. Replace path overrides with reasoned inline disables, adopt the immediate
  rule set, ratchet the rest. REPO-13, SMELL-4, FE-22.
- **ruff.** Only `E,F,I,UP,B,SIM` are selected, and `dagster/` and `deploy/` are excluded although
  they pass. The recommended immediate additions (BLE, RUF100, PERF, PTH, T20, C90, S and others)
  surface about 135 production violations. REPO-16, SMELL-4.
- **Typecheck coverage.** 50 tracked TS files (3,455 lines) sit outside every tsconfig, including all
  seven production `server.ts` entry points and every `build-content.ts`; including them surfaces
  about 26 real errors. REPO-7, FE-4.
- **`erasableSyntaxOnly`.** Missing from the base tsconfig; five comments instead tell people not to
  use parameter properties, which crash only at container start. SVC-7.
- **Type escapes at boundaries.** 872 unsafe type assertions (368 in portal, at the Foundry API
  boundary), 98 non-null assertions hidden by path overrides, 343 Python `Any` references. Parse at
  the boundary with Zod or Pydantic; typed source and live accessors for pf2e data. SMELL-6, SVC-8.
- **Turn conventions into rules.** Ban the `getMeter` export, `from __future__ import annotations` in
  Dagster asset modules (1 violation today), env reads outside the config libraries (22),
  `dspy` outside the LLM library (14 sites, if decided), hardcoded ports and production `console`.
  SMELL-10, SMELL-7.
- **Ratchets.** CI records the baseline counts in section 8 and fails when any rises. SMELL ratchets.
- **One command and one ignore list.** The lint and format command lines appear three times and the
  ignore lists twice. REPO-22.
- **No control characters in source.** A raw NUL byte makes one akasha source file binary to git and
  grep; the class has recurred twice. FE-27.

### K. Operations in bash, by hand, outside the repo

- **The justfile becomes a thin index.** It is 1,024 lines with 27 bash bodies, the paid, live and
  destructive recipes carry no `[confirm]`, several recipes are dead or default to deleted faerrin
  paths, and recipe arguments are interpolated into bash (a latent injection path from the Dagster
  UI). Move logic into a tested Python ops CLI; group and confirm recipes. OPS-15, SEC-11.
- **The alerting script.** `alert-notify.sh` is 502 lines of untested bash mixing app paging with NIC
  and FUSE repair under NOPASSWD sudo. After the rclone change, port the paging core to tested Python
  and move host repair out of the app repo. OPS-16.
- **Declared host dependencies.** just, uv, node (via nvm), pnpm, deno, sops, tectonic and the wasm
  tools are installed by hand; units are installed by copying; four recipes carry PATH hacks. Add
  `mise.toml`, `just doctor`, and `systemctl --user link` from the deploy checkout. OPS-17, REPO-15.
- **Bring the edge into the repo.** The parent Caddyfile is not in git; the caddy package's unit file
  is hand-edited, so an `apt upgrade` would replace it and break every `*.iridi.cc` host; the custom
  2023 Caddy build has no recipe and no `Restart=`. Add `deploy/edge/` with an xcaddy recipe and
  drop-ins; `apt-mark hold caddy` now. OPS-7, SEC-1, SEC-5.
- **Pins and updates.** No image is pinned by digest, yt-dlp is bumped by hand after outages, and no
  Renovate or Dependabot runs. OPS-19, SEC-17.
- **Image build order.** The two Chromium images reinstall about 1 GB on every source change and
  store the browser twice. OPS-20.
- **Small infra items.** The host metrics scrape depends on a Docker-assigned gateway IP; the
  vendored SigNoz files are patched in place. OPS-25.
- **A runbook.** Recovery procedures are spread across at least eight memory files, and
  `deploy/README.md` instructs the plain `docker compose up` that silently drops secrets. PROC-16,
  PROC-10, OPS-27.

### L. Code and docs that narrate history

- **Comments describe the present.** About 2,800 production comment lines (3,168 counting scripts,
  Dockerfiles and units) cite spec, decision, slice or gate IDs, which resolve only inside 58 specs.
  In codex, 29% of non-test lines are comments, 42 files have more comment lines than code, and the
  stylesheet is 51% comment bytes. 169 comment lines mention the deleted faerrin repo and 45 still
  describe bun or biome; several are now false. Rule: comments state the current invariant and why;
  history lives in git and the ADR log; a CI check rejects new IDs in changed lines. Sweep each area
  after its structural refactor so files are rewritten once. SMELL-1, PROC-8, CDX-5, FE-24, SVC-24,
  WEAL-24.
- **An ADR log.** Decisions are spread across a historical roadmap ledger, 276 per-spec decision IDs
  that collide across specs, and memory prose. Seed `docs/decisions/` with the 20 to 40 decisions that
  still bind the code, each carrying its old ID as an alias. PROC-9.
- **READMEs that describe the current state.** 39 of 45 workspace members have no README; codex's is
  86 KB organized by delivery round; assay's has the wrong counts and omits two of its three products.
  CDX-24, ASY-23, PROC-18, SVC-25.

### M. Dead code, parked products and temporary surfaces

Delete these (git keeps them). Items marked **ask** need a product decision first.

- Pipeline: `shibboleth.json` (read by nothing; it caused the 2026-07-06 outage and still forces a
  Dockerfile `chown`), the linguist `script/` output, the `akasha_corpus_snapshot` and
  `episodes_index` assets (neither can work in Dagster), `hello_astra`, the faerrin migration code
  still run by timers, the edge TTS provider, Cartesia across every layer, `sharpen`, and the test-only
  episode path. **Ask:** `correction_candidates` (a paid, unmetered call every session; nobody has
  reviewed a candidate since June), the 0034 experiment harness and the roundtable special (move to a
  tools package the image does not install). PIPE-6, PIPE-7, PIPE-13, PIPE-14.
- Libraries: the two `_smoke` packages, the unused `@astra/observe/preload`, the faerrin wiki
  converter, the Phase-0 telemetry smoke, `ensure_anthropic_env`. **Ask:** the Anthropic fallback.
  LIB-19, TEST-25.
- codex: five dead development scripts (1,386 lines), "forever" URL aliases on a noindexed site, two
  shims for the retired gothic design system, 28 unreferenced exports. **Ask:** the hidden assay block
  (about 1,000 lines plus a refresh step and a bind mount; on hold since 2026-07-20). CDX-8, CDX-9,
  CDX-25, CDX-26, CDX-30.
- assay: round-1 model code and its tests; the destructive `fit`, the resurrecting `seed-homebrew`,
  the redundant `extract`; the 1,150-line vendor adapter once its baseline is frozen; stale
  `out/homebrew/` files. **Ask:** what "done" means for assay, the Stage-B reference numbers, and the
  Foundry module plan. ASY-5, ASY-7, ASY-9, ASY-24, ASY-25.
- weal: v1 `funcs` table and interface methods, dead config fields, the unreachable speak API.
  **Ask:** the write-only `dice` history (build a consumer or document it as an archive). WEAL-14,
  WEAL-15, WEAL-16, WEAL-25.
- Frontends: seven `generate-routes.ts` scripts, orphaned `ClientOnly` copies, dead backdrop and
  content-build exports, dark-mode leftovers. FE-8, FE-25, FE-6.
- Repo-wide: knip reports 125 unused exports and 187 unused exported types; dead justfile recipes
  (`orator-audio-migrate`, `pg-migrate`, `mouthpiece-migrate-history`); faerrin-era systemd units;
  the orphan `astra-heartwood:local` image; a stale `stash@{0}`. SMELL-8, OPS-15, OPS-17, OPS-26.
- Give any future temporary surface an expiry date and a `just doctor` warning after it. OPS-26.

### N. God files and missing internal structure

- **codex** becomes three units with one dependency direction: a corpus library (schema, reader,
  pure node utilities), an ingest CLI (all of `src/ingest`, the maps, `runTransform`, search build),
  and a thin SSR frontend. Inside it: a registered pass interface instead of one long orchestrator
  plus a hand-built report; `BrowseListing` (960-line component, two global key listeners) split into
  tested hooks with one shortcut dispatcher; the 2,842-line global stylesheet co-located per
  component with one spacing scale and one breakpoint source; popovers rendered from the entity API
  instead of scraping full SSR pages; per-release static listing JSON instead of the windowed-SSR
  workaround (and fix the cache that keeps rejected promises forever); render-time data cleanup moved
  into the transform; one book registry instead of six modules. CDX-7, CDX-10, CDX-11, CDX-12,
  CDX-15, CDX-19, CDX-20, CDX-23.
- **The liturgy books leave codex.** `apps/codex/web/books/` is assay's print toolchain, codex never
  reads it, and its blobs are about 53% of the repo's git history. Move it with assay, treat the PDF
  and processed art as build outputs, dockerignore it. CDX-6, ASY-2, ASY-13.
- **assay** splits by product: a typed content package for the homebrew store (Pydantic model,
  canonical formatter, `store check` in pre-commit and CI; today 173 files use four serialization
  styles and a dozen invariants live only in memory), the scoring engine with one `Scorer` (two
  engines disagree on 21 of 173 spells today), and the book as its own app. Publishing a store edit
  becomes one recipe instead of an 8-step memory note. ASY-3, ASY-4, ASY-6, ASY-8, ASY-11, ASY-12,
  ASY-17, ASY-18, ASY-19, ASY-20.
- **portal**: `handlers.ts` (2,579 lines, organized by delivery slice) split by domain, with a `pf2e/`
  layer that makes "read from the source or from the live document" explicit. SVC-8, SVC-14.
- **Frontends**: akasha's 1.0 MB entry chunk carries every wiki body, and each mouthpiece episode page
  downloads every transcript; generated data becomes server-only behind server functions, with a
  bundle-size budget. akasha is a multi-page site inside an SPA framework; choose one model. strider's
  `HexMap` is a 992-line function with a second near-copy for the editor. Two design systems share
  token names with opposite meanings (`--color-void` is near-black in gothic and parchment-cream in
  codex and menhir); one token source generates both themes and the pixi and GLSL palettes. Hashed
  assets are served with `max-age=0`. FE-2, FE-6, FE-13, FE-15, FE-16, FE-17, FE-19, FE-20, FE-28.
- **weal engine**: five program representations, including a 370-line mirror that re-attaches spans
  by best effort; builtins in four or five string tables; the compile pipeline copied five times;
  no generative tests (a small typed-program generator would have found the nullary-function bug).
  WEAL-7, WEAL-8, WEAL-9, WEAL-10, WEAL-20, WEAL-21, WEAL-22, WEAL-27.
- **Services**: menhir keeps two sources of truth for a question deadline; four different clock
  seams and a copied backoff; orator's store issues up to 500 queries per page. SVC-10, SVC-16,
  SVC-17.
- **Size budgets.** 17 production files exceed 1,000 lines and 117 functions exceed 80 lines; adopt
  max-lines, max-function-length and complexity rules as warnings with a baseline. SMELL-5.

### O. The way we work: the knowledge system and the agent process

- **Shrink the always-loaded memory.** `MEMORY.md` is 99.6 KB (about 25,000 tokens) and is imported
  into every session and subagent; this audit alone paid it 13 times. 91% is subsystem changelog; one
  entry is 21 KB. Cap the index at about 4 KB, 30 entries, one line each with a "read when"
  trigger; move each subsystem's current facts into that app's README or `CLAUDE.md`, which load only
  when working there; add a size check. PROC-1, PROC-15.
- **Correct what is false today.** The index still says Chuul Hunt is the main campaign (flipped back
  2026-08-13), describes heartwood 0020 as current, tells agents to stop the timer around commits
  (fixed 2026-10-10), gives bun and biome instructions (retired in July), and describes a Postgres
  workaround the code no longer uses. Ten wikilinks point to files that do not exist. Rule: a memory
  entry describes the current state, is edited in place, and is archived in the same commit that makes
  it historical. PROC-2, SVC-26, WEAL-28.
- **Replace RESUME with a small "now" file.** `RESUME.md` is 235 KB, its current-state section stops
  at 2026-08-09, it lists the retired CI commands, and the `load` skill reads it first. Archive it; a
  `docs/now.md` of at most 2 KB holds what is in flight, what is blocked, and the next action.
  PROC-4, PROC-24.
- **A real backlog.** Open bugs, stakeholder gates and security follow-ups live only in prose: codex
  "gate H" has been open since 2026-07-14, weal gates D to F since 2026-08-09, two key rotations and
  the exposed DNS token were never tracked. Use GitHub Issues or one `docs/backlog.md`; every
  stakeholder gate gets an owner, a checklist and a date. PROC-11, PROC-21, CDX-27, ASY-25.
- **Guardrails as settings, not prose.** The repo has no `.claude/settings.json`; subagents ran
  `git stash` in the main tree despite bans at least three times, and one restarted a timer
  unprompted. Commit deny rules for the commands that caused incidents, plus a short standard
  subagent brief. PROC-6.
- **Document the real process, in tiers.** `CLAUDE.md` mandates `octo:spec` and `octo:embrace`,
  which 19 of the last 20 specs did not use, and omits the step that actually earns its keep (the
  adversarial review before building). Codex wrote 600 KB of specs for 15 rounds in eight days, while
  the 2.8 KB ledger spec was fine. Define Tier 0 (a commit), Tier 1 (a one-page change note plus one
  review) and Tier 2 (scope, spec, adversarial review, stakeholder gate) with written triggers, and a
  spec size budget. PROC-7, PROC-20.
- **One home per fact.** The same rules appear in `CLAUDE.md`, `CONTRIBUTING.md`, RESUME, both skills
  and memory, and the copies disagree. Stale entry docs: `README.md` still says bun and "Phase 0";
  `ASTRA.md` omits 14 subsystems; the `CLAUDE.md` layout lists 3 Python libraries where 7 exist;
  cross-cutting lessons such as `lazyCounter` live only in subsystem memory. Documentation is 31% of
  all commits, and 169 commits rewrote `MEMORY.md`. PROC-10, PROC-12, PROC-13, PROC-17.
- **Fix the shell layer under "verify".** The RTK hook silently rewrites and truncates `grep`, `ls`,
  `diff`, `wc` and `git log` output; several research lanes saw wrong results during this audit.
  Exclude the commands used for load-bearing checks (a user-level setting). PROC-14.
- **Reorganize `thoughts/`.** Living docs go in `docs/`, history in `archive/` (never auto-loaded);
  numbers become change numbers, not subsystem numbers; campaign content (`menagerie-puzzles.md`,
  `sheets/`, `plans/weal_v2.md`) leaves the code root. PROC-19, REPO-23.
- **Write to the plain-language standard** in every living doc; leave archived docs alone. PROC-22.
- **Stop building bespoke review sites.** heartwood and assay each built and then abandoned a public
  review server. Use Artifacts or one authenticated, telemetered review pattern. ASY cross-note.
- **Rewrite the session skills** around `docs/now.md`, the backlog, the target app's docs and the CI
  status, at about a 10,000-token budget; move the `foundry-pc-sheet` skill into the repo. PROC-24.

### P. Security debt beyond the act-now list

- Internet-facing processes (Caddy, scriptorium) run as the admin user, who owns the age key; Caddy
  serves a directory the pipeline containers can write, so a planted symlink could expose the age
  key. Run Caddy as its own user, serve a copy, move the age key, exclude `deploy/sops` from build
  contexts. SEC-5.
- The portal bridge key lives in Foundry world settings, which players can very likely read, and the
  server hands the bridge to whichever socket authenticated last. Move the key to the headless
  client's own storage; refuse replacement of a healthy socket. SEC-8.
- The Portal GM account password is 7 characters (its length is visible from the public SOPS file).
  SEC-9.
- The internal network is flat: every container shares one network with an unauthenticated
  ClickHouse and the Dagster code server. Split networks. SEC-13.
- Edge and input gaps: no request-body limits; `local_only` admits the whole LAN, including hairpin
  traffic from the router; vellum-render's per-IP limit is one global bucket behind Caddy; no
  Content-Security-Policy; strider's editor write function is public (and cannot work in
  production anyway). SEC-14, FE-21, SVC-21.
- Portal auth details: the permanent admin bearer doubles as the consent password, consent attempts
  are unlimited, and OAuth refresh tokens and clients never expire. SEC-15, SVC-23.
- Hygiene: the alert webhook appears in `curl`'s argv; every Dagster service receives every LLM key;
  the resolver decrypts the whole SOPS file to read one key; there is one age recipient and no backup
  recipient. SEC-16.
- assay uses `eval` with empty builtins on Foundry rule expressions; replace it with an AST evaluator.
  ASY-22.

### Product bugs found along the way

Fix these regardless of the restructure.

- **weal:** nullary functions never run their body, so `let f() = 2d20kh1; f()` errors and
  `let f() = d6e1; f()` returns nothing at all (WEAL-1); one bad save breaks every roll (WEAL-2); roll
  history is written before the reply, so a database problem silences the bot (WEAL-11); parse depth
  is limited only by Discord's message length (WEAL-21); pasting the bot's own save confirmation back
  fails silently (WEAL-29).
- **codex:** a `useState` after early returns in `FacetPanel.tsx:150` (SMELL-4); a client cache that
  keeps rejected promises forever (CDX-12); broken references have never been styled because the CSS
  selector never matches (CDX-23).
- **Pipeline:** a second recording on the same date is ignored; empty transcripts are committed as
  successes (PIPE-12); the pronunciation lexicon is never loaded, so the IPA step never runs in
  production (PIPE-14).
- **Frontends:** hashed assets revalidate on every load (FE-15); dev mode does not regenerate content
  when its real inputs change (FE-10); animated backdrops ignore reduced motion (FE-17); strider's
  production editor saves vanish on recreate (FE-21); weal-overlay's dev proxy points at strider
  (FE-26).
- **Services:** yt-dlp errors are discarded and child processes have no timeout (SVC-15); replacing a
  bridge socket strands in-flight queries for 15 seconds (SVC-18); a non-numeric query parameter sends
  `NaN` to Postgres (SVC-19).
- **assay:** `assay fit` wipes the parameters other commands need; a plain `seed-homebrew` would bring
  back 9 deleted or renamed spells, one of which aborts the codex transform (ASY-5); snapshot selection
  sorts versions as strings (ASY-21).
- **Ops:** `akasha-seed` recreated the deleted faerrin tree as root (OPS-14); `config.kdl` references a
  SOPS key that does not exist (OPS-5).

## 4. Target state

What "gold standard" means here, concretely:

- **Layout.** Membership follows from where a file lives; no exclude lists. Each domain has one home
  with a current README and, where agents have traps, a short `CLAUDE.md`. Source directories hold
  only source.
- **Deploy and data.** Production builds an immutable, labeled git SHA from a separate checkout with
  one `deploy` command. Runtime data lives under one data root, outside images and outside the code
  repo, and is backed up nightly off-host with a tested restore. Secrets fail closed, are file-based
  in containers, and are rotated whenever they leak.
- **Pipeline.** One Dagster graph with one session partition set, real dependencies, declarative
  automation, resources, blocking asset checks and a run-failure alert. heartwood runs inside it.
  Paid stages are resumable.
- **Contracts.** Each cross-language or cross-process contract has one source and generated or
  imported bindings: config, ontology, portal tools and protocol, orator API, weal wire, Rust-to-TS
  JSON.
- **Kits.** New frontends and services start from `@astra/site-kit` presets and a service kit, via a
  scaffolder. Telemetry is installed by one bootstrap with HTTP instrumentation. The LLM library owns
  keys, profiles, one retry budget and one cost meter.
- **Quality gates.** Main is green and protected by one `ci-ok` check; a red main posts to Discord.
  Path filters cover every directory. Rust, infra and browser lanes exist. Typecheck covers every
  tracked TS file. Lint has no path exemptions, and ratchets stop the baseline numbers from rising.
  `just ci` reproduces CI exactly. Tests never read production data or production SigNoz.
- **Observability.** Every failure is either handled with a recorded reason or surfaces; alerts cover
  certificates, container health, the Dagster daemon and pipeline freshness; span names are low
  cardinality; a live smoke check probes every public host.
- **Docs and process.** A short `CLAUDE.md` of rules and pointers; `docs/` with architecture
  (including a diagram and a generated service table), development, process tiers, `now`, backlog,
  ADRs and a runbook; per-app READMEs; a small memory index with a size check; an `archive/` that
  nothing loads. Guardrails live in committed settings and hooks. Comments describe the present.

## 5. Proposed plan

Phase boundaries follow dependencies, not effort. Phase 2 tracks can run in parallel worktrees using
the existing parallel-track pattern (`thoughts/archive/memory/parallel-worktree-tracks.md`).

### Phase 0: stop the bleeding (about 3 days)

1. Security hotfixes from section 2, items 1 to 8 (portal handler registry, Cloudflare token and admin
   socket, loopback port bindings and real Postgres passwords, fail-closed secrets, scriptorium
   teardown after archiving its state, key rotation, OTLP ingest filter, dependency upgrade pass).
   Several **need Josh** (sudo, Foundry, stakeholder confirmation); flag each live step at the time.
2. Green CI and make red visible: the three fixes, `ci-ok`, the Discord notifier, no-bail tests, the
   path-filter gaps, commitlint on push.
3. Pipeline run-failure sensor.
4. `.dockerignore` allowlist, then one prune of dangling images and build cache.
5. Backups: nightly `pg_dump` of the three databases plus the state directories, a second age
   recipient or an offline copy of the age key, SigNoz rules exported to git, `[confirm]` on
   `down-volumes`.
6. weal bot-side save guard.
7. Correct the false memory lines and the `deploy/README.md` trap; commit `.claude/settings.json`
   deny rules.

### Phase 1: foundations (about 1 week)

1. **Deploy checkout and one `deploy` command** with lock, secret injection, SHA labels, and a
   dirty-tree refusal. Move timers and the heartwood runner to it.
2. **One data root,** and pipeline output out of git (decision "Pipeline data home"). This removes
   the linguist-commit timer's commit-and-push job and every workaround tied to it. Must precede any
   layout move.
3. **Developer entry point:** `just bootstrap/check/fix/test/ci/dev`, `mise.toml`,
   `.python-version`, pytest `importlib` mode.
4. **Gate tightening:** `erasableSyntaxOnly`; tsconfigs include scripts and server entries; the
   immediate ruff and oxlint rule sets; `dagster/` and `deploy/` under ruff and ty; path overrides
   become inline disables; ratchets recorded.
5. **Docs skeleton:** `docs/` tree, the ADR seed set (gather the binding decisions from each area),
   the backlog seeded from every open item in memory, RESUME, specs and section 2 of this doc,
   `docs/now.md`, the process tiers, a rewritten `CLAUDE.md`, the memory size check.

### Phase 2: structural refactors (about 2 to 3 weeks, parallel tracks)

- **Repo track:** layout move (after Phase 1 item 2), one parameterized Dockerfile with `pnpm fetch`
  and `pnpm deploy`, compose anchors, config mounted, dependency catalogs.
- **Libraries track:** config single source (interim namespace ownership, then codegen),
  `SecretRef.require/optional`, LLM client owns keys, profiles, one retry budget and one meter;
  observe bootstrap with HTTP instrumentation, logger, `reportIgnored`, in-memory test exporters,
  environment tag; shared KDL decoder; ontology regen recipe; dead config deleted.
- **Kits track:** site-kit preset and `just new-frontend`; service kit; bundled server entries, then
  delete the custom loader; `/healthz` and route-template span names.
- **Pipeline track:** one graph, resources, asset checks, sessions library, resumable paid stages,
  heartwood in-container with one host publisher, rclone sensor replacing the FUSE mount, deploy
  guard for in-flight runs.
- **codex track:** corpus-root injection, fail-closed production, immutable releases, regenerable
  fixture, three-package split, pass registry, Playwright Test lane, popover and listing redesign.
- **assay track:** closure decision first; store schema, formatter and check; product split; books
  out of codex; PDF out of git.
- **Services track:** portal tool registry, versioned protocol with ack, server-side designation,
  `handlers.ts` split with typed pf2e accessors; Postgres migration runner and CI integration tests
  for orator and weal.
- **weal track:** nullary-function semantics, skip-bad-saves, an `internal` error stage, wrapper-owned
  trap containment, path remapping, Rust CI lane, generative tests; then the structural engine work.
- **Ops track:** ops CLI and thin justfile; edge in the repo with an xcaddy recipe; `just doctor`;
  rules-as-code alerting; live smoke timer; Renovate; image layer order.

### Phase 3: polish and ratchets (about 1 week, can trail)

Per-area comment sweeps (after each area's refactor), behavior-named tests, README rewrites, memory
triage into app docs and the archive, the remaining dead-code deletions, the frontend items (server-
only data, token unification, CSS consolidation, RUM, visual tool), and CI ratchets on every number
in section 8.

### Definition of done for the cycle

- Main is green and protected by `ci-ok` (a red change is blocked, not announced: ADR 0012).
- No hand-maintained registration list remains (uv excludes, Dockerfile manifest lines, the Dagster
  asset list).
- No frontend or service shell file exists as a per-app copy.
- Backups run nightly and a restore has been tested (secrets are not rotated: ADR 0041).
- No bot commits to the code repo.
- `MEMORY.md` is under its size budget; every app has a current README.
- The scoreboard in section 8 is re-measured, and CI ratchets prevent regression.

## 6. Decisions for Josh

Each decision has a recommendation. The first four shape Phase 1 and should be settled before the
spec.

1. **Repo layout.** Option A: by language (`py/`, `ts/`, `rust/`), which makes every tool boundary
   trivial. Option B: by domain with language subfolders (`apps/mouthpiece/{pipeline,web}`), which
   keeps a subsystem in one place, as portal already does; uv accepts `apps/*/py` globs. The move
   touches about 811 path references either way. **Recommendation: B.** People and agents work by
   domain, and per-domain `CLAUDE.md` files load where the work happens. Do it after the data leaves
   `apps/`.
2. **Pipeline data home.** Option A: `artifacts/` plus nightly backup, no git history of transcripts.
   Option B: a separate `astra-data` repo written by a bot. **Recommendation: A**, unless transcript
   diffs in git are actually used.
3. **Merge model.** Stay trunk-based with direct pushes, or move to short-lived branches with
   `gh pr merge --auto` and branch protection on `ci-ok`. **Recommendation:** pull requests with
   auto-merge, once bots no longer commit to the code repo.
4. **Repo visibility.** The repo is public and contains player transcripts, players' Discord IDs,
   personal-use fonts and memory notes that describe security gaps. Option A: make it private now
   (cheap and immediate; GitHub Actions minutes are ample at this volume). Option B: stay public and
   scrub (move transcripts and fonts out, write security notes privately). **Recommendation: A**, then
   revisit after the paydown. Rewriting history to drop the 40 MB of book binaries is optional
   either way; **recommendation:** do not rewrite, just stop the growth.
5. **Rust CI lane.** This reverses the 0032 "no Rust CI lane" charter. **Recommendation:** add a
   path-filtered lane plus a cheap source-hash check, and keep Rust confined to the one crate.
6. **Product closures** (one conversation): what "done" means for assay; the hidden codex assay block
   (delete or turn into a config flag); `correction_candidates` (delete or wire up a review digest);
   the Cartesia and Anthropic fallbacks (delete); the mouthpiece experiment harness and roundtable
   special (move to a tools package); strider's editor (dev-only); the weal `dice` history (build a
   consumer or keep it as an archive); the codex "forever" URL aliases (set a removal date).
7. **Process.** Adopt the three change tiers and the `docs/` layout; settle one rule for when to use
   `AskUserQuestion` (the assay stakeholder rejected it for card-dealing, while a feedback memory
   recommends batching up to four questions); exclude load-bearing commands from the RTK hook (a
   user-level setting).
8. **Toolchain details.** Keep or replace vp; Python 3.12 everywhere or 3.14 everywhere
   (**recommendation:** 3.12 now, upgrade deliberately); the Docker run launcher for Dagster.
9. **Frontend direction.** Move akasha to real SPA navigation with server functions, and unify the
   design tokens across gothic, codex and menhir. Both need the codex owner's and the stakeholders'
   agreement on visual change.

## 7. What to keep (make these the repo-wide standard)

- **Pure core, thin wrapper.** Logic in pure, injected-seam functions; Dagster assets, server
  functions and handlers stay thin (scribe sensor, heartwood requests, mouthpiece producer stage,
  codex `entityPageData`, the portal `BridgeClient` and headless `Supervisor`).
- **Validate at the edge, trust inside.** codex validates its corpus with Zod once at emit and trusts
  it at read; the portal wire package parses every message at both ends with a closed error enum.
- **Total renderers.** codex renders a closed node union with a total switch and no raw HTML.
- **Determinism as a contract.** The codex transform runs twice and compares bytes; the weal wasm
  build hard-checks its tool versions and is byte-reproducible; canonical JSON is sorted with a
  trailing newline.
- **Reference oracles and cross-language corpora.** weal's icepool oracle; the shared vellum
  conformance corpus; `being.canonical.json` parity; the akasha snapshot freshness gate.
- **Real-protocol integration tests.** portal's MCP tests drive a real MCP client over HTTP against a
  fake module over a real WebSocket.
- **Injected seams instead of mocks.** Four `vi.mock` calls repo-wide; scribe's `dg.materialize`
  tests; menhir's injected test clock.
- **Fail loud, never fall back silently** (portal's `requireSecret`, mouthpiece's `_required_key`,
  non-retryable TTS 4xx), and the fail-loud LLM guards in `LiteLLMClient`.
- **Lazy, leak-proof `SecretRef`;** SOPS with a deny-by-default ignore; `just up`'s in-memory secret
  injection; no secret in any image; a clean git history of credentials.
- **Run-as-1000 containers with one bind-mount root;** the codex runtime-mount model (publish by
  restart, not rebuild).
- **Fast, check-only static gates** (the whole pre-commit hook runs in 3.4 seconds) and exact pins with
  hard verification.
- **Structural fixes over prose** where they already happened: `git commit --only`, the publish lock,
  `lazyCounter`.
- **Good commit bodies and session trailers;** the adversarial review before building, for changes
  that warrant it; scope documents that verify claims against the real repo.
- **Good local docs to copy:** `apps/strider/web/content/layers/CLAUDE.md`,
  `libs/rust/weal-engine/README.md`, `apps/menhir/web/README.md`.

## 8. Baseline scoreboard

Measured on 2026-10-22 by the census lane (`artifacts/research/techdebt-0037/census/`). Re-measure at
the end of the cycle and ratchet these in CI.

| Measure | Production | Tests |
|---|---|---|
| Comment lines citing spec, decision, slice or gate IDs | 2,828 | 552 (+237 in scripts) |
| Files with more comment lines than code | 42 | — |
| Comment blocks of 10+ lines | 507 | 40 |
| TS catch blocks that drop the error / no-op `.catch()` | 82 / 26 | 2 / 0 |
| Python silent broad excepts | 9 | — |
| TS unsafe type assertions (type-aware oxlint) | 872 | — |
| TS non-null assertions / explicit `any` | 98 / 21 | 37 / 0 |
| Python `Any` references | 343 | 150 |
| Files over 1,000 lines / over 500 | 17 / 48 | 6 / 28 |
| Functions over 80 lines / complexity over 15 | 117 / 106 | 96 / 3 |
| Duplicated lines (jscpd 10 lines / 80 tokens) | 2,276 (1.4%) | included |
| Unused exports + exported types (knip) | 312 | — |
| Env reads outside the config and observe libraries | 22 | 4 |
| `console.*` in production TS / `print()` in non-CLI Python | 40 / 19 | — |
| oxlint path-exemption globs / rules off repo-wide | 49 (3 dead) / 18 | — |
| ruff `ALL` headroom (non-cosmetic) | 604 | 711 |
| Tracked TS files outside every tsconfig | 50 files, 3,455 lines | — |
| Dockerfile manifest-ripple lines | 238 | — |
| Hand-maintained registration lists | uv excludes (14), Dockerfile manifests (14 files), Dagster asset list (17) | — |
| `MEMORY.md` size / `RESUME.md` size | 99.6 KB / 235 KB | — |
| Bot commits in history | about 143 (12.5%) | — |
| CI runs in the last 200 that failed | 94 | — |
| Already zero (keep at zero with a lint rule) | TODO/FIXME, `@ts-ignore`, bare `except:`, Rust `unwrap()` in the library, module-scope TS metric instruments, commented-out code (1 line) | — |

## 9. Method and evidence index

Thirteen research agents worked in parallel on 2026-10-22, each read-only (no repo writes, no git
writes, no deploy or paid actions) and each instructed to verify every claim against the code, git
history, the running host or SigNoz. Several lanes measured beyond reading: the repo lane ran every
static CI check and timed it; the weal lane rebuilt the wasm and ran the full Rust gate; the census
lane ran ruff, oxlint, clippy, jscpd, knip, vulture and lizard; the services lane read the Foundry 13
client source; the security lane scanned the full git history for credentials (none found). The
CI-red claim and the headline numbers in sections 1 and 2 were re-checked in the orchestrating
session.

| Prefix | Area | Findings | Lane file |
|---|---|---|---|
| CDX | apps/codex/web | 30 | `lanes/cdx.md` |
| ASY | apps/assay/py, the books, scriptorium | 25 | `lanes/asy.md` |
| PIPE | Python pipeline apps and Dagster | 24 | `lanes/pipe.md` |
| LIB | Shared libraries and ontology (py and ts) | 22 | `lanes/lib.md` |
| FE | TanStack frontends and UI libraries | 28 | `lanes/fe.md` |
| SVC | TS services (portal, orator, vellum-render, menhir server) | 28 | `lanes/svc.md` |
| WEAL | weal stack and the Rust crate | 29 | `lanes/weal.md` |
| OPS | Deploy, infrastructure and operations | 28 | `lanes/ops.md` |
| REPO | Repo structure, toolchains, CI, data in git | 26 | `lanes/repo.md` |
| PROC | Process, docs and the AI-assisted way of working | 25 | `lanes/proc.md` |
| SMELL | Repo-wide smell census and lint baseline | 12 | `lanes/smell.md` |
| TEST | Test strategy and quality | 26 | `lanes/test.md` |
| SEC | Security and secrets | 18 | `lanes/sec.md` |

All lane files are under `artifacts/research/techdebt-0037/`. Each one has an area summary, ranked
findings with evidence, a "Keep" list and cross-area notes. The lane IDs in this document are for
navigating the evidence only; do not cite them in code comments.

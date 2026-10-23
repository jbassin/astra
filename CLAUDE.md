# CLAUDE.md

astra is the campaign's live stack: a monorepo of Python (uv) for the data and LLM pipeline,
TypeScript (pnpm) for the web servers and frontends, and one Rust crate (`libs/rust/weal-engine`),
shipped as committed wasm. This file holds the rules; the detail lives in the docs it points to.

## Read first

- [`docs/now.md`](./docs/now.md): what is in flight and the next action.
- [`docs/backlog.md`](./docs/backlog.md): open items and stakeholder gates.
- [`docs/architecture.md`](./docs/architecture.md): what runs where.
- [`docs/development.md`](./docs/development.md): setup, `just` commands, toolchains, conventions, traps.
- [`docs/runbook.md`](./docs/runbook.md): recovery procedures.
- [`docs/adr/`](./docs/adr/README.md): binding decisions and accepted security risks. Check it
  before re-raising a settled question or reporting a security finding.
- The target app's `README.md`: its operations and traps.
- [`ASTRA.md`](./ASTRA.md): the product vision.

## Memory

Project memory lives in this repo, never in `~/.claude`. The index is auto-loaded:

@thoughts/shared/memory/MEMORY.md

- A memory file holds one rule or fact that no app README or doc owns (harness format: frontmatter,
  then body), with one line in `MEMORY.md` that says when to read it. `just docs-check` fails when
  the index passes 4 KB or 30 entries, or links to a missing file.
- App facts go in the app's README; repo-wide facts in `docs/`. History goes to
  `thoughts/archive/` (moved with `git mv`, never edited, never auto-loaded).

## How work gets done

Plan in the conversation, ship in small slices, and let CI be the gate. Don't use `octo:*` skills,
and don't write scope, spec or research documents or decision IDs by default.

1. **Plan.** Agree on the plan in the conversation. Check every claim against the real repo before
   planning on it: read the code, load the config, run the command. Don't list questions you could
   answer now. Write a document only when the work spans sessions: one file with the plan and a
   checklist, kept current as slices land (the model is section 0.1 of
   `thoughts/shared/research/2026-10-22-techdebt-paydown-0037-thoughts.md`).
2. **Ask only for real decisions.** Product, cost and stakeholder calls belong to Josh. Use the
   question tool for short choices and plain text when the choice needs context. Everything else, decide
   and say what you decided.
3. **Slice.** A slice is one coherent change that leaves `main` green. Build the agreed scope in full;
   if part of it won't fit, say so and ask rather than dropping it quietly. Copy the nearest existing
   astra pattern rather than inventing a new one.
4. **Delegate.** For work with more than one slice, the main session orchestrates and agents implement.
   - Give each independent slice its own agent in its own git worktree. The pre-commit hook checks
     only staged files, but agents sharing a tree still collide on the index and on each other's
     work in progress.
   - The brief states the goal, what is already ruled out, the files the agent owns, how to verify, and
     the hard rules: no git outside its worktree, no `git stash`, no push, no deploy. The agent reports
     its branch, commit, verification evidence and anything surprising.
   - No checkout holds runtime data: it all lives under `/ruby/data/astra-state` (`config.kdl`
     `data.root`: recordings, episodes, corpora, audio, the astra-data clone). Point agents at those
     paths, read-only, when they need it.
   - Review each diff, then push the agent's branch and open its pull request from the main session
     (see step 6). Branches don't need to be current with `main`, so each pull request checks its own
     slice; the `main` run after each merge checks the combination. If that run goes red, fix it
     before merging anything else.
   - Run live steps from the main session. The auto-mode classifier blocks subagents from deploying.
5. **Review where the risk is.** Security and auth changes, data migrations, and anything that replaces
   live content get an independent review before merge. Give the reviewer the code and the goal, not
   your conclusion. Everything else relies on tests and CI.
6. **Gate every commit, and merge through pull requests.** Run `just ci` (or at least the touched
   lanes' `just <job>` recipes) before committing, and never commit a red lane; the pre-push hook
   runs `just ci`. `main` accepts changes only through pull requests that pass `ci-ok`
   ([ADR 0016](./docs/adr/0016-merge-model-auto-merge.md)). Work on a short-lived branch, push it,
   then `gh pr create --fill` and `gh pr merge --auto --rebase`; GitHub merges when `ci-ok` passes
   and deletes the branch. Don't build up unmerged work. Don't poll: check the pull request once,
   and if CI fails, fix the branch and push again. Admins can bypass the gate only by merging a pull
   request (`gh pr merge --admin`), and only in a real emergency.
   The bots (`linguist-commit`, heartwood) commit and push only the separate `astra-data` repo (the
   pipeline's published output and the wiki, live clone `/ruby/data/astra-state/astra-data`); they
   never run git in this repo.
7. **Live steps.** Routine live infrastructure work that carries out an agreed plan needs no approval:
   `just up`, edge edits with `just caddy-reload`, installing or removing systemd units, image rebuilds,
   pruning dangling images and build cache, and pushing and merging green pull requests. State each step in one line as you
   run it. Before rebuilding Dagster, check for in-flight runs. Spending money or replacing published
   content (TTS renders, episodes, snapshots) gets an explicit flag first. Irreversible data loss
   (dropping a volume or database, `prune -a` on the shared Docker daemon) needs an explicit yes.
8. **Wrap up.** Tick the plan's checklist, update `docs/now.md` and `docs/backlog.md`, record
   load-bearing gotchas where they belong (the app's README, `docs/`, or memory; edit entries in place:
   a doc describes the current state), then merge it through a pull request.

## Version control

Plain git on GitHub with Conventional Commits (`type(scope): subject`, lower-case subject, body
lines of at most 100 characters). Pull requests merge by rebase only, so each commit lands on `main`
as written, but with a new SHA: after a merge, `git switch main && git pull --ff-only` and delete
the local branch with `git branch -D`. The pre-commit hook format- and lint-checks staged files; the
pre-push hook runs `just ci`. Lint exceptions go inline with a reason. Bypass a hook only in a real
emergency with `--no-verify`.

## Standing principles

1. **Telemetry from day one.** Every app wires traces, metrics and logs to SigNoz in the process that
   runs it (`libs/{py,ts}/observe`); TS metrics use `lazyCounter`/`lazyHistogram`.
2. **Config single source.** All config lives in `ontology/ontology-config/config.kdl`, read through
   `astra_config` / `@astra/config`. Secrets are `ref="sops:KEY"` pointers; nothing plaintext in git.
3. **KDL at the edges.** Parse KDL and validate into Pydantic or Zod immediately.
4. **All LLM calls** go through `libs/py/llm`; never call a provider SDK directly.
5. **Frontends follow strider**: build-time content, generated modules, route loaders, served as SSR
   Compose services behind Caddy.
6. **Preserve identity keys.** `player_id` integers are foreign keys; carry them verbatim.
7. **Runtime data never lives in a checkout.** It lives under `/ruby/data/astra-state`; published
   datasets live in the `astra-data` repo; production builds only from `/ruby/data/astra-deploy` via
   `just deploy`.

## Commands

`just bootstrap` (fresh clone), `just check`, `just fix`, `just test`, `just ci` (everything CI runs),
`just dev <app>`, `just deploy [service...]`. Details in
[`docs/development.md`](./docs/development.md) and [`deploy/README.md`](./deploy/README.md).

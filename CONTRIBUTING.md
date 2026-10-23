# Contributing to astra

Set up with two commands, check your work with `just ci`, and ship through `just deploy`. Everything
else lives in one place each:

| You need | Read |
|---|---|
| Setup, commands, toolchains, conventions, adding an app, traps | [`docs/development.md`](docs/development.md) |
| How work is planned, sliced, reviewed and shipped | [`CLAUDE.md`](CLAUDE.md), "How work gets done" |
| What runs where | [`docs/architecture.md`](docs/architecture.md) |
| What is in flight and what is open | [`docs/now.md`](docs/now.md), [`docs/backlog.md`](docs/backlog.md) |
| Why a decision was made | [`docs/adr/`](docs/adr/README.md) |
| How to recover something | [`docs/runbook.md`](docs/runbook.md) |
| How an app works and its traps | that app's `README.md` |

## Quickstart

```sh
mise trust && mise install   # host tools; then activate mise in your shell
just bootstrap               # both workspaces, the git hooks, the codex guards' Chromium
just ci                      # everything CI runs
```

## The short rules

- Commit messages follow Conventional Commits; the hooks check format and lint on commit and run
  `just ci` on push.
- Never commit a red lane. Commit each green slice on a short-lived branch.
- `main` takes changes only through pull requests that pass `ci-ok`: push the branch, then
  `gh pr create --fill && gh pr merge --auto --rebase`.
- Local edits never ship: merge, then `just deploy [service...]` from the deploy checkout.
- Config lives in `ontology/ontology-config/config.kdl`; secrets are SOPS references.
- Every app wires telemetry to SigNoz in the process that runs it.

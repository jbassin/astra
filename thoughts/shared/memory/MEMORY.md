Start with `docs/now.md` and `docs/backlog.md`; app facts are in each app's README. Rules below.

- [No broken commits](no-broken-commits.md) — read before any commit or push: get touched lanes green (`just ci`); block, don't alert.
- [Keep docs current](keep-docs-current.md) — read after any merge, deploy or decision: update now.md and the backlog then, not at wrap-up.
- [No CI monitoring](no-ci-monitoring.md) — read after opening a pull request: auto-merge waits; check once, never poll.
- [Lighter process, no octo](lighter-process-no-octo.md) — read when planning: no octo skills, no spec ritual; CLAUDE.md is the process.
- [Ask real decisions early](resolve-open-questions-before-next-stage.md) — read when a product/cost call comes up: ask before building on it.
- [No silent scope cuts](no-silent-scope-cuts.md) — read when work outgrows your budget: surface the trade-off, never cut quietly.
- [Verify before acting](verify-before-acting.md) — read before writing new logic or trusting odd output: find prior art, check twice.
- [Live infra authorized](live-infra-changes-authorized.md) — read before a live step: routine deploys and units need a one-line note, not a yes.
- [Check script before audio](check-script-before-audio.md) — read before testing script changes: generate the script alone, check it, get a yes, then render.
- [Flag paid/live actions](flag-paid-live-actions.md) — read before spending money or replacing published content: flag it first.
- [Deploy with just](deploy-apply-with-just.md) — read after changing deploy, edge or app code: commit, push, `just deploy`, verify.
- [Config single source](config-single-source.md) — read when touching any config value: config.kdl plus the schemas that read it.
- [Telemetry built in](telemetry-built-in.md) — read when adding an app, asset or metric: wire it where it runs; TS uses lazyCounter.
- [SigNoz MCP](signoz-mcp.md) — read for any observability question: use the signoz_* tools, not curl.
- [Verify rules against corpus](verify-rules-against-corpus.md) — read before any PF2e rules claim: grep the codex corpus and quote it.
- [Frontend work](tanstack-start-skill.md) — read when touching a TanStack Start frontend: site-kit and gothic READMEs, bundled skills.
- [Book fonts licensed](book-fonts-licensed.md) — read before flagging any font or book-distribution risk: licensed, cleared, never ask.

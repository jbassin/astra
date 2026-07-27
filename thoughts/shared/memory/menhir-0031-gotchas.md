---
name: menhir-0031-gotchas
description: menhir (0031) Kahoot-style quiz — BUILT+DEPLOYED+LIVE 2026-07-27; realtime/deploy gotchas (timer-disarm class, no TS HTTP auto-instrumentation, uv exclude, identical-path mounts)
metadata:
  type: project
---

PROJECT 2026-07-27 **COMPLETE — scope → spec → adversarial ×2 → S1/S2/S2b/S3 → LIVE on
menhir.iridi.cc in ONE session** (`e71fffd` spec · `17bae8f` S1 · `5b0568d` S2 · `ad17173` S2b ·
`7bc3017` S3). A Kahoot clone for session-opener quizzes: host screen + phone players (QR join),
SSE snapshots down / POST up, committed KDL quizzes, ephemeral rooms + results JSONL, no auth
(per-game hostToken guards host actions). Spec `thoughts/astra/specs/0031-menhir-spec.md`
(D31-1..12 + §7 build record), port 10375, template = weal-overlay.

**⭐ The load-bearing finds:**

- **TS services have NO HTTP auto-instrumentation** — `@astra/observe` registers no
  instrumentations; spans exist ONLY where code calls `tracer.startActiveSpan` (weal-overlay's
  `overlay.ingest` is the idiom). Symptom: lazyCounter metrics flow while traces are ZERO — looks
  like a pipeline break, is a code gap. S1 shipped counters-only; spans added at S3
  (`menhir.{create,join,answer,host_action}`).
- **The timer-disarm class (S2b designer caught it, tests didn't):** rooms.ts clears the room
  timer before EVERY reduction and only re-arms from `schedule` effects — but only question-open
  emits one, so any mid-question answer/join/connect permanently disarmed the countdown. Fix:
  re-arm the outstanding deadline post-reduction when still in `question`. Lesson: **pure-reducer
  tests cannot see runtime timer policy** — the rooms runtime needs its own tests (injected
  TestClock, `clock.pending.length` assertions; `test/rooms.test.ts`).
- **uv workspace: a TS-only `apps/*` member hard-errors the WHOLE uv lane** unless added to
  `pyproject.toml [tool.uv.workspace] exclude` (the glob matches every dir; the "no pyproject →
  uv never sees it" assumption is FALSE). Do it the moment the dir exists.
- **config strictness is dual-lane:** both schemas reject unknown keys and py `Config` is
  `extra="forbid"` at the TOP level — a new config.kdl block without its Pydantic mirror reds
  `uv run pytest`/`ty`/Dagster even for a TS-only app. Mirror + value-assert tests in BOTH config
  test files, same commit.
- **Container-written files = identical-path bind mounts** (host path == container path,
  host-absolute both sides; plain config fields have no env override — D29-53). `results-path`
  is one string that must be true in dev AND container.
- **Dockerfile runtime stages ship ZERO data dirs unless COPY'd** — weal-overlay's runtime
  allowlist adapted verbatim would have served an empty quiz list. Data dirs need an explicit
  runtime-stage COPY + `import.meta.dirname`-relative load.
- **Manifest ripple = 15 enumerating Dockerfiles** — 14 match `apps/*/Dockerfile` but
  `apps/portal/headless/Dockerfile` is glob-invisible; grep for a known manifest line instead of
  globbing. Prove with one sibling image build.
- **EventSource semantics:** a 404 on the SSE endpoint kills reconnection PERMANENTLY (browsers
  only retry transport failures) → unknown/GC'd rooms return 200 + a terminal `{phase:"gone"}`
  frame. And ⭐ **six EventSources in one browser tab wedge Chromium** (per-origin connection
  limit) — the S2b designer froze its own session faking players; simulate multi-client load
  OUTSIDE the browser (node bot script).
- **Design-review-as-gate works:** the opus designer pass (frontend-design skill, before/after
  screenshots, ~25 findings applied) transformed the S2 baseline AND caught the timer blocker.
  Emoji render as tofu on unknown host machines — draw SVG marks instead. Kahoot yellow on white
  text ≈ 2:1 contrast — ramp tiles darker, keep identity hue on the glyph.
- Small pins: lobby `questionIndex = -1` (absolute host-action `fromIndex` must match);
  zero-connected rooms NEVER early-close (POST-only clients aren't "connected" — curl smoke
  tests hit this by design); quiz-parse failures log WARN not ERROR (any ERROR pages Discord via
  the Class-A rule, [[astra-alerting-setup]]); redeploy ends live games (in-memory rooms,
  documented in README).

Builds on [[weal-0009-gotchas]] (template) + [[codex-0029-gotchas]] (parchment tokens, D29-53) +
[[config-single-source]] + [[telemetry-built-in]].

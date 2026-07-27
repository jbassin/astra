# 0031 — menhir: Kahoot-style session-opener quiz (spec)

**Status:** FINAL (adversarial pair 2026-07-27: realtime lens 4 blockers + 6 majors, deploy lens
3 blockers + 3 majors, all folded below; overlapping findings merged)
**Scope doc:** `thoughts/shared/research/2026-07-27-menhir-0031-thoughts.md` (R1–R5 stakeholder-resolved)
**Template subsystem:** weal-overlay (srvx/Node-24 server + vite React SPA + SSE); styling from
codex's parchment token system.

## 1. Product

Host (GM) screen-shares the **host view**; players join on phones via a QR code / 4-letter code +
display name and tap colored shape buttons. Timed MCQ, speed scoring, leaderboard between
questions, podium at the end. Ephemeral rooms; finished games append one JSONL row to a results
file. No auth (R4). Public at `menhir.iridi.cc`, noindexed.

## 2. Decisions

- **D31-1 — App shape.** New pnpm workspace member `apps/menhir`: `server.ts` entry
  (config+telemetry first, srvx `0.11.20`, serves `dist/` + API + SSE), vite-built React 19 SPA.
  `src/`: `schema.ts` (Zod: quiz, wire types, SNAPSHOT UNION — the single S1/S2 contract),
  `game.ts` (PURE reducer), `rooms.ts` (runtime: registry + timers + fan-out), `quizzes.ts`
  (KDL→Zod loader), `results.ts`, `src/server.ts` (route wiring). **⚠ uv workspace: the root
  `pyproject.toml` globs `apps/*` with an explicit `[tool.uv.workspace] exclude` list — add
  `"apps/menhir"` there IN S1, the moment the dir exists, or the whole uv lane hard-errors**
  (review blocker; the scope doc's "uv never sees it" was false and is corrected).
  Deps (pnpm strict layout — own copies): `srvx 0.11.20`, `react`/`react-dom ^19`, `zod ^4.4.3`,
  `@bgotink/kdl ^0.4.0` (runtime dep; KDL v2 — `#true` idiom), `qrcode` (client QR), `@astra/config`,
  `@astra/observe`, `@astra/site-kit`; dev: vite `8.1.3`, vitest `^4.1.9`, jsdom `^29.1.1` +
  own `vitest.config.ts` (jsdom) since weal-overlay has none, @fontsource packages (D31-6).
- **D31-2 — Transport.** SSE down (`GET /api/events/:code?role=host|player&playerId=…`), POST up.
  Frames are **role-scoped snapshots** (§4a — exact schema, S1/S2 share `schema.ts`). Heartbeat:
  **15 s** comment frame with `.unref()` (weal-overlay's actual idiom — server.ts:159; the draft's
  25 s was a false pin). Countdown sync: every frame carries `serverNow`; `question` frames carry
  `endsAt`; clients render the difference. **Unknown/GC'd room on SSE connect → `200` + terminal
  `{phase:"gone"}` frame, NEVER 404** (EventSource only auto-retries transport failures; a 404
  kills the stream for good) — the SPA renders "this game has ended — rejoin". Consequence,
  recorded: a menhir redeploy ends any live game.
- **D31-3 — Engine + runtime seam (review blocker — the transition driver is spec'd, not
  invented).** `game.ts` exports a pure reducer `reduce(state, event, now) → {state, effects}`.
  Events: `create, join, answer, hostAction(start|next|end), timerFired, connect(playerId?),
  disconnect(playerId?)`. Effects: `{kind:"schedule", at}` · `{kind:"cancelTimer"}` ·
  `{kind:"broadcast"}` · `{kind:"appendResults", row}`. `rooms.ts` owns `Map<code, Room>`, ONE
  timer handle per room (cleared before every reduction, re-armed from `schedule` effects; a
  stale `timerFired` carries the phase+index it was armed for and no-ops on mismatch), executes
  `broadcast` by projecting per §4a and fanning out, and injects the clock (`now()`) + scheduler
  (`setTimer/clearTimer`) so tests drive time by hand.
  **Phases:** `lobby → question(n) → reveal(n) → scoreboard(n) → … → podium`.
  Host actions are **absolute, not relative** (review major — double-click/two-tabs would skip
  content): `{action, fromPhase, fromIndex}`; mismatch with current state → 200 no-op + current
  snapshot. Two identical `next` calls advance exactly once (unit-tested). `next` during a live
  `question` force-closes it to `reveal` (host escape hatch), scoring whoever answered. `end`
  from any phase → `podium` with current standings.
  **Question close:** on `timerFired`, on force-close, or EARLY when
  `answeredCount > 0 && answeredCount >= connectedRosterCount` where `connectedRosterCount`
  counts JOINED players with ≥1 live SSE sink (review blocker — the predicate is over the
  roster, not anonymous connections; **a room with zero connected players NEVER early-closes**,
  unit-tested). Connection tracking: `rooms.ts` keeps `Map<playerId, Set<sink>>` per room,
  refcounted (two tabs = one player); srvx propagates socket close via the stream `cancel()`
  callback (weal-overlay's unsubscribe idiom). Half-open phone sockets over-count "connected" —
  benign (the timer still closes the question), recorded.
  Joins are LOBBY-ONLY for FIRST joins; re-attach works in any phase (D31-9).
- **D31-4 — Quiz files.** `apps/menhir/quizzes/*.kdl`, id = basename. Parsed with `@bgotink/kdl`
  → Zod at server start, resolved off `import.meta.dirname` (NOT cwd — the weal-overlay distDir
  idiom). A malformed file is EXCLUDED from the listing and logged at **WARN** (not ERROR — the
  live SigNoz Class-A rule pages Discord on any ERROR; a quiz typo must not page ops), with a
  startup summary line. Format:
  ```kdl
  quiz "The Undercroft Opener" {
      question "Who yoinked the sandwich?" time=20 {
          option "Ozzie" correct=#true
          option "Argyle"
      }
  }
  ```
  2–4 options, exactly ONE `correct=#true` (Zod-enforced), `time` seconds (default 20, bounds
  5–120). Ship 1 starter quiz (campaign-flavored, ~5 questions, staff-drafted at S1).
- **D31-5 — Scoring (fully pinned — review major).** `t = clamp(receivedAt − questionStartedAt,
  0, T)` measured at SERVER receipt. Correct: `round(1000 * (1 − (t/T)/2))`; wrong or no answer:
  0. Streak: flat **+100 on each correct answer from the 2nd consecutive onward**; ANY
  non-correct (wrong OR timeout) resets the streak to 0. Tiebreak: lower accumulated answer
  time, where each question charges `min(t, T)` and a non-answer charges `T`. Pure function +
  worked-table unit test covering all four pins.
- **D31-6 — Styling.** Codex parchment base — token VALUES copied from
  `apps/codex/src/styles/tokens.css` into menhir's own `tokens.css` (no codex/gothic import;
  codex's own D29-46/R6 precedent) — plus the four Kahoot answer identities as saturated accents:
  red `#e21b3c` triangle, blue `#1368ce` diamond, yellow `#d89e00` circle, green `#26890c`
  square (shape+color double encoding). Fonts via @fontsource: Cinzel, **Cormorant SC** (the
  copied `--font-heading` token needs it — review catch), EB Garamond, Oswald (timer/scores).
  Plain CSS, no tailwind. Big bold answer buttons with hover/press pop; host screen readable
  from across a room.
- **D31-7 — Config + deploy.** `config.kdl` block, EXACTLY these fields (both schemas are
  strict/`extra="forbid"` — any drift reds a lane; the **py mirror is mandatory even though
  menhir is TS-only**, else the whole uv lane + Dagster red):
  ```kdl
  menhir {
      service-name "astra.menhir"
      port 10375
      public-origin "https://menhir.iridi.cc"
      results-path "/ruby/data/experiments/astra/artifacts/menhir/results.jsonl"
  }
  ```
  Mirrors: `Menhir` zod schema + `menhir:` key in `libs/ts/config/src/config.ts`; `MenhirConfig`
  (snake_case fields) + `menhir:` in `libs/py/config/src/astra_config/models.py`. Value
  assertions added to BOTH config test files (the codex-block precedent). **Results mount is
  IDENTICAL-PATH** (host path == container path — plain config fields have no env override;
  the D29-53 convention, review blocker):
  `- /ruby/data/experiments/astra/artifacts/menhir:/ruby/data/experiments/astra/artifacts/menhir`
  (rw). Wire `artifacts/menhir` into `just artifacts-init` (mkdir as uid 1000; Docker would
  auto-create as root). Compose service: weal-overlay shape (Node 24 command, `user:"1000:1000"`,
  signoz-net, fetch healthcheck, `"10375:10375"`). **Dockerfile:** weal-overlay's adapted, PLUS
  a runtime-stage `COPY --from=build /repo/apps/menhir/quizzes ./quizzes` (review blocker — the
  template's runtime allowlist would ship ZERO quiz files). **Manifest ripple = 14 Dockerfiles**
  (13 matching `apps/*/Dockerfile` + `apps/portal/headless/Dockerfile` — the glob misses it;
  review catch): add the `apps/menhir/package.json` COPY line to every one; prove with one
  sibling image build. **Caddy stanza, orator-shaped `handle` blocks** (two bare reverse_proxy
  directives would let the catch-all win and buffer SSE — review catch):
  ```
  menhir.iridi.cc {
      import astra_site
      header X-Robots-Tag noindex
      @sse path /api/events/*
      handle @sse {
          reverse_proxy localhost:10375 {
              flush_interval -1
          }
      }
      handle {
          reverse_proxy localhost:10375
      }
  }
  ```
  Noindex is 3-layer like codex: meta tag in `index.html` + `public/robots.txt` Disallow-all +
  the header. NOT in scope: a menhir card on ledger.iridi.cc (ledger's registry is an explicit
  switch; players arrive via QR — stakeholder can add later).
- **D31-8 — Rooms/codes.** 4-letter codes from `ABCDEFGHJKMNPQRSTUVWXYZ` (23 letters, no
  ambiguous glyphs), collision-regenerated against live rooms; in-memory registry; rooms GC'd
  after 2 h without any event (the GC sweep is a `rooms.ts` interval, `.unref()`d). Each room
  mints a `roomNonce`; the client persists `{code, roomNonce, playerId}` under a `menhir:room`
  localStorage key, so a recycled code can't false-match a stale identity (review major).
- **D31-9 — Identity, re-attach, host control.**
  **Join algorithm (ordered branches — review major):** (1) request carries a `playerId` KNOWN
  to this room (+ matching `roomNonce`) → re-attach: any phase, name-collision exempt, keeps
  score; (2) otherwise it is a FIRST join → lobby-gated (403 mid-game, friendly message) +
  live-name-collision-checked (409); an unknown `playerId` falls to branch 2, never errors.
  **Host:** `POST /api/game` returns `{code, hostToken}`; host actions echo the token (403
  otherwise). This is NOT user auth (R4 holds — nothing to log into); it stops any player who
  can see the shared screen from driving `next`/`end` (review catch: the code IS on the shared
  screen, so without the token the whole room has host control). Host route is `/host/:code`
  (minting `history.replaceState`s from `/host`); the host tab persists `{code, hostToken}` in
  localStorage → F5 re-attaches (bare `/host` with a live stored game offers "resume". The SPA
  fallback covers `/host/*` — verified, weal-overlay's static serve is a real SPA fallback).
  Two host tabs both render; absolute actions (D31-3) make them safe.
- **D31-10 — Results file.** On entering `podium` (including via `end` — aborted games ARE
  recorded), append one JSONL row to the config'd `results-path`:
  `{at, quizId, quizTitle, questionCount, aborted, standings:[{name, score}]}`. Fail-soft:
  write errors log at ERROR (a real outage signal — data loss, unlike quiz typos) and never
  crash the game.
- **D31-11 — Telemetry.** `initTelemetry("astra.menhir")` FIRST in the entry; `lazyCounter`s
  ONLY (never module-scope instruments): `menhir.games.started`, `menhir.games.finished`,
  `menhir.players.joined`, `menhir.answers.received`. SIGTERM flush like weal-overlay.
- **D31-12 — QR join.** Host LOBBY renders a QR encoding `<public-origin>/?code=<CODE>` (origin
  from config — server injects it into the lobby snapshot as `joinUrl`; no hardcoded URL, no
  build-time env needed), sized to scan off a projected/screen-shared display, next to the giant
  room code. Player view reads `?code=` and prefills the join card. `qrcode` npm package,
  client-side render (SVG/canvas) — no external image service.

## 3. Views (one SPA, path-routed: `/` player, `/host` + `/host/:code` host)

- **Player `/`:** join card (code prefilled from `?code=`, name) → lobby ("you're in — watch
  the big screen", your name) → shape buttons (renders exactly `optionCount` buttons) →
  answered-wait → reveal (correct/wrong, +points, total, rank, streak) → podium (your placement).
  Terminal `gone` frame → "this game has ended — rejoin" screen.
- **Host `/host/:code`:** (from `/host`: quiz picker via `/api/quizzes` → create → replaceState)
  lobby (giant code + QR (D31-12), joined-name wall, start) → question (question text, the
  shapes with labels, countdown ring/bar off `endsAt−serverNow`, answered/connected ticker,
  next=force-close) → reveal (correct highlighted, per-option counts) → scoreboard (top 5 +
  deltas) → podium (top 3 celebration + full standings). Controls: start/next/end, disabled
  states per phase.

## 4. API (all JSON; no user auth)

- `GET /api/quizzes` → `[{id, title, questionCount}]`
- `POST /api/game {quizId}` → `{code, hostToken}`
- `POST /api/game/:code/join {name, playerId?, roomNonce?}` → `{playerId, roomNonce}` (D31-9
  branches; 404 unknown code)
- `POST /api/game/:code/answer {playerId, option}` — first answer wins (idempotent; rejected
  outside `question` phase, after answering, or for unknown players)
- `POST /api/game/:code/host {hostToken, action, fromPhase, fromIndex}` (D31-3 absolute)
- `GET /api/events/:code?role=…&playerId=…` (SSE per §4a; unknown room → `gone` frame, 200)
- Unmatched `/api/*` → explicit `404 {error}` BEFORE the static fallback (review catch — the
  SPA fallback would 200-HTML a typo'd API path). Static serve covers `/`, `/host`, `/host/*`.

### 4a. Snapshot contract (the S1/S2 wire schema — Zod union in `schema.ts`, both slices import it)

Common: `{type:"state", phase, code, quizTitle, questionIndex, questionCount, serverNow}`.
Per phase/role (host additions ⊕, player additions ⊙):

- `lobby` — ⊕ `{players:[name], joinUrl}` ⊙ `{you:{name}, playerCount}`
- `question` — ⊕ `{questionText, options:[{label, shape}], endsAt, answeredCount,
  connectedCount}` ⊙ `{optionCount, endsAt, hasAnswered}` — **the player projection carries NO
  option text and NO correct flag** (review blocker: a full-state frame leaks the answer to
  devtools; correctness data exists only from `reveal` onward)
- `reveal` — ⊕ `{questionText, options:[{label, shape, correct, count}]}` ⊙ `{correct,
  pointsGained, score, rank, streak}`
- `scoreboard` — ⊕ `{top:[{name, score, delta}]}` ⊙ `{score, rank}`
- `podium` — both `{standings:[{name, score}], aborted}` ⊙ `{you:{rank, score}}`
- `gone` — `{phase:"gone"}` only.

The engine retains a per-player per-question award record `{option, t, pointsGained}` — it is
the single source for `delta`/`pointsGained`/`rank`/tiebreak (review blocker: otherwise S1/S2
diverge on derivations).

## 5. Slices

- **S1 — engine + server (sonnet).** Scaffold (package.json/tsconfig/vite+vitest configs/
  Dockerfile) **+ the `pyproject.toml` uv exclude (FIRST — the dir's existence alone reds the
  uv lane)**; the D31-7 `config.kdl` block + BOTH schema mirrors + both config-test value
  assertions (moved from S3 — the server entry consumes `cfg.menhir` from day one; safe for
  live services, images bake config at build so nothing running re-reads it); `schema.ts` incl. §4a; pure `game.ts` reducer + `rooms.ts` runtime; `quizzes.ts`;
  `results.ts`; srvx wiring incl. SSE registry + projections; starter quiz; unit tests: scoring
  worked table, absolute-action idempotency (double-`next` advances once), zero-connected
  never-early-closes, all-connected-answered closes, stale `timerFired` no-op, lobby-only
  first-join vs any-phase re-attach (nonce mismatch → branch 2), first-answer-wins, malformed
  quiz exclusion, `gone` frame. CI-green BOTH lanes (uv lane proves the exclude).
- **S2 — client SPA (sonnet).** Both views per §3 + tokens.css/styles per D31-6 + QR (D31-12) +
  countdown off `serverNow/endsAt` + localStorage re-attach (player + host) + SSE client with
  resubscribe + `gone` handling. Component tests (jsdom): shape-button count mapping, phase
  rendering, join-prefill from `?code=`. CI-green.
- **S2b — design review (stakeholder-mandated 2026-07-27).** A frontend-design specialist
  reviews the RENDERED app (local serve; Playwright screenshots: player 390×844, host 1440×900 +
  1920×1080, EVERY phase incl. lobby QR) against the brief: codex-parchment ground + genuine
  Kahoot energy, host screen readable from across the room, no generic-AI blandness. Findings
  triaged by the orchestrator; accepted fixes applied before S3. Gates S3.
- **S3 — deploy + sweep (orchestrator).** Compose service + identical-path artifacts mount + `artifacts-init`;
  Dockerfile (quizzes COPY) + the 14-file manifest ripple (prove w/ one sibling build); caddy
  stanza (handle-wrapped); 3-layer noindex; `just up` (menhir-scoped if the tree carries
  concurrent work) + `just caddy-reload`; edge verification; SigNoz check; README; spec §7
  build record; RESUME/memory checkpoint.

## 6. Acceptance gates

- **A** Both CI lanes green locally (pnpm: `vp run -r typecheck/test/build` + lint +
  format:check; uv lane run to prove the workspace exclude).
- **B** Unit gates: the S1 test list above, all green; scoring table exact.
- **C** Local two-client smoke — a SEPARATE script (`apps/menhir/scripts/` — NOT inside the
  vitest `test` script; review catch: `vp run -r test` fans out to CI where no browser exists),
  declared LOCAL-ONLY (no new CI job for v1, recorded): host + 2 players (Playwright), full
  game to podium, scores match the worked table.
- **D** Live: `https://menhir.iridi.cc` serves the SPA (200 + noindex header + robots.txt),
  SSE streams through the edge unbuffered (curl shows frames arriving on time), one full game
  played through the edge incl. QR join, results row lands in `artifacts/menhir/results.jsonl`
  host-owned (uid 1000).
- **E** SigNoz: `astra.menhir` traces + the four counters visible; 0 ERROR logs in the deploy
  window (quiz-parse WARNs excluded by design).
- **F** Design review (S2b) ran on the rendered app, findings dispositioned in the build record
  (flagged / applied / declined-with-reason).
- **G** Docs: `apps/menhir/README.md` (author a quiz, run a game, where results land, the
  deploy-ends-live-games caveat); RESUME/memory checkpoint.

## 7. Build record

(appended at build time)

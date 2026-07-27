# menhir (0031) — scoping: a Kahoot-style session-opener quiz game

**Date:** 2026-07-27 · **Status:** SCOPED — all questions resolved, ready to spec
**Stakeholder ask (verbatim intent):** "create a clone of kahoot!, to be used with my players at
the beginning of a session, called menhir, accessible at menhir.iridi.cc. It shouldn't have any
auth, and should be styled like codex but with more colors like actual kahoot!"

## 1. What it is

A small realtime quiz game: the GM (host) opens a **host screen** (screen-shared in Discord or
projected), players join from their **phones** with a short game code + a display name, and answer
timed multiple-choice questions by tapping colored shape buttons. Speed-scored, leaderboard between
questions, podium at the end. Used for a few minutes at session start; games are ephemeral.

## 2. Stakeholder decisions (resolved 2026-07-27, AskUserQuestion)

- **R1 — Play mode: host screen + phone buttons** (classic Kahoot). The host view carries the
  question text + the 4 colored answer shapes; player phones show ONLY the 4 shape buttons
  (+ name/score chrome). No "question on every device" mode.
- **R2 — Quiz authoring: committed files in the repo.** Question sets ship as files under
  `apps/menhir/quizzes/`; the host UI lists them. No editor, no upload. Staff/Claude can draft
  sets from campaign lore on request.
- **R3 — Scoring: ephemeral + results file.** Game state is in-memory; when a game ends the final
  standings append to a results file on disk (season-long record, no DB).
- **R5 — QR join (added mid-scope):** the host lobby shows a QR encoding
  `<public-origin>/?code=<CODE>`; scanning prefills the player join card. Client-side `qrcode`
  package, no external service. (Spec D31-12.)
- **R4 — No auth anywhere** (explicit in the ask). The host view is unauthenticated too — same
  posture as heartwood D5 / scriptorium: obscure noindexed host, worst case is a griefed quiz
  round. Game codes gate players into rooms socially, not cryptographically.

## 3. Verified repo facts (checked against the tree, not assumed)

- **Nearest pattern = weal-overlay** (`apps/weal-overlay/`): srvx `0.11.20` on Node 24
  (`node --import nodeTsResolve.mjs server.ts`), vite-built React 19 SPA served from `dist/`,
  in-memory SSE hub (`src/hub.ts` — Set of frame-callbacks, `publish()` + `heartbeat()`),
  `@astra/config` + `initTelemetry("astra.<name>")` first, SIGTERM flush. Menhir mirrors all of
  it, minus the ingest token.
- **Ports:** compose publishes 10350–10374 today; scriptorium (host-run) holds 10390.
  **Menhir takes 10375** (host and container).
- **Config:** `ontology/ontology-config/config.kdl` gets a `menhir { port 10375; public-origin
  "https://menhir.iridi.cc" }` block, mirrored in BOTH schemas (`libs/ts/config/src/config.ts`,
  `libs/py/config/src/astra_config/models.py`) per [[config-single-source]]. No secrets (no auth,
  no external APIs) → no SOPS/compose-env work.
- **Caddy:** `sites.caddyfile` stanza with the weal-overlay SSE posture (`flush_interval -1` on
  the event-stream path) + `X-Robots-Tag noindex` (codex posture). `*.iridi.cc` wildcard — no DNS
  record needed; cert mints on first hit.
- **Compose:** service like weal-overlay's (`user: "1000:1000"`, signoz-net, fetch healthcheck,
  Node 24 command). Results file needs a writable bind mount → `artifacts/menhir/` (the
  [[deploy-artifacts-run-as-user]] pattern; Docker auto-creates missing sources as ROOT, so wire
  it into `just artifacts-init`).
- **Dockerfile manifest ripple:** every TS app Dockerfile COPYs all workspace manifests for the
  frozen pnpm install — adding `apps/menhir/package.json` means touching every sibling TS
  Dockerfile (the recurring 11–13 file ripple; count at build time, verify with a sibling build).
- **Styling source:** codex's parchment tokens live at `apps/codex/src/styles/tokens.css`
  (self-contained CSS custom props — EB Garamond/Cinzel/Cormorant SC/Oswald via @fontsource,
  parchment `#eee7d8`, ink, maroon `#7a2e2c`, gold `#b99b5d`). Menhir copies the token VALUES it
  needs into its own stylesheet (codex drops gothic; menhir likewise skips `@astra/gothic` — the
  parchment system is a plain CSS file, nothing to import as a lib).
- **pnpm lane only — BUT uv needs an explicit exclude** (CORRECTED by adversarial review: the
  original "no pyproject → uv never sees it" claim was FALSE). The root `pyproject.toml` globs
  `members = ["apps/*", …]` and hard-errors on a glob-matched dir without a manifest; every
  TS-only app sits in an explicit `[tool.uv.workspace] exclude` list. `apps/menhir` must be
  added there the moment the dir exists. pnpm side: `apps/*` glob + manifest auto-enrolls;
  `vp run -r` picks up the scripts.

## 4. Staff decisions (recorded here, carried into the spec)

- **Transport: SSE down + POST up** (weal-overlay precedent, EventSource auto-reconnect is ideal
  for phones; no WebSocket). One `/api/events` stream per client, role-scoped payloads.
- **Quiz file format: KDL** (`quizzes/*.kdl`), parsed with `@bgotink/kdl` and Zod-validated at
  load ("KDL at the edges" + the strider layers-are-KDL precedent; friendlier to hand-author
  than JSON). Malformed quiz files fail the server's quiz LISTING loudly, not silently.
- **Scoring formula (classic Kahoot):** correct = `round(1000 * (1 - (t_answer/t_limit)/2))`,
  wrong = 0; +100 streak bonus per consecutive correct answer ≥2. Per-question time limit
  authored in the quiz file (default 20 s).
- **Question shape:** 2–4 options, exactly one correct (no multi-select v1). The four Kahoot
  identities: red triangle, blue diamond, yellow circle, green square.
- **Game codes:** 4 letters from an unambiguous alphabet (no 0/O/1/I), in-memory room registry,
  rooms GC'd after inactivity (~2 h).
- **Results file:** JSONL append at `artifacts/menhir/results.jsonl` (one row per finished game:
  date, quiz, standings). Fail-soft: a write error must not crash the game.
- **A11y/robustness notes for spec:** late joiners allowed in lobby only; disconnect/reconnect
  re-attaches by player id (localStorage); host refresh re-attaches to the running game.

## 5. Out of scope (v1)

Quiz editor UI · multi-select/ordering/slider question types · images on questions · persistent
in-app history page (the JSONL is the record) · spectator view · sounds/music (CSS animation
energy only — revisit if asked) · mobile host view (host = desktop screen share).

## 6. Open questions

None — R1–R4 stakeholder-resolved above; the rest are staff calls recorded in §4.

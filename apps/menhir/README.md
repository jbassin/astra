# menhir — the Kahoot-style session-opener quiz

A realtime quiz game for session starts (`0031`): the GM screen-shares the **host view**
(`https://menhir.iridi.cc/host`), players scan the lobby QR (or type the 4-letter code) on their
phones, answer timed multiple-choice questions on colored shape buttons, and a podium closes it
out. Speed-scored (up to 1000/question + streak bonuses). No auth anywhere — a per-game
`hostToken` (minted at create, held in the host tab) is the only thing gating host controls.

Spec: `thoughts/astra/specs/0031-menhir-spec.md` (D31-1..12). Template: weal-overlay
(srvx/Node 24 + vite React SPA + SSE); styling: codex parchment tokens + the four Kahoot shape
identities.

## Running a game

1. Open `https://menhir.iridi.cc/host`, pick a quiz, start the room.
2. Screen-share the host tab; players scan the QR (prefills the code) and enter a name.
3. **Start game** → questions run on a server-side countdown; a question closes early when every
   connected player has answered. **Force reveal** skips the wait; **Next** advances through
   reveal → scoreboard → next question; **End game** jumps to the podium from anywhere.
4. Players who refresh mid-game re-attach automatically (identity in localStorage, scoped to the
   room). The host tab re-attaches too (`/host/<CODE>` + stored token).

## Authoring a quiz

Drop a KDL file in `apps/menhir/quizzes/` (id = basename) and redeploy (the compose image bakes
the dir; `docker compose up -d --build menhir` from `deploy/`):

```kdl
quiz "My Quiz Title" {
    question "The question text?" time=20 {
        option "Wrong answer"
        option "Right answer" correct=#true
    }
}
```

2–4 options, exactly one `correct=#true`, `time` in seconds (5–120, default 20). A malformed
file is logged at WARN and excluded — the rest still serve. Facts in shipped quizzes should be
verified against the codex corpus (see the starter's inline citations).

## Results

Every game that reaches the podium (including aborted ones, flagged `aborted:true`) appends a
standings row to `artifacts/menhir/results.jsonl` (identical-path bind mount, host-owned).

## Caveats

- **A redeploy ends live games** (rooms are in-memory by design, D31-2); clients render a
  "game has ended" screen. Don't redeploy mid-quiz at the table.
- Rooms GC after 2 h idle. Codes recycle; stale phone identities fall back to a normal join.
- The two-client Playwright smoke (`gate C`) is local-only — CI runs the unit/component suites.

## Dev

```
pnpm --filter @astra/menhir test        # engine + runtime + component tests
pnpm --filter @astra/menhir build       # vite build → dist/
cd apps/menhir && node --import ../../libs/ts/site-kit/src/nodeTsResolve.mjs server.ts
```

Server entry wires telemetry first (`astra.menhir`: manual spans on the mutating API routes —
@astra/observe registers no HTTP auto-instrumentation — plus lazyCounter metrics
`menhir.{games.started,games.finished,players.joined,answers.received}`).

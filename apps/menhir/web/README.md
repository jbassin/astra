# menhir — the Kahoot-style session-opener quiz

A realtime quiz game for session starts (`0031`): the GM screen-shares the **host view**
(`https://menhir.iridi.cc/host`), players scan the lobby QR (or type the 4-letter code) on their
phones, answer timed multiple-choice questions on colored shape buttons, and a podium closes it
out. Speed-scored (up to 1000/question + streak bonuses). No auth anywhere — a per-game
`hostToken` (minted at create, held in the host tab) is the only thing gating host controls.

Spec: `thoughts/archive/specs/0031-menhir-spec.md` (D31-1..12). Template: weal-overlay
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

Drop a KDL file in `apps/menhir/web/quizzes/` (id = basename), push, and run `just deploy menhir`
(the image bakes the dir):

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
standings row to `/ruby/data/astra-state/menhir/results.jsonl` (config `menhir.results-path`,
relative to `data.root`; identical-path bind mount, host-owned).

## Caveats

- **A redeploy ends live games** (rooms are in-memory by design, D31-2); clients render a
  "game has ended" screen. Don't redeploy mid-quiz at the table.
- Rooms GC after 2 h idle. Codes recycle; stale phone identities fall back to a normal join.
- The two-client Playwright smoke (`gate C`) is local-only — CI runs the unit/component suites.

## Dev

```
pnpm --filter @astra/menhir test        # engine + runtime + component tests
pnpm --filter @astra/menhir build       # vite build → dist/
cd apps/menhir/web && node --import ../../../libs/ts/site-kit/src/nodeTsResolve.mjs server.ts
```

The server runs on `@astra/service-kit` (`src/server.ts`): one HTTP span per request named after
the route (`POST /api/game/:code/join`, tagged `menhir.room`), `/healthz` for the compose
healthcheck (unspanned), and on SIGTERM it drains, closes the SSE streams, then stops the rooms
runtime. Metrics are lazyCounters
`menhir.{games.started,games.finished,players.joined,answers.received}`. Request bodies are zod
schemas whose messages are the API's error strings; `test/pins.test.ts` pins every response.

## Traps

- **The question deadline comes only from `deadlineOf(state)`** (`src/game.ts`). The reducer emits
  no timer effects; after every reduction `rooms.ts` compares the armed timer with
  `deadlineOf(state)` and keeps, re-arms or clears it. A new phase with a deadline is a change to
  `deadlineOf`, nothing else. `test/rooms.test.ts` covers the runtime with an injected test clock.
- **Never answer the SSE endpoint with 404.** Browsers stop reconnecting an `EventSource` for good
  after an HTTP error. An unknown or collected room returns 200 with one `{phase:"gone"}` frame.
- **Don't simulate many players in one browser.** Six `EventSource`s in one tab hit Chromium's
  per-origin connection limit and freeze the tab. Drive extra players from a Node script.
- **A room with no connected players never closes a question early.** POST-only clients (curl
  smoke tests) aren't "connected", so they always wait out the timer.
- **In the lobby `questionIndex` is -1.** Host actions carry an absolute `fromIndex`, which must
  match it.
- **Quiz parse failures log WARN, not ERROR.** Any ERROR log pages Discord through the SigNoz
  alert rule; a quiz typo must not.
- **Draw icons as SVG, not emoji.** Emoji render as empty boxes on hosts without an emoji font
  (`src/marks.tsx`). Kahoot yellow behind white text is about 2:1 contrast: keep tiles dark and put
  the hue on the glyph.
- **The runtime image ships the whole built app dir** (`deploy/node.Dockerfile`), so `quizzes/`
  and any new data dir inside the app reach the container with no Dockerfile change.

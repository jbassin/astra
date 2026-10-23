import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, expect, test } from "vitest";

import { must } from "../src/assert";
import type { Quiz } from "../src/schema";
import { type RunningServer, startServer } from "../src/server";

let running: RunningServer;
let base: string;
let resultsPath: string;

const QUIZ: Quiz = {
  id: "smoke-quiz",
  title: "Smoke Quiz",
  questions: [
    {
      text: "Q1",
      time: 20,
      options: [
        { label: "A", correct: true },
        { label: "B", correct: false },
      ],
    },
  ],
};

beforeAll(async () => {
  const dist = mkdtempSync(join(tmpdir(), "menhir-dist-"));
  writeFileSync(join(dist, "index.html"), "<!doctype html><title>menhir test</title>");
  const resultsDir = mkdtempSync(join(tmpdir(), "menhir-results-"));
  resultsPath = join(resultsDir, "results.jsonl");

  running = startServer({
    port: 0,
    distDir: dist,
    runtimeOptions: {
      quizzes: [QUIZ],
      publicOrigin: "https://menhir.iridi.cc",
      resultsPath,
    },
  });
  const ready = await running.server.ready();
  // srvx has no `.port` (R3, 0022 S8 — B3); `.url` includes a trailing slash.
  base = (ready.url ?? "").replace(/\/$/, "");
});

afterAll(() => running.stop());

function postJson(path: string, body: unknown) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("GET /api/quizzes lists the loaded quiz", async () => {
  const res = await fetch(`${base}/api/quizzes`);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual([{ id: "smoke-quiz", title: "Smoke Quiz", questionCount: 1 }]);
});

test("unmatched /api/* returns an explicit 404 JSON, not the SPA fallback (spec §4)", async () => {
  const res = await fetch(`${base}/api/nope`);
  expect(res.status).toBe(404);
  expect(res.headers.get("content-type")).toContain("application/json");
});

test("the static SPA fallback serves index.html for /host/:code", async () => {
  const res = await fetch(`${base}/host/ABCD`);
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("<title>menhir test</title>");
});

test("SSE to an unknown room code never 404s — it streams a terminal gone frame (D31-2)", async () => {
  const res = await fetch(`${base}/api/events/ZZZZ?role=host`);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/event-stream");
  const reader = must(res.body, "SSE response body").getReader();
  const { value } = await reader.read();
  const text = new TextDecoder().decode(value);
  expect(text).toContain('"phase":"gone"');
  await reader.cancel();
});

test("full happy path: create -> join -> answer -> host actions -> podium, with a results row", async () => {
  const create = await postJson("/api/game", { quizId: "smoke-quiz" });
  expect(create.status).toBe(200);
  const { code, hostToken } = (await create.json()) as { code: string; hostToken: string };
  expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/); // D31-8's 23-letter unambiguous alphabet

  const joinRes = await postJson(`/api/game/${code}/join`, { name: "Alice" });
  expect(joinRes.status).toBe(200);
  const { playerId, roomNonce } = (await joinRes.json()) as { playerId: string; roomNonce: string };
  expect(typeof playerId).toBe("string");
  expect(typeof roomNonce).toBe("string");

  // A duplicate name is rejected 409 while still in the lobby.
  const dupe = await postJson(`/api/game/${code}/join`, { name: "Alice" });
  expect(dupe.status).toBe(409);

  // A bad host token is rejected 403 — it never even reaches the reducer.
  const badHost = await postJson(`/api/game/${code}/host`, {
    hostToken: "wrong-token",
    action: "start",
    fromPhase: "lobby",
    fromIndex: -1,
  });
  expect(badHost.status).toBe(403);

  const start = await postJson(`/api/game/${code}/host`, {
    hostToken,
    action: "start",
    fromPhase: "lobby",
    fromIndex: -1,
  });
  expect(start.status).toBe(200);
  const startBody = (await start.json()) as { snapshot: { phase: string } };
  expect(startBody.snapshot.phase).toBe("question");

  const answer = await postJson(`/api/game/${code}/answer`, { playerId, option: 0 });
  expect(answer.status).toBe(200);

  // Re-attach (same playerId + roomNonce) works mid-game and is exempt from the
  // lobby gate / name check — the D31-9 branch.
  const reattach = await postJson(`/api/game/${code}/join`, { name: "Alice", playerId, roomNonce });
  expect(reattach.status).toBe(200);

  // Nobody opened an SSE stream, so connectedRosterCount=0 and the question
  // does NOT early-close (D31-3) — the host must force it via `next`.
  const forceClose = await postJson(`/api/game/${code}/host`, {
    hostToken,
    action: "next",
    fromPhase: "question",
    fromIndex: 0,
  });
  const forceCloseBody = (await forceClose.json()) as { snapshot: { phase: string } };
  expect(forceCloseBody.snapshot.phase).toBe("reveal");

  const toScoreboard = await postJson(`/api/game/${code}/host`, {
    hostToken,
    action: "next",
    fromPhase: "reveal",
    fromIndex: 0,
  });
  expect(((await toScoreboard.json()) as { snapshot: { phase: string } }).snapshot.phase).toBe(
    "scoreboard",
  );

  const toPodium = await postJson(`/api/game/${code}/host`, {
    hostToken,
    action: "next",
    fromPhase: "scoreboard",
    fromIndex: 0,
  });
  const podiumBody = (await toPodium.json()) as {
    snapshot: { phase: string; standings: { name: string; score: number }[]; aborted: boolean };
  };
  expect(podiumBody.snapshot.phase).toBe("podium");
  expect(podiumBody.snapshot.aborted).toBe(false);
  // A real clock separates "start" from "answer" by some small, non-deterministic
  // number of milliseconds against T=20s, so assert the shape + a loose bound
  // rather than the exact score (game.test.ts pins the exact formula by hand).
  expect(podiumBody.snapshot.standings).toHaveLength(1);
  const winner = must(podiumBody.snapshot.standings[0], "standings[0]");
  expect(winner.name).toBe("Alice");
  expect(winner.score).toBeGreaterThan(900);

  // D31-10: the results row lands on disk (async write — poll briefly).
  let lines: string[] = [];
  for (let i = 0; i < 20; i++) {
    try {
      lines = readFileSync(resultsPath, "utf8").trim().split("\n").filter(Boolean);
    } catch {
      // not written yet
    }
    if (lines.length > 0) break;
    await new Promise((r) => setTimeout(r, 25));
  }
  expect(lines).toHaveLength(1);
  const row = JSON.parse(must(lines[0], "results.jsonl line 0"));
  expect(row).toMatchObject({ quizId: "smoke-quiz", quizTitle: "Smoke Quiz", aborted: false });
});

test("answering with an unknown playerId is rejected 400", async () => {
  const create = await postJson("/api/game", { quizId: "smoke-quiz" });
  const { code, hostToken } = (await create.json()) as { code: string; hostToken: string };
  await postJson(`/api/game/${code}/host`, {
    hostToken,
    action: "start",
    fromPhase: "lobby",
    fromIndex: -1,
  });
  const res = await postJson(`/api/game/${code}/answer`, { playerId: "ghost", option: 0 });
  expect(res.status).toBe(400);
});

test("joining an unknown room code is 404", async () => {
  const res = await postJson("/api/game/QQQQ/join", { name: "Nobody" });
  expect(res.status).toBe(404);
});

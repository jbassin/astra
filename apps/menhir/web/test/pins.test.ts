/**
 * Response pins for the menhir HTTP app: a fixed sequence of requests, each recorded as
 * its status, content type and body. The snapshot file was written before the service-kit
 * migration; the migration must leave it unchanged. Room codes and UUIDs are redacted, and
 * the clock is fixed, so deadlines in snapshots are deterministic.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import { type Clock, createRoomsRuntime } from "../src/rooms";
import type { Quiz } from "../src/schema";
import { createApp } from "../src/server";

const QUIZ: Quiz = {
  id: "pin-quiz",
  title: "Pin Quiz",
  questions: [
    {
      text: "Q1?",
      time: 20,
      options: [
        { label: "A", correct: true },
        { label: "B", correct: false },
      ],
    },
  ],
};

const CLOCK: Clock = {
  now: () => 1_000_000,
  setTimer: () => 0 as unknown as ReturnType<typeof setTimeout>,
  clearTimer: () => {},
};

test("menhir HTTP responses match the pre-migration pins", async () => {
  const dist = mkdtempSync(join(tmpdir(), "menhir-pins-dist-"));
  writeFileSync(join(dist, "index.html"), "<!doctype html><title>menhir pins</title>");
  writeFileSync(join(dist, "app.js"), "console.log('pinned')");
  const runtime = createRoomsRuntime({
    quizzes: [QUIZ],
    publicOrigin: "https://menhir.test",
    resultsPath: join(mkdtempSync(join(tmpdir(), "menhir-pins-results-")), "results.jsonl"),
    clock: CLOCK,
  });
  const app = createApp({ distDir: dist, runtime });
  const secrets: string[] = [];

  function redact(text: string): string {
    let out = text.replaceAll(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
      "<uuid>",
    );
    for (const s of secrets) out = out.replaceAll(s, "<code>");
    out = out.replaceAll(/"code":"[A-Z]{4}"/g, '"code":"<code>"');
    return out;
  }

  async function pin(label: string, method: string, path: string, body?: unknown, raw?: string) {
    const headers: Record<string, string> = {};
    let payload: string | undefined = raw;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      headers["content-type"] = "application/json";
    }
    const res = await app.handle(
      new Request(`https://menhir.test${path}`, { method, headers, body: payload }),
    );
    let text: string;
    if (res.headers.get("content-type") === "text/event-stream") {
      const reader = must(res.body).getReader();
      text = new TextDecoder().decode((await reader.read()).value);
      await reader.cancel();
    } else {
      text = await res.text();
    }
    const record = {
      status: res.status,
      contentType: res.headers.get("content-type"),
      cacheControl: res.headers.get("cache-control"),
      body: redact(text),
    };
    expect(record).toMatchSnapshot(label);
    return text;
  }

  await pin("quizzes", "GET", "/api/quizzes");
  await pin("create bad json", "POST", "/api/game", undefined, "{");
  await pin("create no quiz id", "POST", "/api/game", { quiz: 1 });
  await pin("create null body", "POST", "/api/game", null);
  await pin("create unknown quiz", "POST", "/api/game", { quizId: "nope" });
  const created = JSON.parse(await pin("create", "POST", "/api/game", { quizId: "pin-quiz" })) as {
    code: string;
    hostToken: string;
  };
  secrets.push(created.code);
  const code = created.code;

  await pin("join bad json", "POST", `/api/game/${code}/join`, undefined, "nope");
  await pin("join blank name", "POST", `/api/game/${code}/join`, { name: "  " });
  await pin("join unknown room", "POST", "/api/game/ZZZZ/join", { name: "Kira" });
  const joined = JSON.parse(
    await pin("join", "POST", `/api/game/${code}/join`, { name: "Kira", playerId: 7 }),
  ) as { playerId: string; roomNonce: string };
  await pin("join again", "POST", `/api/game/${code}/join`, {
    name: "Kira",
    playerId: joined.playerId,
    roomNonce: joined.roomNonce,
  });

  await pin("host bad json", "POST", `/api/game/${code}/host`, undefined, "x");
  await pin("host array body", "POST", `/api/game/${code}/host`, []);
  await pin("host missing fields", "POST", `/api/game/${code}/host`, { hostToken: "t" });
  await pin("host bad action", "POST", `/api/game/${code}/host`, {
    hostToken: created.hostToken,
    action: "explode",
    fromPhase: "lobby",
    fromIndex: -1,
  });
  await pin("host wrong token", "POST", `/api/game/${code}/host`, {
    hostToken: "not-the-token",
    action: "start",
    fromPhase: "lobby",
    fromIndex: -1,
  });
  await pin("host unknown room", "POST", "/api/game/ZZZZ/host", {
    hostToken: created.hostToken,
    action: "start",
    fromPhase: "lobby",
    fromIndex: -1,
  });
  await pin("host start", "POST", `/api/game/${code}/host`, {
    hostToken: created.hostToken,
    action: "start",
    fromPhase: "lobby",
    fromIndex: -1,
  });
  await pin("host stale phase", "POST", `/api/game/${code}/host`, {
    hostToken: created.hostToken,
    action: "start",
    fromPhase: "lobby",
    fromIndex: -1,
  });

  await pin("answer bad json", "POST", `/api/game/${code}/answer`, undefined, "x");
  await pin("answer missing option", "POST", `/api/game/${code}/answer`, {
    playerId: joined.playerId,
  });
  await pin("answer unknown player", "POST", `/api/game/${code}/answer`, {
    playerId: "ghost",
    option: 0,
  });
  await pin("answer", "POST", `/api/game/${code}/answer`, { playerId: joined.playerId, option: 0 });
  await pin("answer twice", "POST", `/api/game/${code}/answer`, {
    playerId: joined.playerId,
    option: 1,
  });

  await pin("events bad role", "GET", `/api/events/${code}?role=viewer`);
  await pin("events player without id", "GET", `/api/events/${code}?role=player`);
  await pin("events host", "GET", `/api/events/${code}?role=host`);
  await pin("events gone", "GET", "/api/events/ZZZZ?role=host");

  await pin("api GET on a POST route", "GET", `/api/game/${code}/join`);
  await pin("api unknown", "GET", "/api/nope");
  await pin("api unknown POST", "POST", "/api/nope", {});
  await pin("spa root", "GET", "/");
  await pin("spa host route", "GET", `/host/${code}`);
  await pin("spa asset", "GET", "/app.js");
  await pin("spa traversal", "GET", "/..%2f..%2fetc%2fpasswd");
  await pin("non-GET outside the api", "DELETE", "/somewhere");
  runtime.shutdown();
});

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

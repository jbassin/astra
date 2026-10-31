import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { astraContentRoot } from "@astra/content-build";
import {
  defaultBeingFile,
  loadBeing,
  loadSessionOverrides,
  parseSessionOverrides,
  skippedKeys,
} from "@astra/ontology";
import { describe, expect, it } from "vitest";

import { loadTranscripts, type ScriptLine } from "./transcript";
import { buildTranscripts, lineTime, sessionSeconds, speakerStats } from "./transcriptBuild";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(astraContentRoot(HERE), "linguist/data");

const line = (name: string, second: number, duration = 2): ScriptLine => ({
  start: "00:00:00",
  second,
  text: "words",
  user: { name, color: `--text${name}` },
  duration,
});

describe("buildTranscripts", () => {
  const built = buildTranscripts(DATA_DIR, [], loadBeing(defaultBeingFile()));
  const transcripts = loadTranscripts(DATA_DIR);
  const bodies = Object.entries(built.bodies);

  it("builds a body and a meta for every session", () => {
    expect(bodies.length).toBe(transcripts.length);
    expect(Object.keys(built.meta).toSorted()).toEqual(Object.keys(built.bodies).toSorted());
  });

  it("marks a line by the same speaker as the line before as a continuation", () => {
    let checked = 0;
    for (const [, body] of bodies) {
      let previous: string | null = null;
      for (const m of body.html.matchAll(
        /class="transcript-line ([^"]*)"[^>]*data-user="([^"]*)"/g,
      )) {
        const [, classes = "", user = ""] = m;
        expect(classes.split(" ").includes("is-cont")).toBe(user === previous);
        previous = user;
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("shows the name without a colon, keeping one hidden for copying", () => {
    const html = bodies[0]?.[1].html ?? "";
    expect(html).toMatch(
      /data-char="[^"]*">[^<:]+<\/span><span class="transcript-colon">: <\/span>/,
    );
  });

  it("records each session's length and speakers", () => {
    for (const t of transcripts) {
      const meta = Object.values(built.meta).find((m) => m.date === t.date);
      expect(meta?.durationSeconds).toBe(Math.round(sessionSeconds(t.script)));
      const total = meta?.speakers.reduce((n, s) => n + s.lines, 0);
      expect(total).toBe(t.script.length);
    }
  });
});

describe("sessions.kdl skips", () => {
  // A session that clearly matches Through a Song, Darkly ("Argyle" on 20 lines).
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akasha-skip-"));
  const script = Array.from({ length: 20 }, (_, i) => ({
    ...line("Josh", i),
    text: "Argyle draws his blade.",
  }));
  fs.writeFileSync(
    path.join(dir, "2025-8-11.json"),
    JSON.stringify({ date: "2025-8-11", audio: "/audio/2025-8-11.mp3", script }),
  );
  const being = loadBeing(defaultBeingFile());

  it("files a matching session under its campaign", () => {
    const built = buildTranscripts(dir, [], being);
    expect(built.docs.map((d) => d.slug)).toEqual(["Script/Through-a-Song,-Darkly/2025-8-11"]);
  });

  it("leaves a skipped session in Script/Unsorted, billed by player name", () => {
    const skip = parseSessionOverrides('session "2025-8-11" skip=#true');
    const built = buildTranscripts(dir, [], being, skip);
    expect(built.docs.map((d) => d.slug)).toEqual(["Script/Unsorted/2025-8-11"]);
    expect(built.meta["Script/Unsorted/2025-8-11"]?.speakers[0]?.char).toBe("Josh");
  });

  it("reads the checkout's sessions.kdl skips, which include The Blue Remains", () => {
    expect(skippedKeys(loadSessionOverrides()).has("2025-8-11")).toBe(true);
  });
});

describe("sessions.kdl campaign overrides", () => {
  // Campaign-3 names in the table talk, but the GM files the session under Urth.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akasha-campaign-"));
  const script = [
    ...Array.from({ length: 20 }, (_, i) => ({ ...line("Josh", i), text: "Benny waves." })),
    { ...line("Josh", 20), text: "Fulton flexes." },
    { ...line("Mike", 21), text: "Runway Brian squeaks." },
    { ...line("Noah", 22), text: "Next up is Hades." },
  ];
  fs.writeFileSync(
    path.join(dir, "2026-9-3.json"),
    JSON.stringify({ date: "2026-9-3", audio: "/audio/2026-9-3.mp3", script }),
  );
  const being = loadBeing(defaultBeingFile());
  const filed = parseSessionOverrides('session "2026-9-3" campaign="urth"');

  it("guesses campaign 3 without the override", () => {
    const built = buildTranscripts(dir, [], being);
    expect(built.docs.map((d) => d.slug)).toEqual(["Script/Through-a-Song,-Darkly/2026-9-3"]);
  });

  it("files the page under the named campaign, billed from its roles", () => {
    const built = buildTranscripts(dir, [], being, filed);
    expect(built.docs.map((d) => d.slug)).toEqual(["Script/Urth/2026-9-3"]);
    const chars = Object.fromEntries(
      (built.meta["Script/Urth/2026-9-3"]?.speakers ?? []).map((s) => [s.user, s.char]),
    );
    // Josh plays two Urth one-shots: billed as the role this session names (Fulton, not Pete).
    expect(chars).toEqual({ Josh: "Fulton", Mike: "Runway Brian", Noah: "Gamemaster" });
  });

  it("fails the build on a campaign being.kdl does not list", () => {
    const typo = parseSessionOverrides('session "2026-9-3" campaign="urht"');
    expect(() => buildTranscripts(dir, [], being, typo)).toThrow(/urht/);
  });

  it("reads the checkout's sessions.kdl, which files 2026-9-3 under Urth", () => {
    const built = buildTranscripts(dir, [], being, loadSessionOverrides());
    expect(built.docs.map((d) => d.slug)).toEqual(["Script/Urth/2026-9-3"]);
  });
});

describe("line times and session length", () => {
  it("drops the leading zero of the hour", () => {
    expect(lineTime("00:32:15")).toBe("0:32:15");
    expect(lineTime("03:33:57")).toBe("3:33:57");
    expect(lineTime("12:00:01")).toBe("12:00:01");
  });

  it("measures a session to the end of its last line", () => {
    expect(sessionSeconds([line("Mike", 1, 2), line("Josh", 12_837.2, 0.3)])).toBeCloseTo(12_837.5);
    expect(sessionSeconds([])).toBe(0);
  });

  it("counts lines per speaker, most first", () => {
    const stats = speakerStats(
      [line("Mike", 1), line("Josh", 2), line("Josh", 3), line("Noah", 4)],
      null,
    );
    expect(stats).toEqual([
      { user: "Josh", char: "Josh", lines: 2 },
      { user: "Mike", char: "Mike", lines: 1 },
      { user: "Noah", char: "Noah", lines: 1 },
    ]);
  });
});

import path from "node:path";
import { fileURLToPath } from "node:url";

import { astraContentRoot } from "@astra/content-build";
import { defaultBeingFile, loadBeing } from "@astra/ontology";
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

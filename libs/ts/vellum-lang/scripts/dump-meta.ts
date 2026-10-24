#!/usr/bin/env node
/**
 * The TS half of the whole-corpus parity check (`just vellum-parity`).
 *
 *   node --import ./libs/ts/site-kit/src/nodeTsResolve.mjs \
 *     libs/ts/vellum-lang/scripts/dump-meta.ts < paths.json
 *
 * Reads a JSON array of `.vellum` file paths on stdin and prints one JSON object that maps
 * each path to its `canonicalMetaJson`. `libs/py/vellum-lang/scripts/corpus_parity.py`
 * chooses the files, runs this, and compares each string with the Python
 * `canonical_meta_json` of the same file.
 */
import { readFileSync } from "node:fs";

import { canonicalMetaJson } from "../src/index";

const paths: unknown = JSON.parse(readFileSync(0, "utf8"));
if (!Array.isArray(paths) || !paths.every((p) => typeof p === "string")) {
  console.error("dump-meta.ts: stdin must be a JSON array of file paths");
  process.exit(64);
}

const out: Record<string, string> = {};
for (const path of paths) out[path] = canonicalMetaJson(readFileSync(path, "utf8"));
process.stdout.write(JSON.stringify(out));

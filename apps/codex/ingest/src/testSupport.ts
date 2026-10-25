/**
 * Builders shared by the ingest test files: minimal `CodexEntity` and `AonDocMeta`
 * factories, the committed AON fixture reader, and report collectors. Each builder fills
 * the "boring" shape, so a test overrides only the fields it cares about.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { CodexEntity } from "@astra/codex-corpus";

import type { AonDocMeta, AonHit } from "./aonFacets";

type EntityOverrides = Partial<CodexEntity> &
  Pick<CodexEntity, "id" | "category" | "slug" | "name">;

/** A `CodexEntity` with an empty body, no traits or facets, and an "unknown" source. */
export function entity(overrides: EntityOverrides): CodexEntity {
  return {
    edition: "remaster",
    source: { book: "unknown", license: "unknown" },
    traits: [],
    body: [],
    facets: {},
    ...overrides,
  };
}

/** `entity`, but sourced from "Test Book" (the tests whose output carries the book name). */
export function testBookEntity(overrides: EntityOverrides): CodexEntity {
  return entity({ source: { book: "Test Book", license: "unknown" }, ...overrides });
}

/** A `CodexEntity` from `book`, with category, slug and name derived from a `category/slug` id. */
export function entityInBook(
  id: string,
  book: string,
  edition: "legacy" | "remaster" = "remaster",
): CodexEntity {
  return {
    id,
    slug: id.split("/")[1] ?? id,
    category: id.split("/")[0] ?? "test",
    name: id,
    edition,
    source: { book, license: "unknown" },
    traits: [],
    body: [],
    facets: {},
  };
}

/** A synthetic (non-fixture) `AonDocMeta`: an ORC remaster doc from "Test Book". */
export function meta(
  overrides: Partial<AonDocMeta> & Pick<AonDocMeta, "aonId" | "category" | "name" | "slug">,
): AonDocMeta {
  return {
    aonUrl: `/Test.aspx?ID=${overrides.aonId}`,
    traits: [],
    primarySource: { book: "Test Book" },
    allSources: [{ book: "Test Book" }],
    license: "ORC",
    edition: "remaster",
    remasterId: [],
    legacyId: [],
    hasMarkdown: false,
    ...overrides,
  };
}

const AON_DATA_FIXTURES = join(import.meta.dirname, "..", "tests", "fixtures", "aon-data");

/** Reads one committed AON search hit from `tests/fixtures/aon-data/<name>.json`. */
export function readAonHit(name: string): AonHit {
  return JSON.parse(readFileSync(join(AON_DATA_FIXTURES, `${name}.json`), "utf8")) as AonHit;
}

/** A `report` callback that keeps each report as a `{cls, detail}` record. */
export function collector(): {
  reports: Array<{ cls: string; detail: string }>;
  report: (cls: string, detail: string) => void;
} {
  const reports: Array<{ cls: string; detail: string }> = [];
  return { reports, report: (cls, detail) => reports.push({ cls, detail }) };
}

/** A `report` callback that keeps each report as one `"cls: detail"` string. */
export function lineCollector(): {
  reports: string[];
  report: (cls: string, detail: string) => void;
} {
  const reports: string[] = [];
  return { reports, report: (cls, detail) => reports.push(`${cls}: ${detail}`) };
}

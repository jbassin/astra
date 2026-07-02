import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  emptyReviewState,
  parseReviewState,
  type ReviewState,
  serializeReviewState,
  upsertConflictResolution,
  upsertDecision,
  upsertRegistryDecision,
} from "./reviewState";

// The cross-language contract gate (B3): the SAME committed fixture must round-trip
// byte-identical here (TS) AND in apps/heartwood-backend (Python review.py). If either
// hand-rolled serializer drifts, this fails. vitest cwd = the app dir.
const SHARED_FIXTURE = path.resolve(
  process.cwd(),
  "../heartwood-backend/tests/fixtures/review-sample.kdl",
);

const SAMPLE: ReviewState = {
  date: "2025-8-28",
  updatedAt: "2026-06-28T14:02:11-04:00",
  decisions: [
    {
      id: "org-iconoclasm-index",
      state: "approved",
      targetPath: "Org/Iconoclasm/index",
      rejectionReason: null,
      decidedAt: "2026-06-28T13:58:02-04:00",
      committedAt: null,
    },
    {
      id: "bestiary-goblinoid",
      state: "rejected",
      targetPath: null,
      rejectionReason: "not-canon",
      decidedAt: "2026-06-28T13:59:40-04:00",
      committedAt: null,
    },
  ],
  conflictResolutions: [
    {
      pageId: "org-iconoclasm-index",
      claim: 'Iconoclasm functions as an "orphanage".',
      resolution: "accepted",
    },
  ],
  registryDecisions: [{ canonical: "Threshold Authority", state: "approved" }],
};

describe("review.kdl round-trip (the cross-language contract gate)", () => {
  it("round-trips the shared fixture byte-identical (must match Python review.py)", () => {
    const fixture = readFileSync(SHARED_FIXTURE, "utf8");
    expect(serializeReviewState(parseReviewState(fixture))).toBe(fixture);
  });

  it("serialize → parse is identity", () => {
    const text = serializeReviewState(SAMPLE);
    expect(parseReviewState(text)).toEqual(SAMPLE);
  });

  it("escapes quotes/backslashes in claims (the hand-rolled writer, B3)", () => {
    const tricky = upsertConflictResolution(
      emptyReviewState("2025-8-28"),
      {
        pageId: "p",
        claim: 'a "quoted" \\ slashy claim',
        resolution: "rejected",
      },
      "now",
    );
    expect(parseReviewState(serializeReviewState(tricky))).toEqual(tricky);
  });
});

describe("resumability + idempotence", () => {
  it("upsertDecision replaces (not duplicates) a prior decision", () => {
    let s = emptyReviewState("2025-8-28");
    s = upsertDecision(
      s,
      {
        id: "p",
        state: "deferred",
        targetPath: null,
        rejectionReason: null,
        decidedAt: "t1",
        committedAt: null,
      },
      "t1",
    );
    s = upsertDecision(
      s,
      {
        id: "p",
        state: "approved",
        targetPath: "Org/X/index",
        rejectionReason: null,
        decidedAt: "t2",
        committedAt: null,
      },
      "t2",
    );
    expect(s.decisions).toHaveLength(1);
    expect(s.decisions[0]?.state).toBe("approved");
    expect(s.updatedAt).toBe("t2");
  });

  it("upsertRegistryDecision is keyed by canonical", () => {
    let s = emptyReviewState("d");
    s = upsertRegistryDecision(s, { canonical: "X", state: "approved" }, "t1");
    s = upsertRegistryDecision(s, { canonical: "X", state: "rejected" }, "t2");
    expect(s.registryDecisions).toEqual([{ canonical: "X", state: "rejected" }]);
  });

  it("an empty store serializes + parses to empty", () => {
    const e = emptyReviewState("2025-8-28");
    expect(parseReviewState(serializeReviewState(e))).toEqual(e);
  });
});

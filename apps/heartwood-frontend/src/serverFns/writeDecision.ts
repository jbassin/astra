// The decision write fns (P4.3): approve/edit/reject/defer a proposal, adjudicate a
// conflict, approve a registry addition — each upserts review.kdl (read-modify-atomic-
// write). Server-side only. NEVER sets committed-at (that's `just heartwood-apply`'s
// alone, the idempotence stamp). No auth (D5) — the dangerous write-BACK is host-gated.

import { createServerFn } from "@tanstack/react-start";
import { readReviewStateText, writeReviewStateText } from "@/domain/review/fs";
import {
  type ConflictResolution,
  type Decision,
  emptyReviewState,
  parseReviewState,
  type RegistryDecision,
  type ReviewState,
  serializeReviewState,
  upsertConflictResolution,
  upsertDecision,
  upsertRegistryDecision,
} from "@/domain/review/reviewState";

function load(date: string): ReviewState {
  const text = readReviewStateText(date);
  return text ? parseReviewState(text) : emptyReviewState(date);
}

function persist(state: ReviewState): ReviewState {
  writeReviewStateText(state.date, serializeReviewState(state));
  return state;
}

export interface SetDecisionInput {
  date: string;
  id: string;
  state: "pending" | "approved" | "rejected" | "deferred";
  targetPath?: string | null;
  rejectionReason?: string | null;
}

/** Set a proposal's decision (approve/reject/defer) + any re-placement target-path. */
export const setDecision = createServerFn({ method: "POST" })
  .validator((input: SetDecisionInput) => input)
  .handler(({ data }): ReviewState => {
    const now = new Date().toISOString();
    const existing = load(data.date).decisions.find((d) => d.id === data.id);
    const decision: Decision = {
      id: data.id,
      state: data.state,
      targetPath: data.targetPath ?? existing?.targetPath ?? null,
      rejectionReason: data.state === "rejected" ? (data.rejectionReason ?? null) : null,
      decidedAt: now,
      committedAt: existing?.committedAt ?? null,
    };
    return persist(upsertDecision(load(data.date), decision, now));
  });

export interface SetConflictInput {
  date: string;
  pageId: string;
  claim: string;
  resolution: "accepted" | "rejected";
}

export const setConflictResolution = createServerFn({ method: "POST" })
  .validator((input: SetConflictInput) => input)
  .handler(({ data }): ReviewState => {
    const c: ConflictResolution = {
      pageId: data.pageId,
      claim: data.claim,
      resolution: data.resolution,
    };
    return persist(upsertConflictResolution(load(data.date), c, new Date().toISOString()));
  });

export interface SetRegistryInput {
  date: string;
  canonical: string;
  state: "approved" | "rejected";
}

export const setRegistryDecision = createServerFn({ method: "POST" })
  .validator((input: SetRegistryInput) => input)
  .handler(({ data }): ReviewState => {
    const r: RegistryDecision = { canonical: data.canonical, state: data.state };
    return persist(upsertRegistryDecision(load(data.date), r, new Date().toISOString()));
  });

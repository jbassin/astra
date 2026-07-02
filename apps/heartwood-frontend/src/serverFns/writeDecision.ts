// The decision write fns (P4.3): approve/edit/reject/defer a proposal, adjudicate a
// conflict, approve a registry addition — each upserts review.kdl (read-modify-atomic-
// write). Server-side only. NEVER sets committed-at (that's `just heartwood-apply`'s
// alone, the idempotence stamp). No auth (D5) — the dangerous write-BACK is host-gated.

import { getLogger, getTracer, lazyCounter } from "@astra/observe";
import { SpanStatusCode } from "@opentelemetry/api";
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

// The human review decisions are the audit trail of wiki approval — trace + log + count
// each one (by type + state) so they're visible in SigNoz (they were previously silent).
const tracer = getTracer("astra.heartwood-frontend");
const log = getLogger("astra.heartwood-frontend");
const decisionCounter = lazyCounter(
  "astra.heartwood-frontend",
  "astra.heartwood.review.decisions",
  {
    description: "Human review decisions written to review.kdl, by type + state",
  },
);

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
  .handler(
    ({ data }): ReviewState =>
      tracer.startActiveSpan(
        "heartwood.setDecision",
        { attributes: { "heartwood.date": data.date, "heartwood.proposal_id": data.id } },
        (span) => {
          try {
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
            const result = persist(upsertDecision(load(data.date), decision, now));
            decisionCounter.add(1, { type: "proposal", state: data.state });
            log.emit({
              severityText: "INFO",
              body: `review ${data.date}: proposal ${data.id} → ${data.state}`,
            });
            return result;
          } catch (err) {
            span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
            throw err;
          } finally {
            span.end();
          }
        },
      ),
  );

export interface SetConflictInput {
  date: string;
  pageId: string;
  claim: string;
  resolution: "accepted" | "rejected";
}

export const setConflictResolution = createServerFn({ method: "POST" })
  .validator((input: SetConflictInput) => input)
  .handler(
    ({ data }): ReviewState =>
      tracer.startActiveSpan(
        "heartwood.setConflictResolution",
        { attributes: { "heartwood.date": data.date, "heartwood.page_id": data.pageId } },
        (span) => {
          try {
            const c: ConflictResolution = {
              pageId: data.pageId,
              claim: data.claim,
              resolution: data.resolution,
            };
            const result = persist(
              upsertConflictResolution(load(data.date), c, new Date().toISOString()),
            );
            decisionCounter.add(1, { type: "conflict", state: data.resolution });
            log.emit({
              severityText: "INFO",
              body: `review ${data.date}: conflict on ${data.pageId} → ${data.resolution}`,
            });
            return result;
          } catch (err) {
            span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
            throw err;
          } finally {
            span.end();
          }
        },
      ),
  );

export interface SetRegistryInput {
  date: string;
  canonical: string;
  state: "approved" | "rejected";
}

export const setRegistryDecision = createServerFn({ method: "POST" })
  .validator((input: SetRegistryInput) => input)
  .handler(
    ({ data }): ReviewState =>
      tracer.startActiveSpan(
        "heartwood.setRegistryDecision",
        { attributes: { "heartwood.date": data.date, "heartwood.canonical": data.canonical } },
        (span) => {
          try {
            const r: RegistryDecision = { canonical: data.canonical, state: data.state };
            const result = persist(
              upsertRegistryDecision(load(data.date), r, new Date().toISOString()),
            );
            decisionCounter.add(1, { type: "registry", state: data.state });
            log.emit({
              severityText: "INFO",
              body: `review ${data.date}: registry ${data.canonical} → ${data.state}`,
            });
            return result;
          } catch (err) {
            span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
            throw err;
          } finally {
            span.end();
          }
        },
      ),
  );

import { useState } from "react";

import { canApprove } from "@/domain/review/canApprove";
import type { PageProposal } from "@/domain/review/manifest";
import type { Decision } from "@/domain/review/reviewState";
import { setDecision } from "@/serverFns/writeDecision";

const REJECTION_REASONS = [
  "out-of-voice",
  "not-canon",
  "wrong-page",
  "hallucinated",
  "already-known",
] as const;

// The top-level akasha sections a create can land in (P4.9 placement). Bestiary is
// opportunistic (created on first use, umbrella §7).
const TOP_FOLDERS = ["Divinity", "Geography", "Org", "Phenomena", "Rules", "Bestiary"];

type DecState = "pending" | "approved" | "rejected" | "deferred";

// The decide controls for one proposal (P4.3). approve / reject(tagged) / defer →
// review.kdl. For a `create` (esp. a needs-placement one) the target-path is editable
// (P4.9 — the human places it); approve is blocked until it leaves needs-placement/, the
// editor's last write has landed on disk, and the body carries real human-authored
// content (FO-5/FO-10's `canApprove` — see domain/review/canApprove.ts). committed-at is
// never set here (apply's job).
export function DecisionFooter({
  proposal,
  date,
  initial,
  source,
  corpusBody,
  savePersisted,
}: {
  proposal: PageProposal;
  date: string;
  initial: Decision | undefined;
  source: string;
  corpusBody: string | null;
  savePersisted: boolean;
}) {
  const [state, setState] = useState<DecState>(initial?.state ?? "pending");
  const [targetPath, setTargetPath] = useState(initial?.targetPath ?? proposal.targetPath);
  const [reason, setReason] = useState<string>(initial?.rejectionReason ?? REJECTION_REASONS[0]);
  const [pending, setPending] = useState(false);

  const needsPlacement = targetPath.startsWith("needs-placement/") || targetPath.trim() === "";
  const approveOk = canApprove({
    op: proposal.op,
    needsPlacement,
    savePersisted,
    source,
    corpusBody,
  });

  async function decide(next: DecState) {
    if (next === "approved" && !approveOk) return;
    setState(next);
    setPending(true);
    try {
      await setDecision({
        data: {
          date,
          id: proposal.id,
          state: next,
          targetPath: proposal.op === "create" ? targetPath : null,
          rejectionReason: next === "rejected" ? reason : null,
        },
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <footer className={`pc-footer pc-decided-${state}`}>
      {proposal.op === "create" ? (
        <label className="pc-place">
          <span>path</span>
          <input
            list={`folders-${proposal.id}`}
            value={targetPath}
            onChange={(e) => setTargetPath(e.target.value)}
            className={needsPlacement ? "pc-place-flag" : ""}
            aria-label="target path"
          />
          <datalist id={`folders-${proposal.id}`}>
            {TOP_FOLDERS.map((f) => (
              <option key={f} value={`${f}/`}>
                {f}/
              </option>
            ))}
          </datalist>
        </label>
      ) : null}

      <div className="pc-actions">
        <button
          type="button"
          className="pc-approve"
          disabled={!approveOk || pending}
          onClick={() => decide("approved")}
          title={
            needsPlacement
              ? "Place the page first"
              : !savePersisted
                ? "Waiting for the last edit to save"
                : !approveOk
                  ? proposal.op === "create"
                    ? "Write the page first"
                    : "No changes to apply"
                  : "Approve"
          }
        >
          Approve
        </button>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label="reject reason"
        >
          {REJECTION_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="pc-reject"
          disabled={pending}
          onClick={() => decide("rejected")}
        >
          Reject
        </button>
        <button
          type="button"
          className="pc-defer"
          disabled={pending}
          onClick={() => decide("deferred")}
        >
          Defer
        </button>
        <span className={`pc-decision pc-decision-${state}`}>{state}</span>
      </div>
    </footer>
  );
}

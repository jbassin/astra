import { useState } from "react";
import { setConflictResolution } from "@/serverFns/writeDecision";

type Res = "accepted" | "rejected" | null;

// Adjudicate a cited fact that CONTRADICTS the existing page (P4.10/P3.17). Accept = the
// page becomes a correction (the human weaves it in the Edit tab); Reject = drop the
// claim, old canon preserved. An unresolved conflict blocks approve (enforced in the
// footer). Mirrors faerrin ConflictCard.
export function ConflictCard({
  date,
  pageId,
  claim,
  initial,
  onResolve,
}: {
  date: string;
  pageId: string;
  claim: string;
  initial: Res;
  onResolve: (res: Res) => void;
}) {
  const [res, setRes] = useState<Res>(initial);

  async function decide(next: "accepted" | "rejected") {
    setRes(next);
    onResolve(next);
    await setConflictResolution({ data: { date, pageId, claim, resolution: next } });
  }

  return (
    <div className={`conflict-card conflict-${res ?? "open"}`}>
      <p className="conflict-claim">{claim}</p>
      <div className="conflict-actions">
        <button
          type="button"
          className={res === "accepted" ? "active" : ""}
          onClick={() => decide("accepted")}
        >
          Accept (correct the page)
        </button>
        <button
          type="button"
          className={res === "rejected" ? "active" : ""}
          onClick={() => decide("rejected")}
        >
          Reject (keep canon)
        </button>
        {res ? (
          <span className="conflict-state">{res}</span>
        ) : (
          <span className="conflict-open">unresolved</span>
        )}
      </div>
    </div>
  );
}

import { useState } from "react";
import type { RegistryAddition, SkippedPage, UnplacedFact } from "@/domain/review/manifest";
import type { RegistryDecision } from "@/domain/review/reviewState";
import { setRegistryDecision } from "@/serverFns/writeDecision";

// Audit + registry panels. Unplaced/Skipped are read-only audit (not actionable —
// surfaced so nothing is silently dropped). Registry additions ARE actionable (P4.8):
// each approved one is applied to entity.kdl by `just heartwood-apply`.

export function UnplacedPanel({ unplaced }: { unplaced: UnplacedFact[] }) {
  if (unplaced.length === 0) return null;
  return (
    <section className="audit-panel">
      <h2>Unplaced facts ({unplaced.length})</h2>
      <p className="audit-note">Ambiguous resolution — surfaced with candidates for the human.</p>
      <ul className="audit-list">
        {unplaced.map((u) => (
          <li key={`${u.subject}:${u.claim}`}>
            <strong>{u.subject}</strong> — {u.claim}
            <span className="audit-cands">
              {u.candidates.map(([name, score]) => (
                <code key={name}>
                  {name} {score.toFixed(2)}
                </code>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SkippedPanel({ skipped }: { skipped: SkippedPage[] }) {
  if (skipped.length === 0) return null;
  return (
    <section className="audit-panel">
      <h2>Skipped pages ({skipped.length})</h2>
      <p className="audit-note">Resolved pages not rewritten — already-known or non-prose.</p>
      <ul className="audit-list">
        {skipped.map((s) => (
          <li key={s.targetPath}>
            <code>{s.targetPath}</code> <span className="audit-reason">{s.reason}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RegistryPanel({
  additions,
  date,
  decisions,
}: {
  additions: RegistryAddition[];
  date: string;
  decisions: RegistryDecision[];
}) {
  if (additions.length === 0) return null;
  const byCanonical = new Map(decisions.map((d) => [d.canonical, d.state]));
  return (
    <section className="audit-panel">
      <h2>Registry additions ({additions.length})</h2>
      <p className="audit-note">
        Proposed new entities — applied to entity.kdl by <code>just heartwood-apply</code> when
        approved.
      </p>
      <ul className="audit-list">
        {additions.map((r) => (
          <RegistryRow
            key={r.canonical}
            date={date}
            addition={r}
            initial={byCanonical.get(r.canonical)}
          />
        ))}
      </ul>
    </section>
  );
}

function RegistryRow({
  date,
  addition,
  initial,
}: {
  date: string;
  addition: RegistryAddition;
  initial: "approved" | "rejected" | undefined;
}) {
  const [state, setState] = useState<"pending" | "approved" | "rejected">(initial ?? "pending");
  async function decide(next: "approved" | "rejected") {
    setState(next);
    await setRegistryDecision({ data: { date, canonical: addition.canonical, state: next } });
  }
  return (
    <li className={`registry-row registry-${state}`}>
      <span>
        <strong>{addition.canonical}</strong>{" "}
        {addition.kind ? <span className="pc-kind">{addition.kind}</span> : null} →{" "}
        <code>{addition.suggestedPath}</code>
      </span>
      <span className="registry-actions">
        <button
          type="button"
          className={state === "approved" ? "active" : ""}
          onClick={() => decide("approved")}
        >
          approve
        </button>
        <button
          type="button"
          className={state === "rejected" ? "active" : ""}
          onClick={() => decide("rejected")}
        >
          reject
        </button>
      </span>
    </li>
  );
}

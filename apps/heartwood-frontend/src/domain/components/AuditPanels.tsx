import type { RegistryAddition, SkippedPage, UnplacedFact } from "@/domain/review/manifest";

// Read-only audit panels (P4: unplaced/skipped/registry-add are audit, not actionable
// in S2). The human acts on `page`/`registry-add`/`conflict` (registry approval lands
// in S4); these surface what the proposer refused to place or rewrite so nothing is
// silently dropped.

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

export function RegistryPanel({ additions }: { additions: RegistryAddition[] }) {
  if (additions.length === 0) return null;
  return (
    <section className="audit-panel">
      <h2>Registry additions ({additions.length})</h2>
      <p className="audit-note">
        Proposed new entities — applied to the registry on approval (S4).
      </p>
      <ul className="audit-list">
        {additions.map((r) => (
          <li key={r.canonical}>
            <strong>{r.canonical}</strong>{" "}
            {r.kind ? <span className="pc-kind">{r.kind}</span> : null} →{" "}
            <code>{r.suggestedPath}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}

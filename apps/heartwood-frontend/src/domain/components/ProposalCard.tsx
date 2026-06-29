import { DocumentView } from "@astra/gothic";
import { parseDocument } from "@astra/vellum-lang";
import type { PageProposal } from "@/domain/review/manifest";

// One proposed page, rendered for review. S2 is read-only — the Reading tab (the
// proposal's `.vellum` body through gothic's DocumentView, exactly as it'll look live)
// plus the cited facts, residual lints, and any flagged conflicts. S3 adds the Edit
// (CodeMirror) + Diff tabs; S4 adds the approve/reject/defer footer.
export function ProposalCard({ proposal, body }: { proposal: PageProposal; body: string }) {
  const doc = parseDocument(body, { mode: "mechanical" });
  return (
    <article className="proposal-card" id={proposal.id}>
      <header className="pc-head">
        <span className={`pc-op pc-op-${proposal.op}`}>{proposal.op}</span>
        <h2 className="pc-title">{proposal.canonical}</h2>
        <code className="pc-path">{proposal.targetPath}</code>
        <span className="pc-tags">
          <span className={`pc-status pc-status-${proposal.status}`}>{proposal.status}</span>
          {proposal.kind ? <span className="pc-kind">{proposal.kind}</span> : null}
        </span>
      </header>

      {proposal.placementNote ? <p className="pc-placement">⚑ {proposal.placementNote}</p> : null}

      {proposal.facts.length > 0 ? (
        <section className="pc-facts">
          <h3>Cited facts</h3>
          <ul>
            {proposal.facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {proposal.conflicts.length > 0 ? (
        <section className="pc-conflicts">
          <h3>Conflicts with the existing page</h3>
          <ul>
            {proposal.conflicts.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {proposal.lints.length > 0 ? (
        <section className="pc-lints">
          {proposal.lints.map((l) => (
            <p key={`${l.type}:${l.message}`} className="pc-lint">
              <span className="pc-lint-type">{l.type}</span> {l.message}
            </p>
          ))}
        </section>
      ) : null}

      <section className="pc-reading">
        <DocumentView document={doc} />
      </section>
    </article>
  );
}

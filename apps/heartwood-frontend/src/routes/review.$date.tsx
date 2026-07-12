import { createFileRoute, Link } from "@tanstack/react-router";

import { RegistryPanel, SkippedPanel, UnplacedPanel } from "@/domain/components/AuditPanels";
import { ProposalCard } from "@/domain/components/ProposalCard";
import type { PageProposal } from "@/domain/review/manifest";
import type { Decision } from "@/domain/review/reviewState";
import { loadReview } from "@/serverFns/loadReview";

// One session's change-set as PR-style cards. S2 is read-only — render every proposed
// page (Reading), then the unplaced/skipped/registry audit panels. S3/S4 add the
// editor, diff, and approve/reject controls.
export const Route = createFileRoute("/review/$date")({
  loader: ({ params }) => loadReview({ data: params.date }),
  head: ({ params }) => ({ meta: [{ title: `${params.date} — Heartwood` }] }),
  component: ReviewComponent,
});

function ReviewComponent() {
  const { manifest, bodies, corpusBodies, knownPages, review } = Route.useLoaderData();
  const decisionById = new Map<string, Decision>(review.decisions.map((d: Decision) => [d.id, d]));
  return (
    <main className="wrap review">
      <nav className="review-nav">
        <Link to="/">← all change-sets</Link>
      </nav>
      <header className="review-head">
        <h1>{manifest.date}</h1>
        <p className="review-sub">
          {manifest.show} · {manifest.world} · {manifest.proposals.length} proposed pages
        </p>
      </header>

      <section className="proposal-list">
        {manifest.proposals.map((p: PageProposal) => (
          <ProposalCard
            key={p.id}
            proposal={p}
            body={bodies[p.id] ?? ""}
            corpusBody={corpusBodies[p.id] ?? null}
            date={manifest.date}
            knownPages={knownPages}
            decision={decisionById.get(p.id)}
          />
        ))}
      </section>

      <UnplacedPanel unplaced={manifest.unplaced} />
      <SkippedPanel skipped={manifest.skipped} />
      <RegistryPanel
        additions={manifest.registryAdditions}
        date={manifest.date}
        decisions={review.registryDecisions}
      />
    </main>
  );
}

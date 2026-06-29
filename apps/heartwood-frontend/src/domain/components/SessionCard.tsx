import { Link } from "@tanstack/react-router";
import type { SessionSummary } from "@/serverFns/loadReview";

// One staged change-set on the index — the session date/show + its headline counts,
// linking to its review page.
export function SessionCard({ session }: { session: SessionSummary }) {
  return (
    <Link to="/review/$date" params={{ date: session.date }} className="session-card">
      <span className="sc-mark">❦</span>
      <h2 className="sc-title">{session.date}</h2>
      <p className="sc-show">
        {session.show} · {session.world}
      </p>
      <p className="sc-counts">
        <strong>{session.pages}</strong> pages ({session.creates} create / {session.rewrites}{" "}
        rewrite) · {session.registryAdds} registry · {session.unplaced} unplaced · {session.skipped}{" "}
        skipped
      </p>
    </Link>
  );
}

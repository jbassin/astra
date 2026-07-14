import { createFileRoute } from "@tanstack/react-router";

// S2 placeholder (spec D29-27's category directory + A–Z listings are S3): every
// entity is already reachable directly at `/{category}/{slug}` (D29-22), so this
// stays a minimal, non-error landing page rather than a hard 404 at "/" until the
// real listing lands.
export const Route = createFileRoute("/")({
  component: IndexComponent,
});

function IndexComponent() {
  return (
    <main className="wrap">
      <h1 className="hero-title">codex</h1>
      <p className="hero-lede">
        A Pathfinder Second Edition rules &amp; compendium reference. Every entity lives at{" "}
        <code>
          /{"{category}"}/{"{slug}"}
        </code>{" "}
        — e.g. <a href="/creature/red-dragon-adult">/creature/red-dragon-adult</a> or{" "}
        <a href="/spell/heal">/spell/heal</a>. A browsable category directory lands in a follow-up
        slice.
      </p>
    </main>
  );
}

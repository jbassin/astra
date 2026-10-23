import { createFileRoute } from "@tanstack/react-router";

import ClientOnly from "@/components/ClientOnly/ClientOnly";
import { ReadingSurface } from "@/domain/components/ReadingSurface";
import { SITE } from "@/generated/site";

// The live draw (harrow's ReadingView). The draw uses Math.random, so it runs ONLY
// client-side (Decision D): SSR renders the deterministic fallback, and ReadingSurface
// hydrates + draws on mount. No hydration mismatch.
export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  return (
    <ClientOnly fallback={<DrawFallback />}>
      <ReadingSurface />
    </ClientOnly>
  );
}

function DrawFallback() {
  return (
    <main className="wrap" style={{ textAlign: "center" }}>
      <section className="hero">
        <p className="hero-kicker">Transmission</p>
        <h1 className="hero-title">{SITE.title}</h1>
        <p className="hero-lede" style={{ marginInline: "auto" }}>
          Shuffling the deck…
        </p>
      </section>
    </main>
  );
}

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  // Scaffold placeholder — the faction-map MapView lifts in a later slice.
  return (
    <main className="gothic-content">
      <h1>The Strider</h1>
      <p>Faction map — scaffold online.</p>
    </main>
  );
}

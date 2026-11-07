import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  return (
    <main className="wrap">
      <h1>Character builder</h1>
      <p className="lede">
        This site walks you through making your first D&amp;D character. Open the personal link your
        DM sent you to start, or to pick up where you left off.
      </p>
    </main>
  );
}

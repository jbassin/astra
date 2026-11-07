import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  return (
    <main className="wrap">
      <h1>Character builder</h1>
      <p className="lede">
        This site walks you through making your first D&amp;D character, one choice at a time. You
        don’t need a rulebook: every choice explains itself, and at the end you get a sheet that
        tells you what to roll.
      </p>
      <p>
        To make your real character, open the personal link your DM sent you. It saves as you go, so
        the same link picks up where you left off.
      </p>
      <p className="home-try">
        Just curious? <Link to="/test">Try a practice character</Link>. Nothing in test mode is
        saved.
      </p>
    </main>
  );
}

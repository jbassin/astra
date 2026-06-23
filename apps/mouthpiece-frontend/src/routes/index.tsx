import { createFileRoute } from "@tanstack/react-router";
import { EPISODES, SITE } from "@/generated/episodes";

// The episode grid (slice 2 skeleton). The real masthead + hero (count + summed
// runtime) + EpisodeCard grid land in slice 4; for now this renders the catalog
// count from the generated module so the SSR skeleton boots end to end.
export const Route = createFileRoute("/")({
  loader: () => ({ count: EPISODES.length }),
  component: HomeComponent,
});

function HomeComponent() {
  const { count } = Route.useLoaderData();
  return (
    <main className="masthead">
      <h1>{SITE.title}</h1>
      <p>{SITE.description}</p>
      {count === 0 ? (
        <p className="empty-state">No episodes yet.</p>
      ) : (
        <p>
          {count} episode{count === 1 ? "" : "s"}
        </p>
      )}
    </main>
  );
}

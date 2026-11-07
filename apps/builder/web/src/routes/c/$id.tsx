import { createFileRoute, notFound } from "@tanstack/react-router";

import { BuilderFlow } from "@/components/BuilderFlow";
import { getPlayerPage } from "@/server/builderFns";

export const Route = createFileRoute("/c/$id")({
  loader: async ({ params }) => {
    const page = await getPlayerPage({ data: { id: params.id } });
    if (!page) throw notFound();
    return page;
  },
  // Each visit reads the saved answers fresh, so a reopened link resumes where it stopped.
  staleTime: 0,
  component: PlayerComponent,
  notFoundComponent: UnknownLink,
});

function PlayerComponent() {
  const { id } = Route.useParams();
  const page = Route.useLoaderData();
  return <BuilderFlow id={id} playerName={page.name} initial={page.character?.answers ?? {}} />;
}

function UnknownLink() {
  return (
    <main className="route-boundary">
      <h1>We couldn’t find that character</h1>
      <p>This link doesn’t match anyone. Check that you copied the whole link your DM sent you.</p>
    </main>
  );
}

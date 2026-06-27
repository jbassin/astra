import { createFileRoute, notFound } from "@tanstack/react-router";
import { ShowChronicle } from "@/domain/components/Chronicle";
import { SHOWS } from "@/generated/chronicle";

// /chronicle/<show> — one show's seasons + episodes (0019).
export const Route = createFileRoute("/chronicle/$show")({
  loader: ({ params }) => {
    const show = SHOWS.find((s) => s.show === params.show);
    if (!show) throw notFound();
    return { slug: `chronicle/${show.show}`, show };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.show.name ?? "Chronicle"} — Chronicle — Akasha` }],
  }),
  component: ShowChroniclePage,
});

function ShowChroniclePage() {
  const { show } = Route.useLoaderData();
  return <ShowChronicle show={show} />;
}

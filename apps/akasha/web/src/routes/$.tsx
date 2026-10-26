import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { ContentArticle } from "@/domain/components/ContentArticle";
import { FolderListing } from "@/domain/components/FolderListing";
import { getWikiPage } from "@/domain/lib/pageDataFns";

// The root catch-all — owns the whole namespace below "/" the way faerrin's
// [...slug].astro did: content pages, folder listings (Foo and Foo/index both land
// here), and alias redirect stubs. Tag pages live under their own /tags routes.
export const Route = createFileRoute("/$")({
  // The page data comes from a server function, so the wiki bodies stay out of the
  // client bundle: SSR runs it inline, a client navigation fetches it.
  loader: async ({ params, location }) => {
    const page = await getWikiPage({ data: params._splat ?? "" });
    if (!page) throw notFound();
    // A client navigation to an alias follows it at once. SSR still renders the
    // meta-refresh stub, which the Popover and old bookmarks expect.
    if (page.kind === "alias" && typeof window !== "undefined") {
      const to = new URL(page.redirUrl, new URL(location.pathname, window.location.origin));
      throw redirect({ href: to.pathname + to.search + to.hash, replace: true });
    }
    return page;
  },
  head: ({ loaderData }) =>
    loaderData ? { meta: [{ title: `${loaderData.title} — Akasha` }] } : {},
  component: CatchAll,
});

function CatchAll() {
  const data = Route.useLoaderData();
  if (data.kind === "content") return <ContentArticle view={data.view} />;
  if (data.kind === "folder") return <FolderListing view={data.view} />;
  return <AliasRedirect redirUrl={data.redirUrl} ogSlug={data.ogSlug} />;
}

// Alias redirect stub: a `<meta http-equiv="refresh">` page, NOT a server 301
// (Popover fetchCanonical + bookmarks rely on the meta-refresh HTML). React 19 hoists
// the title/link/meta into <head>; the meta-refresh fires before the body shows.
function AliasRedirect({ redirUrl, ogSlug }: { redirUrl: string; ogSlug: string }) {
  return (
    <>
      <title>{ogSlug}</title>
      <link rel="canonical" href={redirUrl} />
      <meta name="robots" content="noindex" />
      <meta httpEquiv="refresh" content={`0; url=${redirUrl}`} />
      <main className="center">
        <article className="popover-hint">
          <p>
            Redirecting to <a href={redirUrl}>{ogSlug}</a>…
          </p>
        </article>
      </main>
    </>
  );
}

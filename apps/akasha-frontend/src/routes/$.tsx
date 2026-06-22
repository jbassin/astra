import { createFileRoute, notFound } from "@tanstack/react-router";
import { ContentArticle } from "@/domain/components/ContentArticle";
import { FolderListing } from "@/domain/components/FolderListing";
import { contentView, folderView, resolvePath } from "@/domain/lib/runtimeSite";
import { transcriptBody } from "@/domain/lib/transcriptBodyFn";

// The root catch-all — owns the whole namespace below "/" the way faerrin's
// [...slug].astro did: content pages, folder listings (Foo and Foo/index both land
// here), and alias redirect stubs. Tag pages live under their own /tags routes.
export const Route = createFileRoute("/$")({
  loader: async ({ params }) => {
    const resolved = resolvePath(params._splat ?? "");
    if (!resolved) throw notFound();
    if (resolved.kind === "content") {
      const view = contentView(resolved.slug);
      // Transcript bodies aren't in the BODIES bundle; fetch the code-split body
      // server-side (full-page nav → loader runs on the server).
      if (view.transcript) view.bodyHtml = await transcriptBody({ data: view.slug });
      return { kind: "content" as const, slug: view.slug, title: view.title, view };
    }
    if (resolved.kind === "folder") {
      const view = folderView(resolved.folder);
      return { kind: "folder" as const, slug: view.slug, title: view.title, view };
    }
    return {
      kind: "alias" as const,
      slug: resolved.ogSlug,
      title: resolved.ogSlug,
      redirUrl: resolved.redirUrl,
      ogSlug: resolved.ogSlug,
    };
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

// Alias redirect stub (N2): a `<meta http-equiv="refresh">` page, NOT a server 301
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

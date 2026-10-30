// A folder page (ports the folder branch of faerrin's [...slug].astro). A folder below a
// section with its own index page reads as a wiki page: the wiki head (crumbs, title, the
// facts row), the index's body, then its children under "In <title>". A section's own folder
// (`/Org`) and a folder with no index keep the listing head and the count over the rows. Both
// carry the wiki rail (contents, sessions, mentioned on) when it has something to show.
import { ArticleTitle } from "@/domain/components/ArticleTitle";
import { Breadcrumbs } from "@/domain/components/Breadcrumbs";
import { ContentMeta } from "@/domain/components/ContentMeta";
import { type ListCrumb, ListingHead } from "@/domain/components/ListingHead";
import { PageLayout } from "@/domain/components/PageLayout";
import { PageList } from "@/domain/components/PageList";
import { RenderedBody } from "@/domain/components/RenderedBody";
import { WikiRail } from "@/domain/components/WikiRail";
import { pagesLabel } from "@/domain/lib/listingFormat";
import type { ListingFolderView } from "@/domain/lib/pageData";
import type { Crumb } from "@/domain/lib/runtimeSite";
import { sectionOf } from "@/domain/lib/sections";

/**
 * The folder's crumbs without "Home": the top folder shows as its section, in its hue. A
 * top-level folder (the section's own page) shows none, since the title already names it.
 */
function folderCrumbs(folder: string, crumbs: Crumb[]): ListCrumb[] {
  const rest = crumbs.slice(1);
  if (rest.length <= 1) return [];
  const section = sectionOf(folder.split("/")[0] ?? "");
  return rest.map((c, i) => ({
    label: i === 0 && section ? section.label : c.displayName,
    href: c.path || undefined,
    hue: i === 0 ? section?.hue : undefined,
  }));
}

/** A folder index below a section, read as a wiki page with its children after the body. */
function WikiFolder({ view }: { view: ListingFolderView }) {
  return (
    <>
      {/* .popover-hint marks what the Popover island copies into a hover preview. */}
      <header className="ak-article-head popover-hint">
        <Breadcrumbs crumbs={view.crumbs} />
        <ArticleTitle title={view.title} />
        <ContentMeta tags={view.tags} date={view.date} />
      </header>
      <RenderedBody className="ak-article" html={view.bodyHtml} />
      {view.entries.length > 0 && (
        <section className="ak-listing ak-children" aria-labelledby="ak-children-title">
          <h2 id="ak-children-title" className="ak-children-title">{`In ${view.title}`}</h2>
          <PageList entries={view.entries} />
        </section>
      )}
    </>
  );
}

export function FolderListing({ view }: { view: ListingFolderView }) {
  const crumbs = folderCrumbs(view.folder, view.crumbs);
  // A campaign's folder lists its transcripts; every other folder lists pages.
  const transcripts =
    sectionOf(view.folder)?.id === "sessions" && view.entries.every((e) => !e.isFolder);
  const rail = <WikiRail toc={view.toc} sessions={view.sessions} backlinks={view.backlinks} />;
  if (crumbs.length > 0 && view.bodyHtml) {
    return (
      <PageLayout rightSidebar={rail}>
        <WikiFolder view={view} />
      </PageLayout>
    );
  }
  return (
    <PageLayout rightSidebar={rail}>
      <ListingHead crumbs={crumbs} title={view.title} />
      {view.bodyHtml && <RenderedBody className="ak-folder-body" html={view.bodyHtml} />}
      <section className="ak-listing" aria-label={`Pages in ${view.title}`}>
        <p className="ak-listing-count">{pagesLabel(view.entries.length, transcripts)}</p>
        <PageList entries={view.entries} />
      </section>
    </PageLayout>
  );
}

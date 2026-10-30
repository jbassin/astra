// A folder page: crumbs, the folder's title, the folder index's own body (when it has an
// index page), then a row per child page or subfolder (ports the folder branch of faerrin's
// [...slug].astro).
import { type ListCrumb, ListingHead } from "@/domain/components/ListingHead";
import { PageLayout } from "@/domain/components/PageLayout";
import { PageList } from "@/domain/components/PageList";
import { RenderedBody } from "@/domain/components/RenderedBody";
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

export function FolderListing({ view }: { view: ListingFolderView }) {
  // A campaign's folder lists its transcripts; every other folder lists pages.
  const transcripts =
    sectionOf(view.folder)?.id === "sessions" && view.entries.every((e) => !e.isFolder);
  return (
    <PageLayout>
      <ListingHead crumbs={folderCrumbs(view.folder, view.crumbs)} title={view.title} />
      {view.bodyHtml && <RenderedBody className="ak-folder-body" html={view.bodyHtml} />}
      <section className="ak-listing" aria-label={`Pages in ${view.title}`}>
        <p className="ak-listing-count">{pagesLabel(view.entries.length, transcripts)}</p>
        <PageList entries={view.entries} />
      </section>
    </PageLayout>
  );
}

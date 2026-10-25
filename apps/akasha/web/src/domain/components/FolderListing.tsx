// A folder listing page: breadcrumbs ❯ folder title, then the child page list
// (ports the folder branch of faerrin's [...slug].astro). If the folder has an
// index.vellum, its body renders above the listing.
import { ArticleTitle } from "@/domain/components/ArticleTitle";
import { Breadcrumbs } from "@/domain/components/Breadcrumbs";
import { PageLayout } from "@/domain/components/PageLayout";
import { PageList } from "@/domain/components/PageList";
import type { FolderView } from "@/domain/lib/runtimeSite";

export function FolderListing({ view }: { view: FolderView }) {
  return (
    <PageLayout>
      <div className="page-header">
        <div className="popover-hint">
          <Breadcrumbs crumbs={view.crumbs} />
          <ArticleTitle title={view.title} />
        </div>
      </div>
      <div className="popover-hint">
        {/* the folder index's own vellum body (if any) renders above the listing */}
        {/* oxlint-disable-next-line react/no-danger -- body HTML rendered at build time from the wiki */}
        <article data-pagefind-body dangerouslySetInnerHTML={{ __html: view.bodyHtml }} />
        <div className="page-listing">
          <p>{view.itemsLabel}</p>
          <div>
            <PageList entries={view.entries} />
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

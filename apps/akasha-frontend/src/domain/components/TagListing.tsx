// Tag pages (ports faerrin tags/[...tag].astro). The tag index lists every tag with
// its first 10 pages; a tag page lists pages carrying that tag. Tag pages have NO
// breadcrumbs (Quartz's Breadcrumbs returns null for the tags namespace).
import { ArticleTitle } from "@/domain/components/ArticleTitle";
import { PageLayout } from "@/domain/components/PageLayout";
import { PageList } from "@/domain/components/PageList";
import type { TagIndexView, TagView } from "@/domain/lib/runtimeSite";

export function TagPage({ view }: { view: TagView }) {
  return (
    <PageLayout>
      <div className="page-header">
        <div className="popover-hint">
          <ArticleTitle title={view.title} />
        </div>
      </div>
      <div className="popover-hint">
        <article />
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

export function TagIndex({ view }: { view: TagIndexView }) {
  return (
    <PageLayout>
      <div className="page-header">
        <div className="popover-hint">
          <ArticleTitle title={view.title} />
        </div>
      </div>
      <div className="popover-hint">
        <article />
        <p>{view.totalLabel}</p>
        <div>
          {view.sections.map((s) => {
            const total = s.entries.length + s.overflow;
            return (
              <div key={s.tag}>
                <h2>
                  <a className="internal tag-link" href={s.href}>
                    {s.tag}
                  </a>
                </h2>
                <div className="page-listing">
                  <p>
                    {total === 1 ? "1 item with this tag" : `${total} items with this tag`}
                    {s.overflow > 0 && <span>{` (showing first ${s.entries.length})`}</span>}
                  </p>
                  <PageList entries={s.entries} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </PageLayout>
  );
}

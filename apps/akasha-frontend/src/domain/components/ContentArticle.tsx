// A wiki content page: breadcrumbs ❯ title ❯ tags, then the article body and
// backlinks (ports the content branch of faerrin's [...slug].astro). The vellum
// body itself renders in slice 4 (gothic DocumentView via resolveCrossref); slice 3
// emits the `data-pagefind-body` article container the renderer + Pagefind index
// will fill. ContentMeta (date + reading time) also lands in slice 4 (needs the body).
import { ArticleTitle } from "@/domain/components/ArticleTitle";
import { Backlinks } from "@/domain/components/Backlinks";
import { Breadcrumbs } from "@/domain/components/Breadcrumbs";
import { PageLayout } from "@/domain/components/PageLayout";
import { TagList } from "@/domain/components/TagList";
import type { ContentView } from "@/domain/lib/runtimeSite";

export function ContentArticle({ view }: { view: ContentView }) {
  return (
    <PageLayout>
      <div className="page-header">
        <div className="popover-hint">
          {view.showBreadcrumbs && <Breadcrumbs crumbs={view.crumbs} />}
          <ArticleTitle title={view.title} />
          <TagList tags={view.tags} />
        </div>
      </div>
      {/* slice 4: gothic DocumentView(parseDocument(.vellum)) fills this container */}
      <article className="popover-hint" data-pagefind-body />
      <Backlinks backlinks={view.backlinks} />
    </PageLayout>
  );
}

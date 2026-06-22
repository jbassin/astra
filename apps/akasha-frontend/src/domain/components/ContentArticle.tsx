// A wiki content page: breadcrumbs ❯ title ❯ tags, then the article body and
// backlinks (ports the content branch of faerrin's [...slug].astro). The vellum
// body itself renders in slice 4 (gothic DocumentView via resolveCrossref); slice 3
// emits the `data-pagefind-body` article container the renderer + Pagefind index
// will fill. ContentMeta (date + reading time) also lands in slice 4 (needs the body).
import { ArticleTitle } from "@/domain/components/ArticleTitle";
import { Backlinks } from "@/domain/components/Backlinks";
import { Breadcrumbs } from "@/domain/components/Breadcrumbs";
import { ContentMeta } from "@/domain/components/ContentMeta";
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
          {view.bodyHtml && <ContentMeta date={view.date} minutes={view.readingMinutes} />}
          <TagList tags={view.tags} />
        </div>
      </div>
      {/* The build-rendered vellum body (gothic DocumentView + resolved crossref hrefs,
          N3). dangerouslySetInnerHTML: the HTML is static + author-trusted (the akasha
          corpus, build-time). data-pagefind-body scopes the slice-8 search index. */}
      <article
        className="popover-hint"
        data-pagefind-body
        // biome-ignore lint/security/noDangerouslySetInnerHtml: build-rendered trusted vellum
        dangerouslySetInnerHTML={{ __html: view.bodyHtml }}
      />
      <Backlinks backlinks={view.backlinks} />
    </PageLayout>
  );
}

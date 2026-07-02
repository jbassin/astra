// A wiki content page: breadcrumbs ❯ title ❯ meta ❯ tags, then the article body;
// the right sidebar carries the optional frontmatter image + backlinks (ports the
// content branch of faerrin's [...slug].astro + its quartz.layout right rail).
import { ArticleTitle } from "@/domain/components/ArticleTitle";
import { Backlinks } from "@/domain/components/Backlinks";
import { Breadcrumbs } from "@/domain/components/Breadcrumbs";
import { ContentMeta } from "@/domain/components/ContentMeta";
import { TranscriptPlayer } from "@/domain/components/islands/TranscriptPlayer";
import { PageLayout } from "@/domain/components/PageLayout";
import { SidebarImage } from "@/domain/components/SidebarImage";
import { TagList } from "@/domain/components/TagList";
import type { ContentView } from "@/domain/lib/runtimeSite";

export function ContentArticle({ view }: { view: ContentView }) {
  return (
    <PageLayout
      rightSidebar={
        <>
          <SidebarImage img={view.img} />
          <Backlinks backlinks={view.backlinks} />
        </>
      }
    >
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
        dangerouslySetInnerHTML={{ __html: view.bodyHtml }}
      />
      {/* Progressive-enhancement: attaches to the SSR-emitted transcript markup on
          Script pages; a no-op (returns null, binds nothing) on every other page. */}
      <TranscriptPlayer />
    </PageLayout>
  );
}

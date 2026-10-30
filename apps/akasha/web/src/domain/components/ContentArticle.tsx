// A wiki content page: the page head (crumbs, title, the facts row of tags and date), then
// the build-rendered body; the right rail carries the page's picture, "On this page",
// "Sessions" and "Mentioned on" (WikiRail), then PageLayout's graph. The look is wiki.css.
import { ArticleTitle } from "@/domain/components/ArticleTitle";
import { Breadcrumbs } from "@/domain/components/Breadcrumbs";
import { ContentMeta } from "@/domain/components/ContentMeta";
import { TranscriptPlayer } from "@/domain/components/islands/TranscriptPlayer";
import { PageLayout } from "@/domain/components/PageLayout";
import { WikiRail } from "@/domain/components/WikiRail";
import type { ContentView } from "@/domain/lib/runtimeSite";

export function ContentArticle({ view }: { view: ContentView }) {
  return (
    <PageLayout
      rightSidebar={
        <WikiRail
          img={view.img}
          toc={view.toc}
          sessions={view.sessions}
          backlinks={view.backlinks}
        />
      }
    >
      {/* .popover-hint marks what the Popover island copies into a hover preview. */}
      <header className="ak-article-head popover-hint">
        {view.showBreadcrumbs && <Breadcrumbs crumbs={view.crumbs} />}
        <ArticleTitle title={view.title} />
        <ContentMeta tags={view.tags} date={view.date} />
      </header>
      {/* The build-rendered vellum body (gothic DocumentView + resolved crossref hrefs,
          N3, decorated with link sections and heading ids). dangerouslySetInnerHTML: the
          HTML is static + author-trusted (the akasha corpus, build-time).
          data-pagefind-body scopes the search index. */}
      <article
        className="ak-article popover-hint"
        data-pagefind-body
        // oxlint-disable-next-line react/no-danger -- body HTML rendered at build time from the wiki
        dangerouslySetInnerHTML={{ __html: view.bodyHtml }}
      />
      {/* Progressive-enhancement: attaches to the SSR-emitted transcript markup on
          Script pages; a no-op (returns null, binds nothing) on every other page. */}
      <TranscriptPlayer />
    </PageLayout>
  );
}

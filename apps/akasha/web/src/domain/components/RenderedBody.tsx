// A wiki page's body, rendered to static HTML at build time (gothic DocumentView with resolved
// wiki links): the home page's front-page handout and a folder index's own body. The HTML is
// author-trusted (the akasha corpus, build-time). `data-pagefind-body` scopes the search index;
// `popover-hint` is what the Popover island lifts from a fetched page.
export function RenderedBody({ html, className }: { html: string; className?: string }) {
  return (
    <article
      className={className ? `${className} popover-hint` : "popover-hint"}
      data-pagefind-body
      // oxlint-disable-next-line react/no-danger -- body HTML rendered at build time from the wiki
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

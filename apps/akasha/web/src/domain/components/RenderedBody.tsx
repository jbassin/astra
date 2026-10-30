// A page's body, rendered to static HTML at build time (gothic DocumentView with resolved
// wiki links, or a transcript's lines): the home page's front-page handout, a folder index's
// own body and a transcript. The HTML is author-trusted (the akasha corpus, build-time).
// `data-pagefind-body` scopes the search index; `popover-hint` is what the Popover island
// lifts from a fetched page, so a transcript (about 1 MB of lines) passes `popover={false}`.
export function RenderedBody({
  html,
  className,
  popover = true,
}: {
  html: string;
  className?: string;
  popover?: boolean;
}) {
  const classes = [className, popover ? "popover-hint" : null].filter(Boolean).join(" ");
  return (
    <article
      className={classes || undefined}
      data-pagefind-body
      // oxlint-disable-next-line react/no-danger -- body HTML rendered at build time from the wiki
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

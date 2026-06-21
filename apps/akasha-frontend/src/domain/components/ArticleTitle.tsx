// Ports faerrin ArticleTitle.astro. Quartz's FrontMatter transformer always
// populates a title (frontmatter or filename stem), so this always renders.
export function ArticleTitle({ title }: { title: string }) {
  return <h1 className="article-title">{title}</h1>;
}

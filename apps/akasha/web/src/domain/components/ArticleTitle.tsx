// The page title (Literata, wiki.css `.ak-title`). Quartz's FrontMatter transformer always
// populates a title (frontmatter or filename stem), so this always renders.
export function ArticleTitle({ title }: { title: string }) {
  return <h1 className="ak-title">{title}</h1>;
}

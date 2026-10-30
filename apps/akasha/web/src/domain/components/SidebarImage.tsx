// The page's picture from the `img` frontmatter (remote or local), as the first right-rail
// block.
export function SidebarImage({ img }: { img?: string }) {
  if (!img) return null;
  return (
    <section className="ak-rail-block ak-rail-image">
      <img src={img} alt="" width={256} height={326} />
    </section>
  );
}

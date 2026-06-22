// Ports faerrin Image.astro: the sidebar image from the `img` frontmatter (remote or
// local). Rendered DesktopOnly in the right sidebar.
export function SidebarImage({ img }: { img?: string }) {
  if (!img) return null;
  return (
    <div className="sidebar-image desktop-only">
      <img src={img} alt="" width={256} height={326} />
    </div>
  );
}

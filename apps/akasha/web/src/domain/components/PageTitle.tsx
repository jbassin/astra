// Site name in the left sidebar, linking home. Ports faerrin PageTitle.astro
// (pathToRoot → an absolute "/" here, since the sidebar is chrome, not parity-gated).
import { SITE } from "@/generated/site";

export function PageTitle() {
  return (
    <h2 className="page-title">
      <a href="/">{SITE.title}</a>
    </h2>
  );
}

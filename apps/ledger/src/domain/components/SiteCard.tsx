import type { SiteLink } from "@/domain/lib/types";

// One site in the landing grid: a gothic panel that is itself the link (a full-card
// anchor). External cross-origin link to the target site's public-origin (config).
export function SiteCard({ site }: { site: SiteLink }) {
  return (
    <a className="site-card" href={site.href}>
      <span className="site-card-mark" aria-hidden="true">
        ✦
      </span>
      <h2 className="site-card-title">{site.title}</h2>
      <p className="site-card-blurb">{site.blurb}</p>
      <span className="site-card-host">{hostOf(site.href)}</span>
    </a>
  );
}

// Display the bare host (e.g. "strider.iridi.cc") as the card's footer label.
function hostOf(href: string): string {
  try {
    return new URL(href).host;
  } catch {
    return href;
  }
}

// The head of a listing page (Sessions, folder and tag pages, the error pages): plain-text
// crumbs with "/" between them (the section crumb in its hue, the same look as the wiki
// page's crumbs), an optional faint label before the title ("Tag"), the title, then whatever
// the page adds (a lede, a facts row).
import type { ReactNode } from "react";

export interface ListCrumb {
  label: string;
  /** Omitted for the current page. */
  href?: string;
  /** A section's hue (`var(--ak-<id>)`) for the section crumb. */
  hue?: string;
}

export function ListCrumbs({ crumbs }: { crumbs?: ListCrumb[] }) {
  if (!crumbs || crumbs.length === 0) return null;
  return (
    <nav className="ak-list-crumbs" aria-label="Breadcrumbs">
      {crumbs.map((c, i) => (
        <span key={`${c.label}|${c.href ?? ""}`} className="ak-list-crumb">
          {i > 0 && <span aria-hidden="true">/</span>}
          {c.href ? (
            <a
              href={c.href}
              className={c.hue ? "is-section" : undefined}
              style={c.hue ? { "--hue": c.hue } : undefined}
            >
              {c.label}
            </a>
          ) : (
            <span aria-current="page">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function ListingHead({
  crumbs,
  label,
  title,
  children,
}: {
  crumbs?: ListCrumb[];
  /** A faint word before the title ("Tag"). */
  label?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="ak-list-head">
      <ListCrumbs crumbs={crumbs} />
      {label && <p className="ak-list-label">{label}</p>}
      <h1 className="ak-list-title">{title}</h1>
      {children}
    </header>
  );
}

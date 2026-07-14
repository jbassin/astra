import type { ReactElement } from "react";

import type { CodexEntity } from "../../schema/entity";

/**
 * D29-22/-26 — every page shows an edition pill; a legacy member with
 * `remasteredAs` shows a banner linking the remaster member(s); a remaster
 * member with `legacyOf` shows a compact "legacy version" link.
 */
export function EditionPill({ entity }: { entity: CodexEntity }): ReactElement {
  return (
    <span className={`codex-edition-pill codex-edition-${entity.edition}`}>
      {entity.edition === "remaster" ? "Remaster" : "Legacy"}
    </span>
  );
}

function EntityIdLink({ id }: { id: string }): ReactElement {
  return (
    <a href={`/${id}`} data-crossref="" data-crossref-target={id}>
      {id}
    </a>
  );
}

export function EditionBanner({ entity }: { entity: CodexEntity }): ReactElement | null {
  if (entity.remasteredAs !== undefined && entity.remasteredAs.length > 0) {
    return (
      <div className="codex-edition-banner codex-edition-banner-legacy" data-remastered-as="">
        This is the legacy version.{" "}
        {entity.remasteredAs.map((id, i) => (
          <span key={id}>
            {i > 0 ? ", " : ""}
            <EntityIdLink id={id} />
          </span>
        ))}
      </div>
    );
  }
  if (entity.legacyOf !== undefined && entity.legacyOf.length > 0) {
    return (
      <div className="codex-edition-banner codex-edition-banner-remaster" data-legacy-of="">
        {entity.legacyOf.map((id, i) => (
          <span key={id}>
            {i > 0 ? ", " : ""}
            <EntityIdLink id={id} />
          </span>
        ))}{" "}
        (legacy version)
      </div>
    );
  }
  return null;
}

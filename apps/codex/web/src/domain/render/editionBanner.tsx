import type { CodexEntity } from "@astra/codex-corpus";
import type { ReactElement } from "react";

import { EditionIcon } from "../../ui";
import type { RenderCtx } from "./nodes";

/**
 * Every page shows an edition icon; a legacy member with
 * `remasteredAs` shows a banner linking the remaster member(s); a remaster
 * member with `legacyOf` shows a compact "legacy version" link.
 */
export function EditionPill({ entity }: { entity: CodexEntity }): ReactElement {
  return <EditionIcon edition={entity.edition} />;
}

/**
 * The pointer-box name: `Name (Book)` resolved via
 * `ctx.resolveEmbed` (the SAME depth-0 embed-prefetch map `entityPageData
 * .ts`'s `entityEmbedTargetIds` now also seeds with `remasteredAs`/
 * `legacyOf` ids — no second server round-trip). Raw-id fail-soft when the
 * target isn't in the map: ingest's edition-pointer stripping keeps
 * genuine dangling pointers near-zero, so this is belt-and-braces, not the
 * common case.
 */
function EntityIdLink({ id, ctx }: { id: string; ctx: RenderCtx }): ReactElement {
  const target = ctx.resolveEmbed(id);
  return (
    <a href={`/${id}`} data-crossref="" data-crossref-target={id}>
      {target ? `${target.name} (${target.source.book})` : id}
    </a>
  );
}

export function EditionBanner({
  entity,
  ctx,
}: {
  entity: CodexEntity;
  ctx: RenderCtx;
}): ReactElement | null {
  if (entity.remasteredAs !== undefined && entity.remasteredAs.length > 0) {
    return (
      <div
        className="codex-callout-blue codex-edition-banner codex-edition-banner-legacy"
        data-remastered-as=""
      >
        This is the legacy version.{" "}
        {entity.remasteredAs.map((id, i) => (
          <span key={id}>
            {i > 0 ? ", " : ""}
            <EntityIdLink id={id} ctx={ctx} />
          </span>
        ))}
      </div>
    );
  }
  if (entity.legacyOf !== undefined && entity.legacyOf.length > 0) {
    return (
      <div
        className="codex-callout-blue codex-edition-banner codex-edition-banner-remaster"
        data-legacy-of=""
      >
        {entity.legacyOf.map((id, i) => (
          <span key={id}>
            {i > 0 ? ", " : ""}
            <EntityIdLink id={id} ctx={ctx} />
          </span>
        ))}{" "}
        (legacy version)
      </div>
    );
  }
  return null;
}

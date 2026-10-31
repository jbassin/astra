/** @jsxRuntime automatic @jsxImportSource react */
import type { Image as ImageNode } from "mdast";
import { type ReactElement, useContext } from "react";

import { type ImageResolution, ImageResolverContext, isSameOriginPath } from "../imageResolver";

/** The app's resolution for a Markdown image, or null: no resolver, unknown or unsafe. */
function useResolvedImage(node: ImageNode): ImageResolution | null {
  const resolution = useContext(ImageResolverContext)?.(node.url) ?? null;
  return resolution && isSameOriginPath(resolution.src) ? resolution : null;
}

function Img({ node, image }: { node: ImageNode; image: ImageResolution }): ReactElement {
  return (
    <img
      className="gothic-image"
      src={image.src}
      alt={node.alt ?? ""}
      width={image.width}
      height={image.height}
      loading="lazy"
      decoding="async"
    />
  );
}

/**
 * An image inside running text (`… see ![the map](map.png) for …`). It renders as an
 * `<img>` only when the app ships the file (`<DocumentView resolveImage>`); otherwise, as
 * before images existed, as its alt text. Never a fetch from another origin.
 */
export function InlineImage({ node }: { node: ImageNode }): ReactElement {
  const image = useResolvedImage(node);
  return image ? <Img node={node} image={image} /> : <span>{node.alt ?? ""}</span>;
}

/**
 * A paragraph that holds only an image: a `<figure>`, with the Markdown title
 * (`![alt](map.png "Caption")`) as its `<figcaption>`. Unresolved, it stays the
 * paragraph of alt text it always was.
 */
export function ImageFigure({ node }: { node: ImageNode }): ReactElement {
  const image = useResolvedImage(node);
  if (!image) {
    return (
      <p>
        <span>{node.alt ?? ""}</span>
      </p>
    );
  }
  return (
    <figure className="gothic-figure">
      <Img node={node} image={image} />
      {node.title ? <figcaption>{node.title}</figcaption> : null}
    </figure>
  );
}

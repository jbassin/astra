import type { CSSProperties, HTMLAttributes, ReactElement } from "react";
import { cx } from "../cx";

/**
 * General-purpose equal-width column grid (the same track engine the vellum
 * `:::columns` renderer uses). `count` sets the track count; collapses to a
 * single stack on narrow viewports.
 */
export function Columns({
  count = 2,
  className,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & { count?: number }): ReactElement {
  return (
    <div
      className={cx("gothic-columns", className)}
      style={{ ...style, "--vellum-column-count": count } as CSSProperties}
      {...props}
    />
  );
}

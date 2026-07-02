import type { HTMLAttributes, ReactElement } from "react";

import { cx } from "../cx";

/**
 * A framed surface in the void palette. `tone="elevated"` lifts it a step (for
 * nested/hovered content); the default sits on the panel background.
 */
export function Panel({
  tone = "panel",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: "panel" | "elevated" }): ReactElement {
  return (
    <div
      className={cx(
        "rounded-[2px] border border-rule-bright p-4 text-ink",
        tone === "elevated" ? "bg-elevated" : "bg-panel",
        className,
      )}
      {...props}
    />
  );
}

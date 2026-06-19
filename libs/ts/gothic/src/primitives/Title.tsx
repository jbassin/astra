import type { HTMLAttributes, ReactElement } from "react";
import { cx } from "../cx";

const SIZES = {
  1: "text-[2.4rem] tracking-[0.015em]",
  2: "text-[1.7rem] tracking-[0.02em]",
  3: "text-[1.35rem] tracking-[0.03em]",
} as const;

/**
 * The document-title scale in the display face (ITC Serif Gothic, uppercase,
 * phosphor-teal). `level` picks both the heading tag and the size step.
 */
export function Title({
  level = 1,
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement> & { level?: 1 | 2 | 3 }): ReactElement {
  const Tag = `h${level}` as "h1" | "h2" | "h3";
  return (
    <Tag
      className={cx("font-display uppercase leading-[1.1] text-accent", SIZES[level], className)}
      {...props}
    />
  );
}

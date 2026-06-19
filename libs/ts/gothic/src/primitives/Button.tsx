import type { ButtonHTMLAttributes, ReactElement } from "react";
import { cx } from "../cx";

const VARIANTS = {
  solid:
    "border-accent bg-accent text-void hover:bg-[color-mix(in_srgb,var(--color-accent)_85%,white)]",
  ghost: "border-rule-bright bg-transparent text-ink hover:bg-hover",
} as const;

/**
 * A 40k-gothic button — mono caps, hard corners. `variant="solid"` is the teal
 * call-to-action; `ghost` is the quiet default. Always sets an explicit `type`.
 */
export function Button({
  variant = "ghost",
  type,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" }): ReactElement {
  return (
    // biome-ignore lint/a11y/useButtonType: explicit type is threaded through, defaulting to "button".
    <button
      type={type ?? "button"}
      className={cx(
        "rounded-[1px] border px-3 py-1.5 font-mono text-[0.8rem] uppercase tracking-[0.08em] transition-colors duration-[120ms] ease-out",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

import type { ButtonHTMLAttributes, ReactElement } from "react";

import { cx } from "./cx";

const VARIANT_CLASS = {
  solid: "codex-ui-button-solid",
  ghost: "codex-ui-button-ghost",
} as const;

/**
 * D29-46 — codex's own parchment-system button, EXACT prop-signature parity
 * with the gothic lib's `Button`. `variant="solid"` is the maroon
 * call-to-action fill; `ghost` (the default) is the quiet tan/transparent
 * outline. Always sets an explicit `type`.
 */
export function Button({
  variant = "ghost",
  type,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" }): ReactElement {
  return (
    <button
      type={type ?? "button"}
      className={cx("codex-ui-button", VARIANT_CLASS[variant], className)}
      {...props}
    />
  );
}

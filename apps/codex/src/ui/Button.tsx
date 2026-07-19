import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

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
 *
 * P13 S2 (D29-123) — widened to `forwardRef`, same additive-only posture as
 * `Input`'s own P13 S1 widening (`Input.tsx`'s own doc comment): the
 * "Filters" toggle button needs a real DOM node so open/close can move
 * focus back onto it (`BrowseListing.tsx`'s own focus-management effect).
 * Every existing prop-only call site is byte-identical; `ref` was simply
 * inaccessible before.
 */
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" }
>(function Button({ variant = "ghost", type, className, ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={cx("codex-ui-button", VARIANT_CLASS[variant], className)}
      {...props}
    />
  );
});

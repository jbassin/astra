import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

import { cx } from "./cx";

const VARIANT_CLASS = {
  solid: "codex-ui-button-solid",
  ghost: "codex-ui-button-ghost",
} as const;

/**
 * Codex's own parchment-system button, EXACT prop-signature parity
 * with the gothic lib's `Button`. `variant="solid"` is the maroon
 * call-to-action fill; `ghost` (the default) is the quiet tan/transparent
 * outline. Always sets an explicit `type`.
 *
 * A `forwardRef` component, like `Input` (`Input.tsx`'s own doc comment):
 * the "Filters" toggle button needs a real DOM node so open/close can move
 * focus back onto it (`BrowseListing.tsx`'s own focus-management effect).
 * Prop-only call sites don't need the ref.
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

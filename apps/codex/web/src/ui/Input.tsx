import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

import { cx } from "./cx";

/**
 * Codex's own parchment-system text input, EXACT prop-signature
 * parity with the gothic lib's `Input` (a plain styled passthrough). Body
 * face, gold-frame focus (via `.codex-ui-input:focus` in globals.css).
 *
 * A `forwardRef` component: `OptionSearch`'s expand-and-autofocus behavior
 * needs a real DOM node to call `.focus()` on. Prop-only call sites don't
 * need the ref.
 */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cx("codex-ui-input", className)} {...props} />;
  },
);

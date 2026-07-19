import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

import { cx } from "./cx";

/**
 * D29-46 — codex's own parchment-system text input, EXACT prop-signature
 * parity with the gothic lib's `Input` (a plain styled passthrough). Body
 * face, gold-frame focus (via `.codex-ui-input:focus` in globals.css).
 *
 * P13 S1 (D29-125) — widened to `forwardRef`: `OptionSearch`'s expand-and-
 * autofocus behavior needs a real DOM node to call `.focus()` on. Additive
 * only (every existing prop-only call site is byte-identical; `ref` was
 * simply inaccessible before).
 */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cx("codex-ui-input", className)} {...props} />;
  },
);

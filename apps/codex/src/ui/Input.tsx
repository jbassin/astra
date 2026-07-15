import type { InputHTMLAttributes, ReactElement } from "react";

import { cx } from "./cx";

/**
 * D29-46 — codex's own parchment-system text input, EXACT prop-signature
 * parity with the gothic lib's `Input` (a plain styled passthrough). Body
 * face, gold-frame focus (via `.codex-ui-input:focus` in globals.css).
 */
export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>): ReactElement {
  return <input className={cx("codex-ui-input", className)} {...props} />;
}

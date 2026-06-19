import type { ReactElement } from "react";

/**
 * Diegetic redaction bar — `:redact[the secret]` renders as a [DATA EXPUNGED]
 * blackout. The underlying text is still in the DOM (title) but visually
 * covered; this is a prop effect, not real security.
 */
export function Redaction({ children }: { children: string }): ReactElement {
  return (
    <span
      title="[DATA EXPUNGED]"
      className="select-none rounded-[1px] bg-redaction px-[0.2rem] text-transparent"
    >
      {children}
    </span>
  );
}

import type { ReactElement } from "react";

/**
 * D29-46 — codex's own placeholder for an unknown/malformed directive,
 * EXACT prop-signature parity with the gothic lib's `ErrorChip`. Totality:
 * the rest of the document still renders; the broken node shows a labeled
 * chip, never a throw.
 */
export function ErrorChip({ message }: { message: string }): ReactElement {
  return (
    <span role="note" title={message} className="codex-ui-error-chip">
      {message}
    </span>
  );
}

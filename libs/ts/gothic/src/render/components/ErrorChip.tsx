import type { ReactElement } from "react";

/**
 * Inline placeholder for an unknown/malformed directive. Totality: the rest of
 * the document still renders; the broken node shows a labeled chip, never a throw.
 */
export function ErrorChip({ message }: { message: string }): ReactElement {
  return (
    <span
      role="note"
      title={message}
      className="rounded-[1px] border border-accent-amber px-[0.25rem] font-mono text-[0.7rem] text-accent-amber"
    >
      {message}
    </span>
  );
}

import type { InputHTMLAttributes, ReactElement } from "react";
import { cx } from "../cx";

/** A void-palette text input — body face, teal focus ring. */
export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>): ReactElement {
  return (
    <input
      className={cx(
        "w-full rounded-[1px] border border-rule-bright bg-void px-3 py-1.5 font-body text-ink",
        "placeholder:text-ink-faint focus:border-accent focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

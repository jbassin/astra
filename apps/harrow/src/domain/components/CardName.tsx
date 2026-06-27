import type { CSSProperties } from "react";

// Ported verbatim from harrow's src/components/CardName.tsx. Renders "The Fool" as a
// normal-weight "The " + a bold proper noun.
interface CardNameProps {
  name: string;
  className?: string;
  style?: CSSProperties;
}

export function CardName({ name, className, style }: CardNameProps) {
  if (!name.startsWith("The ")) {
    return (
      <span className={className} style={style}>
        {name}
      </span>
    );
  }
  return (
    <span className={className} style={style}>
      <span className="font-normal">The </span>
      <span className="font-bold">{name.slice(4)}</span>
    </span>
  );
}

// Inline SVG icons from the build-time icon module (scripts/icons.ts), and the heraldic crest:
// a shield in a class's colour with its icon. Icons are decorative unless given a `label`.

import { createElement, type ReactNode } from "react";

import { ICONS, type IconName, type IconNode } from "@/generated/icons";

/** The icon's elements, passed as separate children (so React needs no keys). */
function draw(nodes: IconNode[]): ReactNode[] {
  return nodes.map(([tag, attrs, children]) => createElement(tag, attrs, ...draw(children)));
}

export function Icon({
  name,
  className,
  label,
}: {
  name: IconName;
  className?: string;
  /** Spoken name; without one the icon is hidden from assistive tech. */
  label?: string;
}) {
  const { size, nodes } = ICONS[name];
  return createElement(
    "svg",
    {
      className: className ? `icon ${className}` : "icon",
      viewBox: `0 0 ${size} ${size}`,
      role: label ? "img" : undefined,
      "aria-label": label,
      "aria-hidden": label ? undefined : true,
      focusable: "false",
    },
    ...draw(nodes),
  );
}

/** A heater shield, 100 wide and 116 tall. */
const SHIELD = "M50 2 C66 9 82 11 97 10 C98 52 92 86 50 114 C8 86 2 52 3 10 C18 11 34 9 50 2 Z";

/**
 * A class (or archetype) crest: the shield in the hue the wrapper sets (`--hue`), a fine inner
 * rule and the icon in the middle. Size it with CSS (`width`).
 */
export function Crest({ icon, className }: { icon: IconName; className?: string }) {
  const { size, nodes } = ICONS[icon];
  return (
    <svg
      className={className ? `crest ${className}` : "crest"}
      viewBox="0 0 100 116"
      aria-hidden="true"
      focusable="false"
    >
      <path className="crest-field" d={SHIELD} />
      <path
        className="crest-rule"
        d={SHIELD}
        transform="translate(50 58) scale(0.86) translate(-50 -58)"
      />
      {createElement(
        "g",
        { className: "crest-charge", transform: `translate(23 26) scale(${54 / size})` },
        ...draw(nodes),
      )}
    </svg>
  );
}

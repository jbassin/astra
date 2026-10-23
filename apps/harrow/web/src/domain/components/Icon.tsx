// Ported from harrow's src/components/Icon.tsx. Renders a card's SVG glyph from its
// `path` + `viewBox`, with decorative rule lines above/below and a 180° rotation when
// reversed. The decorative gold is re-toned to gothic's gold-leaf (Decision A).

const ICON_SIZE = 128;
const GOLD = "#b4842f"; // gothic --color-gold-leaf

interface IconProps {
  color: string;
  path: string;
  size?: number;
  reversed?: boolean;
  viewBox?: number;
}

export function Icon({ color, path, size = ICON_SIZE, reversed = false, viewBox = 12 }: IconProps) {
  const line = (display: boolean) => (
    <svg
      width={size}
      height="12"
      viewBox={`0 0 ${size} 12`}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={display ? "block" : "hidden"}
    >
      <line x1="0" y1="6" x2={size} y2="6" stroke={GOLD} strokeWidth="0.5" strokeLinecap="round" />
    </svg>
  );

  return (
    <>
      {line(reversed)}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${viewBox} ${viewBox}`}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className={reversed ? "rotate-180" : ""}
      >
        <path
          style={{
            clipRule: "nonzero",
            fill: "none",
            stroke: color,
            strokeWidth: viewBox === 12 ? ".6" : "4",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeMiterlimit: "4",
            strokeDasharray: "none",
            strokeOpacity: "1",
          }}
          d={path}
        />
      </svg>
      {line(!reversed)}
    </>
  );
}

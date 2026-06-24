import FactionSymbol from "@/domain/components/FactionSymbol/FactionSymbol";
import type { Faction } from "@/domain/lib/factions";
import type { Banner } from "@/domain/lib/layers";
import styles from "./BannerDetail.module.css";

interface BannerDetailProps {
  banner: Banner;
  // The member factions, resolved from their slugs (in banner.members order).
  // A slug with no matching faction is skipped.
  members: Faction[];
  // Click a constituent to open its own faction dossier.
  onSelectFaction: (faction: Faction) => void;
}

// The banner's pseudo-faction view: the alliance identity plus its constituent
// factions. Combined territory paints in one banner color on the map; this panel
// is where the original members stay legible.
export default function BannerDetail({ banner, members, onSelectFaction }: BannerDetailProps) {
  const pseudoFaction: Faction = {
    name: banner.name,
    slug: banner.slug,
    color: banner.color,
    order: 0,
    symbol: banner.symbol,
    description: "",
    members: [],
  };

  return (
    <div className={styles.root} style={{ "--faction-color": banner.color } as React.CSSProperties}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.orderId}>{"+ ALLIANCE +"}</span>
          <h2 className={styles.name}>{banner.name.toUpperCase()}</h2>
        </div>
        <div className={styles.symbol}>
          <FactionSymbol faction={pseudoFaction} size={64} />
        </div>
      </div>

      <div className={styles.divider} />

      <section className={styles.section}>
        <h3 className={styles.sectionLabel}>{"++ UNDER ONE BANNER ++"}</h3>
        <ul className={styles.members}>
          {members.map((faction) => (
            <li key={faction.slug}>
              <button
                type="button"
                className={styles.member}
                onClick={() => onSelectFaction(faction)}
              >
                <span
                  className={styles.swatch}
                  style={{ background: faction.color }}
                  aria-hidden="true"
                />
                <span className={styles.memberName}>{faction.name.toUpperCase()}</span>
                <span className={styles.chevron} aria-hidden="true">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

import FactionSymbol from "@/domain/components/FactionSymbol/FactionSymbol";
import type { Faction } from "@/domain/lib/factions";
import styles from "./FactionDetail.module.css";

interface FactionDetailProps {
  faction: Faction;
}

export default function FactionDetail({ faction }: FactionDetailProps) {
  return (
    <div
      className={styles.root}
      style={{ "--faction-color": faction.color } as React.CSSProperties}
    >
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.orderId}>
            {"+ BERTH "}
            {String(faction.order).padStart(2, "0")}
            {" +"}
          </span>
          <h2 className={styles.name}>{faction.name.toUpperCase()}</h2>
        </div>
        <div className={styles.symbol}>
          <FactionSymbol faction={faction} size={64} />
        </div>
      </div>

      <div className={styles.divider} />

      {faction.description && (
        <section className={styles.section}>
          <h3 className={styles.sectionLabel}>{"++ DOSSIER ++"}</h3>
          {/* The whole faction body — authored in vellum, rendered to HTML at
              build time by gothic's DocumentView. Personnel appear as in-document
              headings. */}
          <div
            className={styles.description}
            dangerouslySetInnerHTML={{ __html: faction.description }}
          />
        </section>
      )}
    </div>
  );
}

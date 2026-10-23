import type { CodexEntity } from "../schema/entity";
import { normalizeUrlKey, type AonLinkTable } from "./aonLinkTable";

/**
 * P4 (D29-39, spec §1's M8 finding): the `attachedSidebars` reverse-join —
 * every `sidebar`-category entity's OWN `aonUrl` IS its host page's url; 65
 * real host urls are SHARED by multiple corpus entities (a class page vs.
 * its 60+ class-feature docs), so a naive `aonUrl` string scan mis-attaches
 * (measured: naive first-match yields 64 class-feature "hosts" vs. the
 * correct 60 class + 1) — the FIX is the link table's own `pickCanonical`
 * page-owner rule (already resolves url → the winning doc's aonId at table-
 * build time, `aonLinkTable.ts`), then pass-4's `aonIdToFinalId` to survive
 * collision suffixing. This is a POST-identity step — never the S5d
 * parse-time repoint seam (pre-collision ids, wrong for this join).
 */

export type ReportFn = (cls: string, detail: string) => void;

export interface SidebarHostCategoryCount {
  category: string;
  count: number;
}

export interface SidebarAttachResult {
  /** The full entity array — host entities gain `attachedSidebars`, every
   * other entity (including sidebars themselves) passes through unchanged. */
  entities: CodexEntity[];
  sidebarsTotal: number;
  sidebarsResolved: number;
  /** Per resolved-host-category sidebar count (e.g. `rules` → 361) — the
   * spec's per-category attachment-coverage report table. */
  byHostCategory: SidebarHostCategoryCount[];
  maxPerHost: number;
  /** Distinct host entities that gained ≥1 sidebar — informational (the
   * spec's own pins are all phrased per-SIDEBAR, not per-distinct-host). */
  hostsWithSidebars: number;
}

/**
 * Pure. `finalIdToAonId` is the inverse of `aonIdToFinalId` (built once by
 * the caller, `transform.ts`) — needed for the sidebar-ordering tie-break
 * (D29-39: "name asc, tie-break aonId").
 */
export function attachSidebars(
  entities: readonly CodexEntity[],
  linkTable: AonLinkTable,
  aonIdToFinalId: ReadonlyMap<string, string>,
  finalIdToAonId: ReadonlyMap<string, string>,
  report: ReportFn,
): SidebarAttachResult {
  const byId = new Map(entities.map((e) => [e.id, e] as const));
  const sidebarEntities = entities.filter((e) => e.category === "sidebar");

  const sidebarIdsByHost = new Map<string, string[]>();
  let resolved = 0;
  const byHostCategoryCount = new Map<string, number>();

  for (const sidebar of sidebarEntities) {
    const href = sidebar.aonUrl;
    if (href === undefined) {
      report("sidebarHostUnresolved", `${sidebar.id}: no aonUrl`);
      continue;
    }
    const entry = linkTable.byUrl.get(normalizeUrlKey(href));
    const hostFinalId = entry !== undefined ? aonIdToFinalId.get(entry.aonId) : undefined;
    const host = hostFinalId !== undefined ? byId.get(hostFinalId) : undefined;
    if (!host) {
      report(
        "sidebarHostUnresolved",
        `${sidebar.id}: url "${href}" did not resolve to a living host entity`,
      );
      continue;
    }
    resolved++;
    byHostCategoryCount.set(host.category, (byHostCategoryCount.get(host.category) ?? 0) + 1);
    const arr = sidebarIdsByHost.get(host.id) ?? [];
    arr.push(sidebar.id);
    sidebarIdsByHost.set(host.id, arr);
  }

  const nameOf = new Map(entities.map((e) => [e.id, e.name] as const));
  let maxPerHost = 0;
  const attachedByHost = new Map<string, string[]>();
  for (const [hostId, sidebarIds] of sidebarIdsByHost) {
    const sorted = [...sidebarIds].sort((a, b) => {
      const nameA = nameOf.get(a) ?? "";
      const nameB = nameOf.get(b) ?? "";
      if (nameA !== nameB) return nameA < nameB ? -1 : 1;
      const aonA = finalIdToAonId.get(a) ?? a;
      const aonB = finalIdToAonId.get(b) ?? b;
      return aonA < aonB ? -1 : aonA > aonB ? 1 : 0;
    });
    attachedByHost.set(hostId, sorted);
    if (sorted.length > maxPerHost) maxPerHost = sorted.length;
  }

  const resultEntities = entities.map((e) => {
    const attached = attachedByHost.get(e.id);
    return attached !== undefined ? { ...e, attachedSidebars: attached } : e;
  });

  return {
    entities: resultEntities,
    sidebarsTotal: sidebarEntities.length,
    sidebarsResolved: resolved,
    byHostCategory: [...byHostCategoryCount.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => a.category.localeCompare(b.category)),
    maxPerHost,
    hostsWithSidebars: attachedByHost.size,
  };
}

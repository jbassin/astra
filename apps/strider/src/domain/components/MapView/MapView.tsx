import { useNavigate } from "@tanstack/react-router";
import { lazy, useCallback, useEffect, useMemo, useState } from "react";
import ClientOnly from "@/components/ClientOnly/ClientOnly";
import { useSetEntitiesObserved } from "@/components/SiteHeader/entitiesObserved";
import Modal, { type ModalContent } from "@/domain/components/Modal/Modal";
import type { Faction } from "@/domain/lib/factions";
import { computeFallenStateByCursor, fallenAtCursor } from "@/domain/lib/memoriam";
import { OVERLAYS, type OverlayId, serializeOverlaysParam } from "@/domain/lib/overlays";
import type { FactionFlipAnim, Layer, LayerAnimation } from "@/domain/lib/regions";
import { LAYER_DWELL_MS } from "@/domain/lib/timeline";
import { buildTimelineFrames } from "@/domain/lib/timelineFrames";
import { useIsMobile } from "@/lib/useIsMobile";
import styles from "./MapView.module.css";
import MemoriamPanel from "./MemoriamPanel";
import OverlayStrip from "./OverlayStrip";
import TimelineStrip from "./TimelineStrip";
import { useTimelinePlayback } from "./useTimelinePlayback";

// Lazy so PixiJS never evaluates during SSR. ClientOnly below guarantees
// the lazy boundary only resolves in the browser.
const HexMap = lazy(() => import("@/domain/components/HexMap/HexMap"));

type HoverState =
  | { kind: "none" }
  | { kind: "faction"; factionIdx: number }
  | { kind: "region"; factionIdx: number; slug: string }
  | { kind: "skein"; factionIdx: number; slug: string };

interface MapViewProps {
  factions: Faction[];
  layers: Layer[];
  seen?: boolean;
  initialVisibleOverlays: Set<OverlayId>;
}

export default function MapView({ factions, layers, seen, initialVisibleOverlays }: MapViewProps) {
  const [modal, setModal] = useState<ModalContent | null>(null);
  const [hover, setHover] = useState<HoverState>({ kind: "none" });
  const [visibleOverlays, setVisibleOverlays] = useState<Set<OverlayId>>(
    () => new Set(initialVisibleOverlays),
  );
  // Layer indices carrying a tithe op — these hold on screen for the full wave
  // so it completes before the next layer applies.
  const titheSteps = useMemo(() => {
    const s = new Set<number>();
    layers.forEach((layer, i) => {
      if (layer.changes.some((c) => c.op === "tithe")) s.add(i);
    });
    return s;
  }, [layers]);
  const { layerIndex, prevLayerIndex, isPlaying, setIndex, skipToEnd, replay } =
    useTimelinePlayback(layers.length, seen, titheSteps);
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  const toggleOverlay = useCallback(
    (id: OverlayId) => {
      setVisibleOverlays((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        const serialized = serializeOverlaysParam(next);
        void navigate({
          to: "/",
          search: (s: Record<string, unknown>) => ({
            ...s,
            overlays: serialized,
          }),
          replace: true,
        });
        return next;
      });
    },
    [navigate],
  );

  const factionSlugs = useMemo(() => factions.map((f) => f.slug), [factions]);

  // Precompute every cursor's fully-derived state once (memoized on the layer
  // set), so stepping or scrubbing to any layer is an O(1) lookup instead of
  // re-folding `layers.slice(0, index)` from scratch on every change.
  const frames = useMemo(
    () => buildTimelineFrames(layers, factions, factionSlugs),
    [layers, factions, factionSlugs],
  );
  const frame = frames[layerIndex] ?? frames[frames.length - 1]!;
  const regions = frame.regions;
  const skein = frame.skein;

  const fallenStateByCursor = useMemo(
    () => computeFallenStateByCursor(factions, layers),
    [factions, layers],
  );

  const fallenEntries = useMemo(
    () => fallenAtCursor(factions, layers, fallenStateByCursor, layerIndex),
    [factions, layers, fallenStateByCursor, layerIndex],
  );

  const setEntitiesObserved = useSetEntitiesObserved();

  const entitiesObservedCount = useMemo(
    () => frame.renderFactionHexes.reduce((sum, hexes) => (hexes.length > 0 ? sum + 1 : sum), 0),
    [frame],
  );

  useEffect(() => {
    setEntitiesObserved(entitiesObservedCount);
    return () => setEntitiesObserved(null);
  }, [entitiesObservedCount, setEntitiesObserved]);

  function handleFactionClick(faction: Faction) {
    // A banner pseudo-faction opens the alliance panel (no /factions route
    // exists for it), listing its constituents — each opens its own dossier.
    const banner = frame.activeBanners.get(faction.slug);
    if (banner) {
      const members = banner.members
        .map((slug) => factions.find((f) => f.slug === slug))
        .filter((f): f is Faction => Boolean(f));
      setModal({
        kind: "banner",
        banner,
        members,
        onSelectFaction: (f) => setModal({ kind: "faction", faction: f }),
      });
      return;
    }
    if (isMobile) {
      navigate({ to: "/factions/$slug", params: { slug: faction.slug } });
    } else {
      setModal({ kind: "faction", faction });
    }
  }

  function handleFactionHover(factionIdx: number | null) {
    setHover(factionIdx === null ? { kind: "none" } : { kind: "faction", factionIdx });
  }

  function handleRegionHover(slug: string | null, factionIdx: number | null) {
    if (slug === null || factionIdx === null) setHover({ kind: "none" });
    else setHover({ kind: "region", factionIdx, slug });
  }

  function handleSkeinHover(slug: string | null, factionIdx: number | null) {
    if (slug === null || factionIdx === null) setHover({ kind: "none" });
    else setHover({ kind: "skein", factionIdx, slug });
  }

  const hoveredFactionIdx = hover.kind === "none" ? null : hover.factionIdx;
  const hoveredRegionSlug = hover.kind === "region" ? hover.slug : null;
  const hoveredSkeinSlug = hover.kind === "skein" ? hover.slug : null;
  const hoveredFaction =
    hoveredFactionIdx !== null ? frame.renderFactions[hoveredFactionIdx] : null;
  const hoveredRegion = hoveredRegionSlug
    ? (regions.find((r) => r.slug === hoveredRegionSlug) ?? null)
    : null;
  const hoveredSkein = hoveredSkeinSlug
    ? (skein.regions.find((r) => r.slug === hoveredSkeinSlug) ?? null)
    : null;

  const dwellMs = LAYER_DWELL_MS;

  // Build a one-shot animation hint when the timeline takes a forward-by-one
  // step. Backward, multi-step, and initial-mount transitions snap (animation
  // is null). The hint lifecycles with `layerIndex` itself — when it changes,
  // a new object reference is passed to HexMap, which keys its scene effect
  // off identity to fire animations exactly once per step.
  const animation: LayerAnimation | null = useMemo(() => {
    const isForwardByOne =
      prevLayerIndex !== null && layerIndex === prevLayerIndex + 1 && layerIndex > 0;
    if (!isForwardByOne) return null;
    const justAppliedLayer = layers[layerIndex - 1];
    if (!justAppliedLayer) return null;

    const regionAdds: Array<{ slug: string }> = [];
    const skeinConnects: Array<{ from: string; to: string }> = [];
    const claimChanges: Array<{
      hexes: Array<[number, number]>;
      faction: string | null;
    }> = [];
    const bannerForms: Array<{ members: string[] }> = [];
    let tithe = false;
    for (const change of justAppliedLayer.changes) {
      if (change.op === "add") regionAdds.push({ slug: change.slug });
      else if (change.op === "skein-connect")
        skeinConnects.push({ from: change.from, to: change.to });
      else if (change.op === "claim")
        claimChanges.push({ hexes: change.hexes, faction: change.faction });
      else if (change.op === "banner-form") bannerForms.push({ members: change.members });
      else if (change.op === "tithe") tithe = true;
    }

    // Only compute prev faction state if we actually have flips to animate —
    // saves the fold on the common no-flip layer. A banner-form flips every
    // member faction's hexes (their previous owners) to the banner color, so it
    // needs the same prev-state fold as a claim.
    let factionFlips: FactionFlipAnim[] = [];
    const prevFrame = frames[layerIndex - 1];
    if ((claimChanges.length > 0 || bannerForms.length > 0) && prevFrame) {
      const prevPerFaction = prevFrame.effectiveFactionHexes;
      const prevFactionIdxByHex = new Map<string, number | null>();
      prevPerFaction.forEach((hexes, idx) => {
        for (const [q, r] of hexes) prevFactionIdxByHex.set(`${q},${r}`, idx);
      });
      for (const [q, r] of prevFrame.unownedHexes) {
        prevFactionIdxByHex.set(`${q},${r}`, null);
      }
      factionFlips = claimChanges
        .filter((c) => c.hexes.length > 0)
        .map((c) => {
          const lookups: Array<readonly [string, number | null]> = c.hexes.map(([q, r]) => {
            const key = `${q},${r}`;
            const idx = prevFactionIdxByHex.has(key)
              ? (prevFactionIdxByHex.get(key) ?? null)
              : null;
            return [key, idx] as const;
          });
          return {
            originHex: c.hexes[0]!,
            hexes: c.hexes,
            prevFactionIdxByHex: lookups,
          };
        });

      // A banner-form flips each member faction's previously-owned hexes to the
      // banner color, as one wave per banner (the underlying snapshot hex already
      // shows the banner color, so the existing flip reveals member → banner).
      if (bannerForms.length > 0) {
        const slugToIdx = new Map<string, number>();
        factionSlugs.forEach((slug, i) => {
          slugToIdx.set(slug, i);
        });
        for (const bf of bannerForms) {
          const hexes: Array<[number, number]> = [];
          const lookups: Array<readonly [string, number | null]> = [];
          for (const member of bf.members) {
            const idx = slugToIdx.get(member);
            if (idx === undefined) continue;
            for (const [q, r] of prevPerFaction[idx]!) {
              hexes.push([q, r]);
              lookups.push([`${q},${r}`, idx]);
            }
          }
          if (hexes.length > 0) {
            factionFlips.push({ originHex: hexes[0]!, hexes, prevFactionIdxByHex: lookups });
          }
        }
      }
    }

    if (
      regionAdds.length === 0 &&
      skeinConnects.length === 0 &&
      factionFlips.length === 0 &&
      !tithe
    ) {
      return null;
    }

    return {
      layerIndex,
      budgetMs: Math.round(LAYER_DWELL_MS * 0.8),
      regionAdds,
      skeinConnects,
      factionFlips,
      tithe,
    };
  }, [frames, layers, layerIndex, prevLayerIndex, factionSlugs]);

  return (
    <div className={styles.root}>
      <div className={styles.mapRow}>
        <div className={styles.frame} data-og-target="frame">
          <span className={styles.cornerTL} aria-hidden="true">
            +
          </span>
          <span className={styles.cornerTR} aria-hidden="true">
            +
          </span>
          <span className={styles.cornerBL} aria-hidden="true">
            +
          </span>
          <span className={styles.cornerBR} aria-hidden="true">
            +
          </span>
          <div className={styles.hoverLabel} aria-live="polite">
            {hoveredFaction ? `+ ${hoveredFaction.name.toUpperCase()} +` : ""}
          </div>
          <div className={styles.hoverSubtitle} aria-live="polite">
            {hoveredRegion
              ? `· ${hoveredRegion.name}`
              : hoveredSkein
                ? `· ${hoveredSkein.name}`
                : ""}
          </div>
          <ClientOnly>
            <HexMap
              factions={frame.renderFactions}
              regions={regions}
              skein={skein}
              factionHexes={frame.renderFactionHexes}
              unownedHexes={frame.unownedHexes}
              factionBorders={frame.factionBorders}
              territoryBorders={frame.territoryBorders}
              hoveredFaction={hoveredFactionIdx}
              hoveredRegionSlug={hoveredRegionSlug}
              visibleOverlays={visibleOverlays}
              animation={animation}
              onFactionClick={handleFactionClick}
              onFactionHover={handleFactionHover}
              onRegionHover={handleRegionHover}
              onSkeinHover={handleSkeinHover}
            />
          </ClientOnly>
        </div>
        <OverlayStrip overlays={OVERLAYS} visible={visibleOverlays} onToggle={toggleOverlay} />
      </div>
      <TimelineStrip
        layers={layers}
        index={layerIndex}
        isPlaying={isPlaying}
        dwellMs={dwellMs}
        onIndexChange={setIndex}
        onSkipToEnd={skipToEnd}
        onReplay={replay}
      />
      <MemoriamPanel entries={fallenEntries} onFactionClick={handleFactionClick} />
      <Modal content={modal} onClose={() => setModal(null)} />
    </div>
  );
}

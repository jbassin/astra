import { useRouter } from "@tanstack/react-router";
/**
 * Graph — React port of faerrin's Solid Graph island (a Quartz pixi/d3 force-graph).
 * The imperative pixi/d3 body (`renderGraph`) is ported VERBATIM; only the Solid
 * shell changes: `onMount`→`useEffect`, `onCleanup`→the effect's cleanup return,
 * Solid `ref` locals → `useRef`. The pure data-shaping lives in `graphData.ts`.
 *
 * MUST stay client-only — pixi calls `getComputedStyle`/`devicePixelRatio`/WebGPU at
 * setup and crashes under SSR. PageLayout mounts it behind `lazy()` + `<ClientOnly>`,
 * so this module (and its pixi/d3 imports) never reach the SSR/server bundle (Risk 5).
 *
 * Data comes from `/static/contentIndex.json` (the slim {title,links,tags} index
 * build-emitted by build-content); the current slug from `body[data-slug]` (set in
 * __root). Nodes take their section's hue (`--ak-<section>`); links, labels and tag nodes
 * read the Quartz variable names (`--gray`, `--dark`, …). All of them are read with
 * getComputedStyle and are concrete hex per theme in tokens.css (canvas code can't use a
 * `var()`). The graph redraws when the theme changes. Every listener and pixi app is torn
 * down on unmount (the SPA teardown rule).
 */
import { Tween as Tweened, Group as TweenGroup } from "@tweenjs/tween.js";
import { drag } from "d3-drag";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
} from "d3-force";
import { select } from "d3-selection";
import { zoom, zoomIdentity } from "d3-zoom";
import { Application, Circle, Container, Graphics, Text } from "pixi.js";
import { useEffect, useRef, useState } from "react";

import { ExpandIcon } from "@/domain/components/icons";
import { type Section, SECTIONS, sectionOf } from "@/domain/lib/sections";
import { type FullSlug, resolveRelative, simplifySlug } from "@/domain/lib/slug";
import { watchTheme } from "@/domain/lib/theme";

import { buildGraphData, type ContentDetails, type D3Config } from "./graphData";

// quartz.layout.ts: Graph({ localGraph: { scale: 50.0 } }); rest are Graph.tsx defaults.
const LOCAL_CFG: D3Config = {
  drag: true,
  zoom: true,
  depth: 1,
  scale: 50.0,
  repelForce: 0.5,
  centerForce: 0.3,
  linkDistance: 30,
  fontSize: 0.6,
  opacityScale: 1,
  showTags: true,
  removeTags: [],
  focusOnHover: false,
  enableRadial: false,
};
const GLOBAL_CFG: D3Config = {
  drag: true,
  zoom: true,
  depth: -1,
  scale: 0.9,
  repelForce: 0.5,
  centerForce: 0.2,
  linkDistance: 30,
  fontSize: 0.6,
  opacityScale: 1,
  showTags: true,
  removeTags: [],
  focusOnHover: true,
  enableRadial: true,
};

const removeAllChildren = (node: HTMLElement) => {
  while (node.firstChild) node.removeChild(node.firstChild);
};
// ported from quartz/components/scripts/util.ts; returns its own teardown.
function registerEscapeHandler(outside: HTMLElement | null, cb: () => void): () => void {
  if (!outside) return () => {};
  const click = function (this: HTMLElement, e: MouseEvent) {
    if (e.target !== this) return;
    e.preventDefault();
    e.stopPropagation();
    cb();
  };
  const esc = (e: KeyboardEvent) => {
    if (!e.key.startsWith("Esc")) return;
    e.preventDefault();
    cb();
  };
  outside.addEventListener("click", click);
  document.addEventListener("keydown", esc);
  return () => {
    outside.removeEventListener("click", click);
    document.removeEventListener("keydown", esc);
  };
}

let dataCache: Map<string, ContentDetails> | null = null;
async function loadData(): Promise<Map<string, ContentDetails>> {
  if (dataCache) return dataCache;
  const raw = (await fetch("/static/contentIndex.json").then((r) => r.json())) as Record<
    string,
    ContentDetails
  >;
  dataCache = new Map(Object.entries(raw).map(([k, v]) => [simplifySlug(k as FullSlug), v]));
  return dataCache;
}

async function renderGraph(
  graph: HTMLElement,
  fullSlug: string,
  cfg: D3Config,
  rawData: Map<string, ContentDetails>,
  // Opens a page by its href relative to `fullSlug` (a client navigation).
  go: (href: string) => void,
  // Told which sections the drawn nodes belong to (the legend).
  onSections?: (sections: Section[]) => void,
): Promise<() => void> {
  const slug = simplifySlug(fullSlug as FullSlug);
  removeAllChildren(graph);

  const {
    drag: enableDrag,
    zoom: enableZoom,
    scale,
    repelForce,
    centerForce,
    linkDistance,
    fontSize,
    opacityScale,
    focusOnHover,
    enableRadial,
  } = cfg;

  const data = rawData;
  // oxlint-disable-next-line typescript/no-explicit-any -- d3 and pixi objects meet here untyped; typing this seam is a follow-up
  const graphData: { nodes: any[]; links: any[] } = buildGraphData(data, slug, cfg);
  onSections?.(SECTIONS.filter((s) => graphData.nodes.some((n) => sectionOf(n.id) === s)));

  // No edges → skip pixi entirely and show an intentional placeholder. Otherwise a
  // connection-less page (home, the tags index) renders an empty canvas that reads
  // as a broken widget. The global-graph icon stays — the full graph is still
  // worth opening. No pixi app is created here, so there's nothing to tear down.
  if (graphData.links.length === 0) {
    const note = document.createElement("p");
    note.className = "graph-empty";
    note.textContent = "No connections to show.";
    graph.appendChild(note);
    return () => removeAllChildren(graph);
  }

  const tweens = new Map<string, { update: (t: number) => void; stop: () => void }>();

  const width = graph.offsetWidth;
  const height = Math.max(graph.offsetHeight, 200);

  const simulation = forceSimulation(graphData.nodes)
    .force("charge", forceManyBody().strength(-100 * repelForce))
    .force("center", forceCenter().strength(centerForce))
    .force("link", forceLink(graphData.links).distance(linkDistance))
    // oxlint-disable-next-line typescript/no-explicit-any -- d3 and pixi objects meet here untyped; typing this seam is a follow-up
    .force("collide", forceCollide((n: any) => nodeRadius(n)).iterations(3));

  const radius = (Math.min(width, height) / 2) * 0.8;
  if (enableRadial) simulation.force("radial", forceRadial(radius).strength(0.2));

  // Concrete hex per theme from tokens.css, read now, so a redraw after a theme change
  // picks up the new values (a `var()` ref would come back unresolved in some browsers).
  const cs = getComputedStyle(document.documentElement);
  const read = (name: string) => cs.getPropertyValue(name).trim();
  const computedStyleMap = {
    "--gray": read("--gray"),
    "--light": read("--light"),
    "--lightgray": read("--lightgray"),
    "--dark": read("--dark"),
    "--bodyFont": read("--bodyFont"),
  };
  const hueOf = new Map(SECTIONS.map((s) => [s.id, read(`--ak-${s.id}`)]));

  // A node's colour says which section it belongs to; tags and home belong to none.
  // oxlint-disable-next-line typescript/no-explicit-any -- d3 and pixi objects meet here untyped; typing this seam is a follow-up
  const color = (dd: any): string => {
    const section = dd.id.startsWith("tags/") ? null : sectionOf(dd.id);
    return (section && hueOf.get(section.id)) || computedStyleMap["--gray"];
  };
  // oxlint-disable-next-line typescript/no-explicit-any -- d3 and pixi objects meet here untyped; typing this seam is a follow-up
  function nodeRadius(dd: any) {
    const numLinks = graphData.links.filter(
      // oxlint-disable-next-line typescript/no-explicit-any -- d3 and pixi objects meet here untyped; typing this seam is a follow-up
      (l: any) => l.source.id === dd.id || l.target.id === dd.id,
    ).length;
    const r = 2 + Math.sqrt(numLinks);
    // The page on screen is the largest node.
    return dd.id === slug ? Math.max(r * 1.4, 7) : r;
  }

  let hoveredNodeId: string | null = null;
  let hoveredNeighbours = new Set<string>();
  // oxlint-disable-next-line typescript/no-explicit-any -- d3 and pixi objects meet here untyped; typing this seam is a follow-up
  const linkRenderData: any[] = [];
  // oxlint-disable-next-line typescript/no-explicit-any -- d3 and pixi objects meet here untyped; typing this seam is a follow-up
  const nodeRenderData: any[] = [];
  function updateHoverInfo(newHoveredId: string | null) {
    hoveredNodeId = newHoveredId;
    if (newHoveredId === null) {
      hoveredNeighbours = new Set();
      for (const n of nodeRenderData) n.active = false;
      for (const l of linkRenderData) l.active = false;
    } else {
      hoveredNeighbours = new Set();
      for (const l of linkRenderData) {
        const ld = l.simulationData;
        if (ld.source.id === newHoveredId || ld.target.id === newHoveredId) {
          hoveredNeighbours.add(ld.source.id);
          hoveredNeighbours.add(ld.target.id);
        }
        l.active = ld.source.id === newHoveredId || ld.target.id === newHoveredId;
      }
      for (const n of nodeRenderData) n.active = hoveredNeighbours.has(n.simulationData.id);
    }
  }

  let dragStartTime = 0;
  let dragging = false;

  function renderLinks() {
    tweens.get("link")?.stop();
    const tg = new TweenGroup();
    for (const l of linkRenderData) {
      let alpha = 1;
      if (hoveredNodeId) alpha = l.active ? 1 : 0.2;
      l.color = l.active ? computedStyleMap["--gray"] : computedStyleMap["--lightgray"];
      tg.add(new Tweened(l).to({ alpha }, 200));
    }
    tg.getAll().forEach((tw) => tw.start());
    tweens.set("link", {
      update: tg.update.bind(tg),
      stop: () => tg.getAll().forEach((tw) => tw.stop()),
    });
  }
  function renderLabels() {
    tweens.get("label")?.stop();
    const tg = new TweenGroup();
    const defaultScale = 1 / scale;
    const activeScale = defaultScale * 1.1;
    for (const n of nodeRenderData) {
      if (hoveredNodeId === n.simulationData.id) {
        tg.add(
          new Tweened(n.label).to({ alpha: 1, scale: { x: activeScale, y: activeScale } }, 100),
        );
      } else {
        tg.add(
          new Tweened(n.label).to(
            { alpha: n.label.alpha, scale: { x: defaultScale, y: defaultScale } },
            100,
          ),
        );
      }
    }
    tg.getAll().forEach((tw) => tw.start());
    tweens.set("label", {
      update: tg.update.bind(tg),
      stop: () => tg.getAll().forEach((tw) => tw.stop()),
    });
  }
  function renderNodes() {
    tweens.get("hover")?.stop();
    const tg = new TweenGroup();
    for (const n of nodeRenderData) {
      let alpha = 1;
      if (hoveredNodeId !== null && focusOnHover) alpha = n.active ? 1 : 0.2;
      tg.add(new Tweened(n.gfx, tg).to({ alpha }, 200));
    }
    tg.getAll().forEach((tw) => tw.start());
    tweens.set("hover", {
      update: tg.update.bind(tg),
      stop: () => tg.getAll().forEach((tw) => tw.stop()),
    });
  }
  function renderPixiFromD3() {
    renderNodes();
    renderLinks();
    renderLabels();
  }

  tweens.forEach((t) => t.stop());
  tweens.clear();

  const app = new Application();
  await app.init({
    width,
    height,
    antialias: true,
    autoStart: false,
    autoDensity: true,
    backgroundAlpha: 0,
    preference: "webgpu",
    resolution: window.devicePixelRatio,
    eventMode: "static",
  });
  graph.appendChild(app.canvas);

  const stage = app.stage;
  stage.interactive = false;
  const labelsContainer = new Container({ zIndex: 3, isRenderGroup: true });
  const nodesContainer = new Container({ zIndex: 2, isRenderGroup: true });
  const linkContainer = new Container({ zIndex: 1, isRenderGroup: true });
  stage.addChild(nodesContainer, labelsContainer, linkContainer);

  for (const n of graphData.nodes) {
    const nodeId = n.id;
    const label = new Text({
      interactive: false,
      eventMode: "none",
      text: n.text,
      alpha: 0,
      anchor: { x: 0.5, y: 1.2 },
      style: {
        fontSize: fontSize * 15,
        fill: computedStyleMap["--dark"],
        fontFamily: computedStyleMap["--bodyFont"],
      },
      resolution: window.devicePixelRatio * 4,
    });
    label.scale.set(1 / scale);
    let oldLabelOpacity = 0;
    const isTagNode = nodeId.startsWith("tags/");
    const gfx = new Graphics({
      interactive: true,
      label: nodeId,
      eventMode: "static",
      hitArea: new Circle(0, 0, nodeRadius(n)),
      cursor: "pointer",
    })
      .circle(0, 0, nodeRadius(n))
      .fill({ color: isTagNode ? computedStyleMap["--light"] : color(n) });
    // A faint ring around the page on screen.
    if (nodeId === slug) {
      gfx.circle(0, 0, nodeRadius(n) + 4).stroke({ width: 1.5, color: color(n), alpha: 0.35 });
    }
    gfx
      // oxlint-disable-next-line typescript/no-explicit-any -- d3 and pixi objects meet here untyped; typing this seam is a follow-up
      .on("pointerover", (e: any) => {
        updateHoverInfo(e.target.label);
        oldLabelOpacity = label.alpha;
        if (!dragging) renderPixiFromD3();
      })
      .on("pointerleave", () => {
        updateHoverInfo(null);
        label.alpha = oldLabelOpacity;
        if (!dragging) renderPixiFromD3();
      });
    if (isTagNode) {
      gfx
        .circle(0, 0, nodeRadius(n))
        .stroke({ width: 1.5, color: computedStyleMap["--gray"], alignment: 1 });
    }
    nodesContainer.addChild(gfx);
    labelsContainer.addChild(label);
    nodeRenderData.push({
      simulationData: n,
      gfx,
      label,
      color: color(n),
      alpha: 1,
      active: false,
    });
  }

  for (const l of graphData.links) {
    const gfx = new Graphics({ interactive: false, eventMode: "none" });
    linkContainer.addChild(gfx);
    linkRenderData.push({
      simulationData: l,
      gfx,
      color: computedStyleMap["--lightgray"],
      alpha: 1,
      active: false,
    });
  }

  let currentTransform = zoomIdentity;
  if (enableDrag) {
    // oxlint-disable-next-line typescript/no-explicit-any -- d3 and pixi objects meet here untyped; typing this seam is a follow-up
    select(app.canvas as any).call(
      drag()
        // oxlint-disable-next-line typescript/no-explicit-any -- d3 and pixi objects meet here untyped; typing this seam is a follow-up
        .container(() => app.canvas as any)
        .subject(() => graphData.nodes.find((n) => n.id === hoveredNodeId))
        // oxlint-disable-next-line typescript/no-explicit-any -- d3 and pixi objects meet here untyped; typing this seam is a follow-up
        .on("start", (event: any) => {
          if (!event.active) simulation.alphaTarget(1).restart();
          event.subject.fx = event.subject.x;
          event.subject.fy = event.subject.y;
          event.subject.__initialDragPos = {
            x: event.subject.x,
            y: event.subject.y,
            fx: event.subject.fx,
            fy: event.subject.fy,
          };
          dragStartTime = Date.now();
          dragging = true;
        })
        // oxlint-disable-next-line typescript/no-explicit-any -- d3 and pixi objects meet here untyped; typing this seam is a follow-up
        .on("drag", (event: any) => {
          const initPos = event.subject.__initialDragPos;
          event.subject.fx = initPos.x + (event.x - initPos.x) / currentTransform.k;
          event.subject.fy = initPos.y + (event.y - initPos.y) / currentTransform.k;
        })
        // oxlint-disable-next-line typescript/no-explicit-any -- d3 and pixi objects meet here untyped; typing this seam is a follow-up
        .on("end", (event: any) => {
          if (!event.active) simulation.alphaTarget(0);
          event.subject.fx = null;
          event.subject.fy = null;
          dragging = false;
          if (Date.now() - dragStartTime < 500) {
            const node = graphData.nodes.find((n) => n.id === event.subject.id);
            go(resolveRelative(fullSlug as FullSlug, node.id));
          }
          // oxlint-disable-next-line typescript/no-explicit-any -- d3 and pixi objects meet here untyped; typing this seam is a follow-up
        }) as any,
    );
  } else {
    for (const node of nodeRenderData) {
      node.gfx.on("click", () => go(resolveRelative(fullSlug as FullSlug, node.simulationData.id)));
    }
  }

  if (enableZoom) {
    // oxlint-disable-next-line typescript/no-explicit-any -- d3 and pixi objects meet here untyped; typing this seam is a follow-up
    select(app.canvas as any).call(
      zoom()
        .extent([
          [0, 0],
          [width, height],
        ])
        .scaleExtent([0.25, 4])
        // oxlint-disable-next-line typescript/no-explicit-any -- d3 and pixi objects meet here untyped; typing this seam is a follow-up
        .on("zoom", ({ transform }: any) => {
          currentTransform = transform;
          stage.scale.set(transform.k, transform.k);
          stage.position.set(transform.x, transform.y);
          const zscale = transform.k * opacityScale;
          const scaleOpacity = Math.max((zscale - 1) / 3.75, 0);
          const activeNodes = new Set(
            nodeRenderData.filter((n) => n.active).flatMap((n) => n.label),
          );
          for (const label of labelsContainer.children) {
            // oxlint-disable-next-line typescript/no-explicit-any -- d3 and pixi objects meet here untyped; typing this seam is a follow-up
            if (!activeNodes.has(label)) (label as any).alpha = scaleOpacity;
          }
          // oxlint-disable-next-line typescript/no-explicit-any -- d3 and pixi objects meet here untyped; typing this seam is a follow-up
        }) as any,
    );
  }

  let stopAnimation = false;
  function animate(time: number) {
    if (stopAnimation) return;
    for (const n of nodeRenderData) {
      const { x, y } = n.simulationData;
      if (!x || !y) continue;
      n.gfx.position.set(x + width / 2, y + height / 2);
      if (n.label) n.label.position.set(x + width / 2, y + height / 2);
    }
    for (const l of linkRenderData) {
      const ld = l.simulationData;
      l.gfx.clear();
      l.gfx.moveTo(ld.source.x + width / 2, ld.source.y + height / 2);
      l.gfx
        .lineTo(ld.target.x + width / 2, ld.target.y + height / 2)
        .stroke({ alpha: l.alpha, width: 1, color: l.color });
    }
    tweens.forEach((t) => t.update(time));
    app.renderer.render(stage);
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  return () => {
    stopAnimation = true;
    // removeView: a redraw (theme change) may replace this graph while the island stays
    // mounted, so the old canvas must leave the DOM too.
    app.destroy({ removeView: true });
  };
}

/**
 * One graph drawn into a container, redrawn on demand. Async-abort guard: renderGraph awaits
 * loadData() + pixi app.init(); if the island is torn down, the graph cleared, or a newer
 * draw started (a theme change) mid-await, a resolved graph would append a canvas and start
 * an unbounded rAF loop on an app nothing destroys. So each draw checks it is still current.
 */
function graphSlot(
  container: () => HTMLElement | null,
  slug: string,
  cfg: D3Config,
  go: (href: string) => void,
  onSections?: (sections: Section[]) => void,
) {
  let gen = 0;
  let disposed = false;
  let cleanup: (() => void) | null = null;
  const clear = () => {
    gen++;
    cleanup?.();
    cleanup = null;
  };
  const draw = async () => {
    clear();
    const mine = gen;
    const el = container();
    if (!el) return;
    const data = await loadData();
    if (disposed || mine !== gen) return;
    const drawn = await renderGraph(el, slug, cfg, data, go, onSections);
    if (disposed || mine !== gen) {
      drawn();
      return;
    }
    cleanup = drawn;
  };
  const dispose = () => {
    disposed = true;
    clear();
  };
  return { draw, clear, dispose };
}

export default function Graph() {
  const localContainer = useRef<HTMLDivElement>(null);
  const globalOuter = useRef<HTMLDivElement>(null);
  const globalContainer = useRef<HTMLDivElement>(null);
  const globalIcon = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const [legend, setLegend] = useState<Section[]>([]);

  useEffect(() => {
    const slug = document.body.dataset.slug ?? "";
    const go = (href: string) => {
      const url = new URL(href, window.location.href);
      void router.navigate({ href: url.pathname + url.search + url.hash });
    };
    const local = graphSlot(() => localContainer.current, slug, LOCAL_CFG, go, setLegend);
    const global = graphSlot(() => globalContainer.current, slug, GLOBAL_CFG, go);
    void local.draw();

    let escCleanup: (() => void) | null = null;
    const isGlobalOpen = () => globalOuter.current?.classList.contains("active") ?? false;
    const hideGlobal = () => {
      global.clear();
      escCleanup?.();
      escCleanup = null;
      globalOuter.current?.classList.remove("active");
    };
    const showGlobal = () => {
      globalOuter.current?.classList.add("active");
      escCleanup?.();
      escCleanup = registerEscapeHandler(globalOuter.current, hideGlobal);
      void global.draw();
    };

    // The colours are read when a graph draws, so a theme change redraws it.
    const stopWatching = watchTheme(() => {
      void local.draw();
      if (isGlobalOpen()) void global.draw();
    });

    const onShortcut = (e: KeyboardEvent) => {
      if (e.key === "g" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        if (isGlobalOpen()) hideGlobal();
        else showGlobal();
      }
    };
    document.addEventListener("keydown", onShortcut);
    const iconEl = globalIcon.current;
    iconEl?.addEventListener("click", showGlobal);

    return () => {
      stopWatching();
      document.removeEventListener("keydown", onShortcut);
      iconEl?.removeEventListener("click", showGlobal);
      local.dispose();
      global.dispose();
      escCleanup?.();
    };
  }, [router]);

  return (
    <div className="graph">
      <div className="graph-outer">
        <div ref={localContainer} className="graph-container" />
        <button
          ref={globalIcon}
          className="ak-iconbtn global-graph-icon"
          aria-label="Open the full graph"
          type="button"
        >
          <ExpandIcon />
        </button>
      </div>
      {legend.length > 0 && (
        <ul className="ak-graph-legend" aria-label="Sections in this graph">
          {legend.map((s) => (
            <li key={s.id} style={{ "--hue": s.hue }}>
              <span className="ak-dot" aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div ref={globalOuter} className="global-graph-outer">
        <div ref={globalContainer} className="global-graph-container" />
      </div>
    </div>
  );
}

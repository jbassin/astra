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
 * __root). Node/link/label colors read Quartz CSS vars via getComputedStyle — those
 * names are shimmed to the gothic void palette in globals.css. The `themechange`
 * listener re-renders the local graph; it's now dormant (astra is dark-only and the
 * theme toggle was removed) but kept harmless for the N5 teardown contract — every
 * listener / pixi app is torn down on unmount.
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
import { useEffect, useRef } from "react";
import { type FullSlug, resolveRelative, simplifySlug } from "@/domain/lib/slug";
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

const VISITED_KEY = "graph-visited";
const getVisited = (): Set<string> =>
  new Set(JSON.parse(localStorage.getItem(VISITED_KEY) ?? "[]"));
const addToVisited = (slug: string) => {
  const v = getVisited();
  v.add(slug);
  localStorage.setItem(VISITED_KEY, JSON.stringify([...v]));
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
): Promise<() => void> {
  const slug = simplifySlug(fullSlug as FullSlug);
  const visited = getVisited();
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
  const graphData: { nodes: any[]; links: any[] } = buildGraphData(data, slug, cfg);

  // No edges → skip pixi entirely and show an intentional placeholder. Otherwise a
  // connection-less page (home, the tags index) renders an empty canvas that reads
  // as a broken widget (F8). The global-graph icon stays — the full graph is still
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
  const height = Math.max(graph.offsetHeight, 250);

  const simulation = forceSimulation(graphData.nodes)
    .force("charge", forceManyBody().strength(-100 * repelForce))
    .force("center", forceCenter().strength(centerForce))
    .force("link", forceLink(graphData.links).distance(linkDistance))
    .force("collide", forceCollide((n: any) => nodeRadius(n)).iterations(3));

  const radius = (Math.min(width, height) / 2) * 0.8;
  if (enableRadial) simulation.force("radial", forceRadial(radius).strength(0.2));

  // Quartz var names → shimmed to the gothic void palette in globals.css. Read as
  // literal values (the shim is concrete hex, so getComputedStyle returns a color
  // pixi can parse — a `var()` ref would come back unresolved in some browsers).
  const cs = getComputedStyle(document.documentElement);
  const computedStyleMap = {
    "--secondary": cs.getPropertyValue("--secondary"),
    "--tertiary": cs.getPropertyValue("--tertiary"),
    "--gray": cs.getPropertyValue("--gray"),
    "--light": cs.getPropertyValue("--light"),
    "--lightgray": cs.getPropertyValue("--lightgray"),
    "--dark": cs.getPropertyValue("--dark"),
    "--darkgray": cs.getPropertyValue("--darkgray"),
    "--bodyFont": cs.getPropertyValue("--bodyFont"),
  };

  const color = (dd: any) => {
    if (dd.id === slug) return computedStyleMap["--secondary"];
    if (visited.has(dd.id) || dd.id.startsWith("tags/")) return computedStyleMap["--tertiary"];
    return computedStyleMap["--gray"];
  };
  function nodeRadius(dd: any) {
    const numLinks = graphData.links.filter(
      (l: any) => l.source.id === dd.id || l.target.id === dd.id,
    ).length;
    return 2 + Math.sqrt(numLinks);
  }

  let hoveredNodeId: string | null = null;
  let hoveredNeighbours = new Set<string>();
  const linkRenderData: any[] = [];
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
      .fill({ color: isTagNode ? computedStyleMap["--light"] : color(n) })
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
    if (isTagNode) gfx.stroke({ width: 2, color: computedStyleMap["--tertiary"] });
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
    select(app.canvas as any).call(
      drag()
        .container(() => app.canvas as any)
        .subject(() => graphData.nodes.find((n) => n.id === hoveredNodeId))
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
        .on("drag", (event: any) => {
          const initPos = event.subject.__initialDragPos;
          event.subject.fx = initPos.x + (event.x - initPos.x) / currentTransform.k;
          event.subject.fy = initPos.y + (event.y - initPos.y) / currentTransform.k;
        })
        .on("end", (event: any) => {
          if (!event.active) simulation.alphaTarget(0);
          event.subject.fx = null;
          event.subject.fy = null;
          dragging = false;
          if (Date.now() - dragStartTime < 500) {
            const node = graphData.nodes.find((n) => n.id === event.subject.id);
            window.location.assign(resolveRelative(fullSlug as FullSlug, node.id));
          }
        }) as any,
    );
  } else {
    for (const node of nodeRenderData) {
      node.gfx.on("click", () =>
        window.location.assign(resolveRelative(fullSlug as FullSlug, node.simulationData.id)),
      );
    }
  }

  if (enableZoom) {
    select(app.canvas as any).call(
      zoom()
        .extent([
          [0, 0],
          [width, height],
        ])
        .scaleExtent([0.25, 4])
        .on("zoom", ({ transform }: any) => {
          currentTransform = transform;
          stage.scale.set(transform.k, transform.k);
          stage.position.set(transform.x, transform.y);
          const zscale = transform.k * opacityScale;
          const scaleOpacity = Math.max((zscale - 1) / 3.75, 0);
          const activeNodes = nodeRenderData.filter((n) => n.active).flatMap((n) => n.label);
          for (const label of labelsContainer.children) {
            if (!activeNodes.includes(label)) (label as any).alpha = scaleOpacity;
          }
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
    app.destroy();
  };
}

export default function Graph() {
  const localContainer = useRef<HTMLDivElement>(null);
  const globalOuter = useRef<HTMLDivElement>(null);
  const globalContainer = useRef<HTMLDivElement>(null);
  const globalIcon = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const slug = document.body.dataset.slug ?? "";
    addToVisited(simplifySlug(slug as FullSlug));

    // Async-abort guard: renderGraph awaits loadData() + pixi app.init(); if the
    // island is torn down mid-await, a resolved graph would append a canvas and
    // start an unbounded rAF loop on an app nothing destroys. Bail + destroy.
    let disposed = false;
    let localCleanup: (() => void) | null = null;
    const globalCleanups: (() => void)[] = [];
    let escCleanup: (() => void) | null = null;

    const renderLocal = async () => {
      localCleanup?.();
      localCleanup = null;
      const el = localContainer.current;
      if (!el) return;
      const data = await loadData();
      if (disposed) return;
      const cleanup = await renderGraph(el, slug, LOCAL_CFG, data);
      if (disposed) {
        cleanup();
        return;
      }
      localCleanup = cleanup;
    };
    void renderLocal();

    const onThemeChange = () => void renderLocal();
    document.addEventListener("themechange", onThemeChange);

    const hideGlobal = () => {
      for (const c of globalCleanups.splice(0)) c();
      escCleanup?.();
      escCleanup = null;
      globalOuter.current?.classList.remove("active");
    };
    const showGlobal = async () => {
      globalOuter.current?.classList.add("active");
      escCleanup = registerEscapeHandler(globalOuter.current, hideGlobal);
      const el = globalContainer.current;
      if (!el) return;
      const data = await loadData();
      if (disposed) return;
      const cleanup = await renderGraph(el, slug, GLOBAL_CFG, data);
      if (disposed || !globalOuter.current?.classList.contains("active")) {
        cleanup();
        return;
      }
      globalCleanups.push(cleanup);
    };

    const onShortcut = (e: KeyboardEvent) => {
      if (e.key === "g" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        if (globalOuter.current?.classList.contains("active")) hideGlobal();
        else void showGlobal();
      }
    };
    document.addEventListener("keydown", onShortcut);

    const iconEl = globalIcon.current;
    const onIconClick = () => void showGlobal();
    iconEl?.addEventListener("click", onIconClick);

    return () => {
      disposed = true;
      document.removeEventListener("themechange", onThemeChange);
      document.removeEventListener("keydown", onShortcut);
      iconEl?.removeEventListener("click", onIconClick);
      localCleanup?.();
      for (const c of globalCleanups.splice(0)) c();
      escCleanup?.();
    };
  }, []);

  return (
    <div className="graph">
      <h3>Graph View</h3>
      <div className="graph-outer">
        <div ref={localContainer} className="graph-container" />
        <button
          ref={globalIcon}
          className="global-graph-icon"
          aria-label="Global Graph"
          type="button"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 55 55" fill="currentColor">
            <title>Global Graph</title>
            <path d="M49,0c-3.309,0-6,2.691-6,6c0,1.035,0.263,2.009,0.726,2.86l-9.829,9.829C32.542,17.634,30.846,17,29,17 s-3.542,0.634-4.898,1.688l-7.669-7.669C16.785,10.424,17,9.74,17,9c0-2.206-1.794-4-4-4S9,6.794,9,9s1.794,4,4,4 c0.74,0,1.424-0.215,2.019-0.567l7.669,7.669C21.634,21.458,21,23.154,21,25s0.634,3.542,1.688,4.897L10.024,42.562 C8.958,41.595,7.549,41,6,41c-3.309,0-6,2.691-6,6s2.691,6,6,6s6-2.691,6-6c0-1.035-0.263-2.009-0.726-2.86l12.829-12.829 c1.106,0.86,2.44,1.436,3.898,1.619v10.16c-2.833,0.478-5,2.942-5,5.91c0,3.309,2.691,6,6,6s6-2.691,6-6c0-2.967-2.167-5.431-5-5.91 v-10.16c1.458-0.183,2.792-0.759,3.898-1.619l7.669,7.669C41.215,39.576,41,40.26,41,41c0,2.206,1.794,4,4,4s4-1.794,4-4 s-1.794-4-4-4c-0.74,0-1.424,0.215-2.019,0.567l-7.669-7.669C36.366,28.542,37,26.846,37,25s-0.634-3.542-1.688-4.897l9.665-9.665 C46.042,11.405,47.451,12,49,12c3.309,0,6-2.691,6-6S52.309,0,49,0z M11,9c0-1.103,0.897-2,2-2s2,0.897,2,2s-0.897,2-2,2 S11,10.103,11,9z M6,51c-2.206,0-4-1.794-4-4s1.794-4,4-4s4,1.794,4,4S8.206,51,6,51z M33,49c0,2.206-1.794,4-4,4s-4-1.794-4-4 s1.794-4,4-4S33,46.794,33,49z M29,31c-3.309,0-6-2.691-6-6s2.691-6,6-6s6,2.691,6,6S32.309,31,29,31z M47,41c0,1.103-0.897,2-2,2 s-2-0.897-2-2s0.897-2,2-2S47,39.897,47,41z M49,10c-2.206,0-4-1.794-4-4s1.794-4,4-4s4,1.794,4,4S51.206,10,49,10z" />
          </svg>
        </button>
      </div>
      <div ref={globalOuter} className="global-graph-outer">
        <div ref={globalContainer} className="global-graph-container" />
      </div>
    </div>
  );
}

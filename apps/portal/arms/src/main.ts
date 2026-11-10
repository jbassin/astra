// ik-arms: draws a jointed arm from a fixed anchor point to a token, and re-poses it every time
// the token moves. The token is the hand; the arm is drawn under all tokens. Every client poses
// the arm itself from the token's on-screen position, so nothing is synced beyond the token flag
// that configures it (see config.ts).

import { type ArmConfig, FLAG_KEY, FLAG_SCOPE, parseArmFlag } from "./config";
import { reachRadius } from "./region";
import { ARM_VERT, fragmentSource, SMEAR_SHADER } from "./shaders";
import { createSmear, type InkHand } from "./smear";
import { defaultLength, type Point, solve } from "./solve";
import { allocateStrip, type StripArrays, stripEnd, stripIndices, writeStrip } from "./strip";

/** PrimaryCanvasGroup sort layers: drawings are 600 and tokens 700, so 690 is just under tokens. */
const SORT_LAYER = 690;

const MODULE_ID = "ik-arms";
const BUFFER_SIZE_KEY = "bufferSize";
const BUFFER_SIZES = [512, 1024] as const;
const DEFAULT_BUFFER_SIZE = 1024;

/** The strip's vertex attributes: geometry buffer name, `StripArrays` key, floats per vertex. */
const ATTRIBUTES = [
  ["aVertexPosition", "position", 2],
  ["aUv", "uv", 2],
  ["aDist", "dist", 1],
  ["aSeg", "seg", 1],
  ["aHalf", "half", 1],
] as const satisfies readonly (readonly [string, keyof StripArrays, number])[];

/** One arm's shader uniforms; PIXI reads this object every frame, so it is mutated in place. */
interface Uniforms {
  [name: string]: unknown;
  uTime: number;
  uLength: number;
  uSegments: number;
  uColorA: Float32Array;
  uColorB: Float32Array;
  uColorC: Float32Array;
  uOutlineWidth: number;
  uAlpha: number;
}

interface Arm {
  readonly container: PIXI.Container;
  readonly mesh: PIXI.Mesh;
  /** The mesh's vertex data: the same arrays as its geometry buffers. */
  readonly strip: StripArrays;
  readonly uniforms: Uniforms;
  /** The joint discs, when the flag asks for them. */
  readonly rings: PIXI.Graphics | null;
  /** The hand the smear buffer draws, for an ink arm whose flag asks for one. */
  readonly hand: InkHand | null;
  readonly config: ArmConfig;
  /** One segment's length in pixels (the flag's, or fitted when the arm was built). */
  readonly length: number;
  /** The drag preview the arm is following, while there is one. */
  preview: FoundryToken | null;
  /** The last pose, shoulder first. */
  joints: Point[];
}

interface IkArmsApi {
  attach(token: FoundryToken, options?: Record<string, unknown>): Promise<Record<string, unknown>>;
  detach(token: FoundryToken): Promise<unknown>;
  pickAnchor(tokens?: FoundryToken[]): Promise<void>;
  /** Remake the smear buffer's textures (the buffer size setting calls this). */
  rebuildSmear(): void;
  teardown(): void;
  readonly arms: ReadonlyMap<string, Arm>;
}

declare global {
  var ikArms: IkArmsApi | undefined;
}

// Importing this file again (the dev-load macro does) replaces the running instance.
globalThis.ikArms?.teardown();

const arms = new Map<string, Arm>();
const hooks: [name: string, id: number][] = [];
function on(name: string, fn: (...args: never[]) => void): void {
  hooks.push([name, Hooks.on(name, fn)]);
}

/** The centre of the token where it is drawn right now (mid-animation or mid-drag included).
 * `Token#center` is no use here: it reports where the move will end. */
function centerOf(token: FoundryToken): Point {
  return { x: token.position.x + token.w / 2, y: token.position.y + token.h / 2 };
}

/** The hand's radius in pixels: the token's half width times the flag's `handSize`. */
function handRadius(token: FoundryToken, config: ArmConfig): number {
  return (token.w / 2) * config.handSize;
}

/** A 0xRRGGBB colour as the 0..1 RGB triple a vec3 uniform takes. */
function rgb(color: number): Float32Array {
  return new Float32Array([
    ((color >> 16) & 255) / 255,
    ((color >> 8) & 255) / 255,
    (color & 255) / 255,
  ]);
}

/**
 * The client's buffer size setting. It is registered on `init`; importing this file again later
 * (the dev-load macro does) finds it registered already, and its `onChange` goes through
 * `globalThis.ikArms` so that it reaches the running instance, not the first one.
 */
function registerSettings(): void {
  if (game.settings.settings.has(`${MODULE_ID}.${BUFFER_SIZE_KEY}`)) return;
  game.settings.register(MODULE_ID, BUFFER_SIZE_KEY, {
    name: "Ink buffer size",
    hint: "Texels per side of the smear buffer behind ink arms. 512 is lighter on weak machines.",
    scope: "client",
    config: true,
    type: Number,
    choices: { 512: "512", 1024: "1024" },
    default: DEFAULT_BUFFER_SIZE,
    onChange: () => globalThis.ikArms?.rebuildSmear(),
  });
}

function bufferSize(): number {
  try {
    const value = Number(game.settings.get(MODULE_ID, BUFFER_SIZE_KEY));
    return BUFFER_SIZES.find((size) => size === value) ?? DEFAULT_BUFFER_SIZE;
  } catch {
    return DEFAULT_BUFFER_SIZE; // not registered (loaded before init failed to run)
  }
}

const smear = createSmear({
  renderer: () => canvas.app.renderer,
  primary: () => canvas.primary,
  bufferSize,
  sortLayer: SORT_LAYER,
});

// Every arm's uTime counts seconds from when this file loaded, on Foundry's canvas ticker.
const startTime = performance.now();
let ticker: PIXI.Ticker | null = null;
function tick(): void {
  const time = (performance.now() - startTime) / 1000;
  for (const arm of arms.values()) arm.uniforms.uTime = time;
  smear.update(time, Math.min((ticker?.deltaMS ?? 0) / 1000, 0.1));
}

function draw(arm: Arm): void {
  const { config, mesh, strip, uniforms, rings, joints, container } = arm;
  const grid = canvas.grid.size;
  const n = joints.length - 1;
  uniforms.uLength = writeStrip(
    strip,
    joints,
    (grid * config.shoulderWidth) / 2,
    (grid * config.wristWidth) / 2,
    config.smooth,
  );
  for (const [buffer] of ATTRIBUTES) mesh.geometry.getBuffer(buffer).update();
  uniforms.uAlpha = container.alpha;

  if (!rings) return;
  // Joint discs go on top of the strip, so each joint reads as a hinge.
  rings.clear();
  for (const [i, joint] of joints.entries()) {
    const half =
      (grid * (config.shoulderWidth + ((config.wristWidth - config.shoulderWidth) * i) / n)) / 2;
    rings.lineStyle(config.outlineWidth, config.outline, 1);
    rings.beginFill(config.fill);
    rings.drawCircle(joint.x, joint.y, half * 1.25);
    rings.endFill();
  }
}

function makeMesh(config: ArmConfig): { mesh: PIXI.Mesh; strip: StripArrays; uniforms: Uniforms } {
  // The geometry's buffers wrap these arrays, so writing them and calling `update()` re-uploads.
  const strip = allocateStrip(config.segments);
  const geometry = new PIXI.Geometry();
  for (const [buffer, key, size] of ATTRIBUTES) geometry.addAttribute(buffer, strip[key], size);
  geometry.addIndex(stripIndices(config.segments));
  const uniforms: Uniforms = {
    uTime: 0,
    uLength: 1,
    uSegments: config.segments,
    uColorA: rgb(config.fill),
    uColorB: rgb(config.outline),
    uColorC: rgb(config.glow),
    uOutlineWidth: config.outlineWidth,
    uAlpha: 1,
  };
  const shader = PIXI.Shader.from(ARM_VERT, fragmentSource(config.shader), uniforms);
  return { mesh: new PIXI.Mesh(geometry, shader), strip, uniforms };
}

function pose(token: FoundryToken): void {
  const arm = arms.get(token.id);
  if (!arm || arm.container.destroyed) return;
  // While the GM drags the token, the arm follows the drag preview and ignores the original.
  if (token.isPreview) arm.preview = token;
  else if (arm.preview && !arm.preview.destroyed) return;
  const hidden = token.document.hidden;
  arm.container.visible = !hidden || game.user.isGM;
  arm.container.alpha = hidden ? 0.5 : 1;
  const { anchor, segments, bend, bendPattern } = arm.config;
  arm.joints = solve(anchor, centerOf(token), segments, arm.length, bend, bendPattern);
  draw(arm);
  if (arm.hand) {
    // At the token centre (the strip's last point), facing the way the arm arrives.
    const end = stripEnd(arm.strip);
    arm.hand.at.set([end.x, end.y, end.dx, end.dy]);
    arm.hand.params[0] = handRadius(token, arm.config);
  }
}

function remove(tokenId: string): void {
  const arm = arms.get(tokenId);
  if (!arm) return;
  arms.delete(tokenId);
  // Before the container: the smear's paint mesh shares the arm mesh's geometry.
  smear.remove(tokenId);
  if (!arm.container.destroyed) arm.container.destroy({ children: true });
}

function build(token: FoundryToken): void {
  remove(token.id);
  const config = parseArmFlag(token.document.getFlag(FLAG_SCOPE, FLAG_KEY));
  if (!config) return;

  const container = new PIXI.Container();
  container.eventMode = "none";
  container.sortLayer = SORT_LAYER;
  container.elevation = token.document.elevation;
  container.sort = 0;
  const { mesh, strip, uniforms } = makeMesh(config);
  const ink = config.shader === SMEAR_SHADER;
  // An ink arm is drawn by the shared smear buffer; its own mesh only feeds it geometry.
  mesh.visible = !ink;
  container.addChild(mesh);
  const rings = config.rings ? container.addChild(new PIXI.Graphics()) : null;
  // The thumb goes on the side the joints bend to.
  const hand: InkHand | null =
    ink && config.hand
      ? {
          at: new Float32Array([0, 0, 1, 0]),
          params: new Float32Array([handRadius(token, config), config.bend, config.curl, 0]),
        }
      : null;
  canvas.primary.addChild(container);
  if (!ticker) {
    ticker = canvas.app.ticker;
    ticker.add(tick);
  }
  canvas.primary.sortDirty = true;
  const length =
    config.length ??
    defaultLength(config.anchor, centerOf(token), config.segments, canvas.grid.size);
  arms.set(token.id, {
    container,
    mesh,
    strip,
    uniforms,
    rings,
    hand,
    config,
    length,
    preview: null,
    joints: [],
  });
  pose(token);
  if (ink) {
    const grid = canvas.grid.size;
    const maxWidth = grid * Math.max(config.shoulderWidth, config.wristWidth);
    smear.add(token.id, {
      geometry: mesh.geometry,
      uniforms,
      reach: {
        anchor: config.anchor,
        radius: reachRadius(
          config.segments,
          length,
          maxWidth,
          grid,
          hand ? handRadius(token, config) : 0,
        ),
      },
      colorA: uniforms.uColorA,
      colorC: uniforms.uColorC,
      elevation: token.document.elevation,
      hand,
      // pose() hides a hidden token's arm from players, so its ink follows the same rule.
      paints: () => !container.destroyed && container.visible,
    });
  }
}

on("drawToken", (token: FoundryToken) => {
  if (!token.isPreview) build(token);
});
on("refreshToken", (token: FoundryToken) => {
  pose(token);
});
on("destroyToken", (token: FoundryToken) => {
  if (!token.isPreview) {
    remove(token.id);
    return;
  }
  const arm = arms.get(token.id);
  if (arm?.preview === token) arm.preview = null;
  const original = canvas.tokens.get(token.id);
  if (original && !original.destroyed) pose(original);
});
// Leaving the scene: drop every arm and the smear buffer before the canvas goes.
on("canvasTearDown", () => {
  for (const id of arms.keys()) remove(id);
  smear.teardown();
});
on("updateToken", (doc: FoundryTokenDocument, change: Record<string, unknown>) => {
  if (!doc.object) return;
  const flags = change.flags;
  const armChanged = typeof flags === "object" && flags !== null && FLAG_SCOPE in flags;
  if (armChanged || "elevation" in change) build(doc.object);
});

/**
 * Give a token an arm, or change its arm. `options` are flag fields (config.ts) merged over the
 * token's current flag; `anchor` is required the first time. A missing or null `length` is fitted
 * to where the token stands now.
 */
async function attach(
  token: FoundryToken,
  options: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const doc = token.document;
  const current = doc.getFlag(FLAG_SCOPE, FLAG_KEY);
  const next: Record<string, unknown> = {
    ...(typeof current === "object" && current !== null ? current : {}),
    ...options,
  };
  const config = parseArmFlag(next);
  if (!config) throw new Error("ikArms.attach needs an anchor: {anchor: {x, y}}");
  if (config.length === null) {
    const center = { x: doc.x + token.w / 2, y: doc.y + token.h / 2 };
    next.length = defaultLength(config.anchor, center, config.segments, canvas.grid.size);
  }
  await doc.setFlag(FLAG_SCOPE, FLAG_KEY, next);
  return next;
}

function detach(token: FoundryToken): Promise<unknown> {
  return token.document.unsetFlag(FLAG_SCOPE, FLAG_KEY);
}

function nextCanvasClick(): Promise<Point> {
  return new Promise((resolve) => {
    canvas.app.view.addEventListener(
      "pointerdown",
      (event) => {
        // Capture phase, and stopped here, so the click does not also deselect the tokens.
        event.stopImmediatePropagation();
        event.preventDefault();
        resolve(canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY }));
      },
      { once: true, capture: true },
    );
  });
}

/** For each selected token in turn, click the map to place that token's anchor. */
async function pickAnchor(tokens: FoundryToken[] = canvas.tokens.controlled): Promise<void> {
  const hands = [...tokens];
  if (hands.length === 0) {
    ui.notifications.warn("Select the hand tokens first.");
    return;
  }
  for (const token of hands) {
    ui.notifications.info(`Click where the arm of ${token.name} is anchored.`);
    // One click per token, in order: these must not run in parallel.
    const point = await nextCanvasClick();
    await attach(token, {
      anchor: { x: Math.round(point.x), y: Math.round(point.y) },
      length: null,
    });
  }
}

function teardown(): void {
  for (const [name, id] of hooks) Hooks.off(name, id);
  for (const id of arms.keys()) remove(id);
  smear.teardown();
  ticker?.remove(tick);
  ticker = null;
  globalThis.ikArms = undefined;
}

globalThis.ikArms = {
  attach,
  detach,
  pickAnchor,
  rebuildSmear: () => smear.rebuild(),
  teardown,
  arms,
};

// Loaded as a module, this runs before `init`. Loaded into a running world (the dev-load macro),
// `init` is long past, so the setting is registered now if no earlier load registered it.
if (typeof game !== "undefined" && game.ready) registerSettings();
else hooks.push(["init", Hooks.once("init", registerSettings)]);

// Loaded as a module, this runs before the canvas exists and `drawToken` builds the arms later.
// Loaded into a running world, the tokens are already drawn.
if (typeof canvas !== "undefined" && canvas.ready) {
  for (const token of canvas.tokens.placeables) build(token);
}

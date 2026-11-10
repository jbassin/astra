// ik-arms: draws a jointed arm from a fixed anchor point to a token, and re-poses it every time
// the token moves. The token is the hand; the arm is drawn under all tokens. Every client poses
// the arm itself from the token's on-screen position, so nothing is synced beyond the token flag
// that configures it (see config.ts).

import { type ArmConfig, FLAG_KEY, FLAG_SCOPE, parseArmFlag } from "./config";
import { defaultLength, type Point, solve } from "./solve";

/** PrimaryCanvasGroup sort layers: drawings are 600 and tokens 700, so 690 is just under tokens. */
const SORT_LAYER = 690;

interface Arm {
  readonly container: PIXI.Container;
  readonly graphics: PIXI.Graphics;
  readonly sprites: PIXI.Sprite[] | null;
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

function draw(arm: Arm): void {
  const { config, graphics, sprites, joints } = arm;
  const grid = canvas.grid.size;
  const last = joints.length - 1;
  /** Half the arm's thickness at joint `i`, tapering from shoulder to wrist. */
  const half = (i: number): number =>
    (grid * (config.shoulderWidth + ((config.wristWidth - config.shoulderWidth) * i) / last)) / 2;

  graphics.clear();
  for (const [i, p] of joints.entries()) {
    const q = joints[i + 1];
    if (!q) break;
    const angle = Math.atan2(q.y - p.y, q.x - p.x);
    const sprite = sprites?.[i];
    if (sprite) {
      sprite.position.set(p.x, p.y);
      sprite.rotation = angle;
      sprite.width = Math.hypot(q.x - p.x, q.y - p.y);
      sprite.height = 2 * half(i);
      continue;
    }
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    const w0 = half(i);
    const w1 = half(i + 1);
    graphics.lineStyle(config.outlineWidth, config.outline, 1);
    graphics.beginFill(config.fill);
    graphics.drawPolygon([
      p.x + nx * w0,
      p.y + ny * w0,
      q.x + nx * w1,
      q.y + ny * w1,
      q.x - nx * w1,
      q.y - ny * w1,
      p.x - nx * w0,
      p.y - ny * w0,
    ]);
    graphics.endFill();
  }
  if (sprites) return;
  // Joint discs go on top of the segment ends, so each joint reads as a hinge.
  for (const [i, joint] of joints.entries()) {
    graphics.lineStyle(config.outlineWidth, config.outline, 1);
    graphics.beginFill(config.fill);
    graphics.drawCircle(joint.x, joint.y, half(i) * 1.25);
    graphics.endFill();
  }
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
}

function remove(tokenId: string): void {
  const arm = arms.get(tokenId);
  if (!arm) return;
  arms.delete(tokenId);
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
  const graphics = container.addChild(new PIXI.Graphics());
  let sprites: PIXI.Sprite[] | null = null;
  if (config.texture !== null) {
    const texture = PIXI.Texture.from(config.texture);
    sprites = [];
    for (let i = 0; i < config.segments; i++) {
      const sprite = container.addChild(new PIXI.Sprite(texture));
      sprite.anchor.set(0, 0.5);
      sprites.push(sprite);
    }
  }
  canvas.primary.addChild(container);
  canvas.primary.sortDirty = true;
  const length =
    config.length ??
    defaultLength(config.anchor, centerOf(token), config.segments, canvas.grid.size);
  arms.set(token.id, { container, graphics, sprites, config, length, preview: null, joints: [] });
  pose(token);
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
  globalThis.ikArms = undefined;
}

globalThis.ikArms = { attach, detach, pickAnchor, teardown, arms };

// Loaded as a module, this runs before the canvas exists and `drawToken` builds the arms later.
// Loaded into a running world, the tokens are already drawn.
if (typeof canvas !== "undefined" && canvas.ready) {
  for (const token of canvas.tokens.placeables) build(token);
}

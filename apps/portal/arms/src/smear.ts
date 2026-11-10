// The shared smear buffer for `shader: "ink"` arms. One square on the map covers every ink arm's
// reach. Each frame, three passes run, as in the bench's "world" mode:
//   1. paint: every ink arm draws its ink body into the arm texture (its own uniforms);
//   2. buffer: one quad reads the arm texture and last frame's buffer, smears and fades the ink,
//      and writes the other buffer texture (ping-pong);
//   3. image: one quad in canvas.primary lights the buffer over the square, under the tokens.
// The textures exist only while at least one ink arm does.

import { type Region, type Reach, sameRegion, smearRegion } from "./region";
import {
  ARM_VERT,
  fragmentSource,
  INK_BUFFER_FRAG,
  INK_IMAGE_FRAG,
  QUAD_VERT,
  SMEAR_SHADER,
} from "./shaders";

/** What the smear needs from one ink arm. */
interface InkArm {
  /** The arm mesh's geometry; the paint mesh draws the same strip. */
  readonly geometry: PIXI.Geometry;
  /** The arm's own uniforms (uTime, uLength, ...), kept current by main.ts. */
  readonly uniforms: Record<string, unknown>;
  readonly reach: Reach;
  /** The flag's fill and glow colours, as vec3 uniforms. */
  readonly colorA: Float32Array;
  readonly colorC: Float32Array;
  /** The token's elevation; the image pass sits at the lowest ink arm's. */
  readonly elevation: number;
  /** Whether the arm paints this frame (false for a hidden token's arm on a player's client). */
  paints(): boolean;
}

interface Smear {
  /** Add an ink arm, or replace the one with this id. */
  add(id: string, arm: InkArm): void;
  remove(id: string): void;
  /** Run the three passes; call once per frame, after the arms' uniforms are current. */
  update(time: number, delta: number): void;
  /** Drop the textures so the next frame makes them again (the buffer size setting changed). */
  rebuild(): void;
  /** Remove every arm and free everything. */
  teardown(): void;
}

interface SmearHost {
  readonly renderer: () => PIXI.Renderer;
  /** Where the image pass goes: Foundry's `canvas.primary`. */
  readonly primary: () => PIXI.Container & { sortDirty: boolean };
  /** The buffer texture's side, in texels. */
  readonly bufferSize: () => number;
  readonly sortLayer: number;
}

interface Painter {
  readonly arm: InkArm;
  readonly mesh: PIXI.Mesh;
}

/** The GPU side, made on the first frame with an ink arm and freed when none are left. */
interface Gpu {
  readonly size: number;
  read: PIXI.RenderTexture;
  write: PIXI.RenderTexture;
  /** The ink the arms painted this frame. */
  readonly armTexture: PIXI.RenderTexture;
  /** The buffer pass's quad, `size` texels square, drawn with blending off. */
  readonly bufferQuad: PIXI.Mesh;
  /** The image pass: a container in canvas.primary holding a quad over the region. */
  readonly imageContainer: PIXI.Container;
  readonly imageQuad: PIXI.Mesh;
}

/** A 1 by 1 square with `aUv` 0..1; meshes scale and place it. */
function unitQuad(): PIXI.Geometry {
  return new PIXI.Geometry()
    .addAttribute("aVertexPosition", new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2)
    .addAttribute("aUv", new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2)
    .addIndex(new Uint16Array([0, 1, 2, 0, 2, 3]));
}

export function createSmear(host: SmearHost): Smear {
  const painters = new Map<string, Painter>();
  let region: Region | null = null;
  let gpu: Gpu | null = null;
  const empty = new PIXI.Container();

  /** (x, y, size in map pixels, texture size in texels). */
  const uRegion = new Float32Array([0, 0, 1, 1]);
  const bufferUniforms: Record<string, unknown> = {
    uTime: 0,
    uDelta: 1 / 60,
    uBuffer: null,
    uArm: null,
    uRegion,
  };
  const colorA = new Float32Array(3);
  const colorC = new Float32Array(3);
  const imageUniforms: Record<string, unknown> = {
    uBuffer: null,
    uRegion,
    uColorA: colorA,
    uColorC: colorC,
    uAlpha: 1,
  };

  function clear(texture: PIXI.RenderTexture): void {
    host.renderer().render(empty, { renderTexture: texture, clear: true });
  }

  function placeImage(): void {
    if (!gpu || !region) return;
    gpu.imageQuad.position.set(region.x, region.y);
    gpu.imageQuad.scale.set(region.size);
  }

  /** Recompute the region, colours and elevation from the current arms. */
  function refresh(): void {
    const arms = [...painters.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const next = smearRegion(arms.map(([, p]) => p.arm.reach));
    // With no arms left, keep the region: an arm that is rebuilt is removed and added again
    // straight away, and its ink should survive that. The next frame frees the textures.
    if (!next) return;
    if (!sameRegion(region, next)) {
      region = next;
      uRegion[0] = next.x;
      uRegion[1] = next.y;
      uRegion[2] = next.size;
      placeImage();
      if (gpu) for (const texture of [gpu.read, gpu.write, gpu.armTexture]) clear(texture);
    }
    // One set of colours for the whole image pass: the ink arm whose token id sorts first.
    const first = arms[0]?.[1].arm;
    if (first) {
      colorA.set(first.colorA);
      colorC.set(first.colorC);
    }
    if (gpu) {
      gpu.imageContainer.elevation = Math.min(...arms.map(([, p]) => p.arm.elevation));
      host.primary().sortDirty = true;
    }
  }

  function makeGpu(): Gpu {
    const size = host.bufferSize();
    const texture = (): PIXI.RenderTexture =>
      PIXI.RenderTexture.create({ width: size, height: size, resolution: 1 });
    const read = texture();
    const write = texture();
    const armTexture = texture();
    for (const t of [read, write, armTexture]) clear(t);
    uRegion[3] = size;
    bufferUniforms.uArm = armTexture;

    const bufferQuad = new PIXI.Mesh(
      unitQuad(),
      PIXI.Shader.from(QUAD_VERT, INK_BUFFER_FRAG, bufferUniforms),
    );
    bufferQuad.state.blend = false;
    bufferQuad.scale.set(size);

    const imageContainer = new PIXI.Container();
    imageContainer.eventMode = "none";
    imageContainer.sortLayer = host.sortLayer;
    // Under the arms' joint rings when they share an elevation.
    imageContainer.sort = -1;
    const imageQuad = imageContainer.addChild(
      new PIXI.Mesh(unitQuad(), PIXI.Shader.from(QUAD_VERT, INK_IMAGE_FRAG, imageUniforms)),
    );
    host.primary().addChild(imageContainer);
    return { size, read, write, armTexture, bufferQuad, imageContainer, imageQuad };
  }

  function release(): void {
    if (!gpu) return;
    for (const t of [gpu.read, gpu.write, gpu.armTexture]) t.destroy(true);
    gpu.bufferQuad.destroy();
    if (!gpu.imageContainer.destroyed) gpu.imageContainer.destroy({ children: true });
    bufferUniforms.uBuffer = bufferUniforms.uArm = imageUniforms.uBuffer = null;
    gpu = null;
  }

  function update(time: number, delta: number): void {
    if (painters.size === 0) {
      release();
      return;
    }
    if (!region) return;
    if (!gpu) {
      gpu = makeGpu();
      placeImage();
      refresh();
    }
    const renderer = host.renderer();

    // 1. Paint: each arm draws its strip into the arm texture, scaled so the region fills it.
    const s = gpu.size / region.size;
    let cleared = false;
    for (const { arm, mesh } of painters.values()) {
      if (!arm.paints()) continue;
      mesh.scale.set(s);
      mesh.position.set(-region.x * s, -region.y * s);
      renderer.render(mesh, { renderTexture: gpu.armTexture, clear: !cleared });
      cleared = true;
    }
    if (!cleared) clear(gpu.armTexture);

    // 2. Buffer: read last frame's buffer, write the other texture, then swap them.
    bufferUniforms.uTime = time;
    bufferUniforms.uDelta = delta;
    bufferUniforms.uBuffer = gpu.read;
    renderer.render(gpu.bufferQuad, { renderTexture: gpu.write, clear: true });
    [gpu.read, gpu.write] = [gpu.write, gpu.read];

    // 3. Image: canvas.primary draws the quad later this frame, from the newest buffer.
    imageUniforms.uBuffer = gpu.read;
  }

  function add(id: string, arm: InkArm): void {
    painters.get(id)?.mesh.destroy();
    const mesh = new PIXI.Mesh(
      arm.geometry,
      PIXI.Shader.from(ARM_VERT, fragmentSource(SMEAR_SHADER), arm.uniforms),
    );
    painters.set(id, { arm, mesh });
    refresh();
  }

  function remove(id: string): void {
    const painter = painters.get(id);
    if (!painter) return;
    painters.delete(id);
    painter.mesh.destroy();
    refresh();
  }

  function rebuild(): void {
    release();
  }

  function teardown(): void {
    for (const { mesh } of painters.values()) mesh.destroy();
    painters.clear();
    release();
    region = null;
  }

  return { add, remove, update, rebuild, teardown };
}

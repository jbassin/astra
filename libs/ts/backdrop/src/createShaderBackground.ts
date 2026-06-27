import {
  type Application,
  type Container,
  defaultFilterVert,
  Filter,
  GlProgram,
  Graphics,
} from "pixi.js";
import type { BackdropSpec } from "./types";

// Builds a backdrop from a spec: a full-screen rect carrying the spec's shader as a
// Pixi Filter, scaled to the renderer each frame and driven by `uTime`. Generalised
// from harrow's createStarfieldBackground / strider's balatro factory — the one
// Pixi-v8 mounting idiom, parameterised by the spec. Imports pixi at module load, so
// ShaderBackground dynamic-imports THIS module (keeping pixi out of the SSR bundle).
//
// Pixi v8 binds the spec's uniforms under one resource group keyed `${name}Uniforms`;
// the inner keys (uTime + the spec's) match the `uniform` names in the fragment.

export interface ShaderBackground {
  mesh: Container;
  update: (elapsedMs: number) => void;
  destroy: () => void;
}

export function createShaderBackground(app: Application, spec: BackdropSpec): ShaderBackground {
  const group = `${spec.name}Uniforms`;

  const glProgram = GlProgram.from({
    vertex: defaultFilterVert,
    fragment: spec.fragment,
    name: `${spec.name}-filter`,
  });

  const filter = new Filter({
    glProgram,
    resources: {
      [group]: { uTime: { value: 0, type: "f32" }, ...spec.uniforms },
    },
  });

  const rect = new Graphics().rect(0, 0, 1, 1).fill(0x000000);
  rect.label = spec.name;
  rect.filters = [filter];

  const sync = () => {
    const { width, height } = app.renderer.screen;
    rect.scale.set(width, height);
  };
  sync();

  const update = (elapsedMs: number) => {
    sync();
    (filter.resources[group] as { uniforms: { uTime: number } }).uniforms.uTime = elapsedMs / 1000;
  };

  const destroy = () => {
    rect.destroy();
    filter.destroy();
  };

  return { mesh: rect, update, destroy };
}

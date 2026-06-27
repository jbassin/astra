// The data shape of an astra backdrop: a Pixi-v8 fragment shader + its palette/
// control uniforms. Pure data (no pixi import) so apps can statically import a
// spec and pass it to <ShaderBackground> without pulling pixi into the SSR bundle —
// the component dynamic-imports pixi + the factory at mount.

export type UniformSpec =
  | { value: number; type: "f32" }
  | { value: Float32Array; type: "vec3<f32>" };

export interface BackdropSpec {
  /** Stable id — also the Pixi filter name + the uniform-group resource key base. */
  name: string;
  /** Pixi-v8 fragment shader: NO `#version` (Pixi prepends it); `in`/`out` varyings;
   *  the implicit `uTexture`/`uInputSize`/`uTime` uniforms + this spec's extras. */
  fragment: string;
  /** Extra uniforms beyond `uTime` (palette stops, intensity …). Each KEY must match
   *  a `uniform` name declared in `fragment`. */
  uniforms: Record<string, UniformSpec>;
}

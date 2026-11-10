/**
 * Minimal ambient declarations for the Foundry and PIXI 7 globals this module touches, and
 * nothing else (the same policy as `apps/portal/module/src/types/foundry.d.ts`: no
 * `fvtt-types`). No `import`/`export` here on purpose, so every `declare` below is global.
 */

declare namespace PIXI {
  class Container {
    eventMode: string;
    visible: boolean;
    alpha: number;
    readonly destroyed: boolean;
    /** Read by Foundry's PrimaryCanvasGroup when it sorts its children. */
    elevation?: number;
    sortLayer?: number;
    sort?: number;
    addChild<T extends Container>(child: T): T;
    destroy(options?: { children?: boolean }): void;
  }
  class Graphics extends Container {
    clear(): this;
    lineStyle(width: number, color: number, alpha: number): this;
    beginFill(color: number): this;
    endFill(): this;
    drawPolygon(path: number[]): this;
    drawCircle(x: number, y: number, radius: number): this;
  }
  class Buffer {
    /** Re-upload the buffer's array after it was changed in place. */
    update(): void;
  }
  class Geometry {
    /** The buffer wraps `data` itself, not a copy. */
    addAttribute(name: string, data: Float32Array, size: number): this;
    addIndex(data: Uint16Array): this;
    getBuffer(name: string): Buffer;
  }
  class Shader {
    /** `uniforms` is kept by reference and read every frame. */
    static from(vertex: string, fragment: string, uniforms: Record<string, unknown>): Shader;
    readonly uniforms: Record<string, unknown>;
  }
  class Mesh extends Container {
    constructor(geometry: Geometry, shader: Shader);
    readonly geometry: Geometry;
  }
  class Ticker {
    add(fn: () => void): this;
    remove(fn: () => void): this;
  }
}

interface FoundryTokenDocument {
  readonly x: number;
  readonly y: number;
  readonly hidden: boolean;
  readonly elevation: number;
  /** The token drawn on the canvas for this document, or `null` off the viewed scene. */
  readonly object: FoundryToken | null;
  getFlag(scope: string, key: string): unknown;
  setFlag(scope: string, key: string, value: unknown): Promise<unknown>;
  unsetFlag(scope: string, key: string): Promise<unknown>;
}

interface FoundryToken {
  readonly id: string;
  readonly name: string;
  /** True for the clone Foundry draws while a token is being dragged. */
  readonly isPreview: boolean;
  readonly destroyed: boolean;
  /** Width and height in pixels. */
  readonly w: number;
  readonly h: number;
  /** Where the token is drawn right now (top-left), mid-animation included. */
  readonly position: { readonly x: number; readonly y: number };
  readonly document: FoundryTokenDocument;
}

interface FoundryCanvas {
  readonly ready: boolean;
  readonly grid: { readonly size: number };
  readonly primary: PIXI.Container & { sortDirty: boolean };
  readonly tokens: {
    readonly placeables: FoundryToken[];
    readonly controlled: FoundryToken[];
    get(id: string): FoundryToken | undefined;
  };
  readonly app: { readonly view: HTMLCanvasElement; readonly ticker: PIXI.Ticker };
  canvasCoordinatesFromClient(point: { x: number; y: number }): { x: number; y: number };
}

declare const canvas: FoundryCanvas;
declare const game: { readonly user: { readonly isGM: boolean } };
declare const ui: {
  readonly notifications: { info(message: string): void; warn(message: string): void };
};
declare const Hooks: {
  /** `never[]` so a callback may name whichever arguments its hook passes. */
  on(name: string, fn: (...args: never[]) => void): number;
  off(name: string, id: number): void;
};

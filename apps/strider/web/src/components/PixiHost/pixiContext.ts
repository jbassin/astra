import type { Application, Container } from "pixi.js";
import { createContext, useContext } from "react";

export interface PixiCtx {
  app: Application;
  panel: Container;
  world: Container;
}

export const PixiContext = createContext<PixiCtx | null>(null);

export function usePixi(): PixiCtx | null {
  return useContext(PixiContext);
}

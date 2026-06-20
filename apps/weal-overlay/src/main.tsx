import "@astra/gothic/theme.css";
import "@fontsource/ibm-plex-mono";
import { initRum } from "@astra/observe/web";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Overlay } from "./Overlay";
import "./overlay.css";

// Client RUM: the endpoint is injected into index.html by the server (config seam),
// so the browser bundle never reads config. Absent (e.g. vite dev) → RUM is skipped.
const rumEndpoint = (window as unknown as { __RUM_ENDPOINT__?: string }).__RUM_ENDPOINT__;
if (rumEndpoint) initRum({ serviceName: "astra.weal-overlay-rum", endpoint: rumEndpoint });

const root = document.getElementById("root");
if (!root) throw new Error("weal-overlay: missing #root element");

createRoot(root).render(
  <StrictMode>
    <Overlay />
  </StrictMode>,
);

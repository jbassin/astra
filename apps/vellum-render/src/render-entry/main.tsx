import { DocumentView } from "@astra/gothic";
import { parseDocument, type ThemeMode } from "@astra/vellum-lang";
import { createRoot } from "react-dom/client";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@astra/gothic/theme.css";
import "./render.css";

/**
 * Render-only entry. The render service (Playwright) loads this page and calls
 * `window.vellumRender(source, mode)`, then screenshots [data-vellum-export]. It
 * uses the SAME renderer (@astra/gothic's DocumentView) as the editor preview, so
 * the PNG matches what the author sees (R-15). Ported verbatim from faerrin
 * pkg/vellum src/render-entry (imports repointed at @astra/{vellum-lang,gothic}).
 */
declare global {
  interface Window {
    vellumRender: (source: string, mode: string) => Promise<void>;
  }
}

const host = document.getElementById("render-root");
if (!host) throw new Error("vellum render: missing #render-root");
const root = createRoot(host);

function normalizeMode(mode: string): ThemeMode {
  return mode === "diegetic" ? "diegetic" : "mechanical";
}

window.vellumRender = (source, mode) =>
  new Promise<void>((resolve) => {
    const document_ = parseDocument(source, { mode: normalizeMode(mode) });
    root.render(<DocumentView document={document_} />);
    // Wait for layout + webfonts so the screenshot is deterministic (R-17).
    requestAnimationFrame(() => {
      void document.fonts.ready.then(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  });

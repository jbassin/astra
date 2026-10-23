import type { ThemeMode } from "@astra/vellum-lang";

// The two render skins. `ThemeMode` is owned by @astra/vellum-lang (the parser stamps
// a default per document kind); the editor's mode toggle + the render-entry page both
// normalize an untrusted string (a URL param, a stored preference, a render request)
// down to a known mode. Any value other than "diegetic" falls back to "mechanical"
// (faerrin's render-entry `normalizeMode`, lifted as a shared pure helper).
export function normalizeMode(value: string | null | undefined): ThemeMode {
  return value === "diegetic" ? "diegetic" : "mechanical";
}

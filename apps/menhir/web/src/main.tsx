import { createRoot } from "react-dom/client";

// menhir's self-hosted parchment-system fonts (D31-6) — mirrors codex's
// __root.tsx font-import list verbatim (same weights: Cinzel 700 for the rare
// display wordmark, Cormorant SC 600 for headings/question text, EB Garamond
// for body prose, Oswald for the condensed timer/score digits).
import "@fontsource/cinzel/700.css";
import "@fontsource/cormorant-sc/600.css";
import "@fontsource/eb-garamond/400.css";
import "@fontsource/eb-garamond/400-italic.css";
import "@fontsource/eb-garamond/600.css";
import "@fontsource/eb-garamond/700.css";
import "@fontsource/oswald/500.css";
import "@fontsource/oswald/700.css";
import "./styles/tokens.css";
import "./styles/app.css";

import { App } from "./App";

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);

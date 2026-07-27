import { createRoot } from "react-dom/client";

// Placeholder client — S1 ships the engine + server only. The real player/host
// views (§3 of the spec), tokens.css (D31-6), QR (D31-12), and the SSE client
// land in S2. This exists so `vite build` produces a real dist/ for the server
// to serve, proving the static-serving + SPA-fallback wiring end to end.
function App() {
  return (
    <main>
      <h1>menhir</h1>
      <p>Engine + server (S1) are live. The player/host client SPA lands in S2.</p>
    </main>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);

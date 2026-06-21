/**
 * The SPA shell (root route component): the gothic-framed page chrome + the
 * provider stack (toasts, modals) that every route shares, plus the client-RUM
 * mount. Routes render into `<Outlet/>`. Ported from faerrin lark's `App` header,
 * re-skinned in gothic and split from the console body so TanStack Router owns
 * the shell.
 */
import { Title } from "@astra/gothic";
import { Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { DialogProvider } from "./ui/Dialog";
import { ToastProvider } from "./ui/Toast";

export function RootLayout() {
  // Client RUM: browser OTel → SigNoz. The web SDK loads only in the browser
  // (dynamic import behind a mount effect), and the endpoint comes from config
  // via a public server route (rumConfig.ts).
  useEffect(() => {
    void import("./observe/rum").then((m) => void m.startRum());
  }, []);

  return (
    <ToastProvider>
      <DialogProvider>
        <main className="app">
          <header className="app__header">
            <Title level={1}>orator</Title>
            <p className="app__tagline">Discord voice — music library &amp; playback console</p>
          </header>
          <Outlet />
        </main>
      </DialogProvider>
    </ToastProvider>
  );
}

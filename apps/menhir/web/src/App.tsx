/**
 * The root of the path-routed SPA (spec §3) — no router lib, just
 * `location.pathname` (`usePathname`, router.ts). `/host` and `/host/:code`
 * go to the host container; everything else (`/`, and any stray path — the
 * server's SPA fallback already routes here) is the player view.
 */
import { HostApp } from "./host/HostApp";
import { PlayerApp } from "./player/PlayerApp";
import { usePathname } from "./router";

export function App() {
  const pathname = usePathname();
  if (pathname.startsWith("/host")) return <HostApp pathname={pathname} />;
  return <PlayerApp />;
}

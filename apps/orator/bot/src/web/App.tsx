/**
 * The operator console (the index route body): resolves the signed-in actor from
 * `/api/v1/me`, then either prompts for Discord sign-in or mounts the playback +
 * library + ingest + key-management surface. Ported from faerrin lark's `App`,
 * with the page chrome lifted into RootLayout (TanStack Router shell).
 */
import { useEffect, useState } from "react";

import { apiGet } from "./api";
import { Import } from "./Import";
import { Keys } from "./Keys";
import { Library } from "./Library";
import { Playback } from "./Playback";
import { PlaybackProvider } from "./playbackState";

interface Me {
  uid: string;
}

type AuthState = { status: "loading" } | { status: "anon" } | { status: "authed"; me: Me };

export function Console() {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    apiGet<Me>("/api/v1/me")
      .then((me) => setAuth({ status: "authed", me }))
      .catch(() => setAuth({ status: "anon" }));
  }, []);

  if (auth.status === "loading") return <p>Loading…</p>;

  if (auth.status === "anon") {
    return (
      <section className="card card--auth">
        <p>Sign in with Discord to manage the library and control playback.</p>
        <a className="btn" href="/auth/login">
          Sign in with Discord
        </a>
      </section>
    );
  }

  return (
    <>
      <div className="app__userbar">
        <span className="muted">
          Signed in as <code>{auth.me.uid}</code>
        </span>
        <form method="POST" action="/auth/logout">
          <button className="btn btn--ghost" type="submit">
            Sign out
          </button>
        </form>
      </div>
      <PlaybackProvider>
        <Playback />
        <Import onImported={() => setRefreshKey((k) => k + 1)} />
        <Keys />
        <Library key={refreshKey} />
      </PlaybackProvider>
    </>
  );
}

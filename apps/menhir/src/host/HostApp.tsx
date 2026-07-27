/**
 * The host container (`/host` + `/host/:code` — spec §3/D31-9): picks the
 * quiz picker or the live game view off the pathname, owns the SSE
 * connection + host-action dispatch once a code is present. `HostView` stays
 * pure; this is the only place that touches `api.ts`/`storage.ts`/network.
 */
import { useMemo, useState } from "react";

import { hostAction } from "../api";
import { must } from "../assert";
import { HostSnapshotSchema } from "../schema";
import { loadStoredHost } from "../storage";
import { useEventStream } from "../useEventStream";
import { HostPicker } from "./HostPicker";
import { HostView } from "./HostView";

function parseHostCode(pathname: string): string | null {
  const match = /^\/host\/([^/]+)\/?$/.exec(pathname);
  return match ? must(match[1], "the /host/:code regex has exactly 1 capture group") : null;
}

function ConnectingScreen() {
  return <div className="connecting-screen">Connecting…</div>;
}

function HostGameConnection({ code }: { code: string }) {
  const url = useMemo(() => `/api/events/${encodeURIComponent(code)}?role=host`, [code]);
  const { snapshot, receivedAt } = useEventStream(url, HostSnapshotSchema);
  const [actionError, setActionError] = useState<string | null>(null);
  const storedHost = useMemo(() => loadStoredHost(), []);
  const hasHostToken = storedHost !== null && storedHost.code === code;

  function sendAction(action: "start" | "next" | "end") {
    if (!snapshot || snapshot.phase === "gone") return;
    const hostToken = hasHostToken
      ? must(storedHost, "hasHostToken implies storedHost").hostToken
      : "";
    void hostAction(code, {
      hostToken,
      action,
      fromPhase: snapshot.phase,
      fromIndex: snapshot.questionIndex,
    }).then((res) => {
      setActionError(res.ok ? null : res.error);
    });
  }

  if (!snapshot) return <ConnectingScreen />;
  return (
    <HostView
      snapshot={snapshot}
      receivedAt={receivedAt}
      hasHostToken={hasHostToken}
      actionError={actionError}
      onStart={() => sendAction("start")}
      onNext={() => sendAction("next")}
      onEnd={() => sendAction("end")}
    />
  );
}

export function HostApp({ pathname }: { pathname: string }) {
  const code = parseHostCode(pathname);
  if (code) return <HostGameConnection key={code} code={code} />;
  return <HostPicker />;
}

import { type ReactNode, useEffect, useState } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

// Defers rendering of `children` until after mount. Used to keep DOM-dependent
// browser APIs out of the SSR pass — replaces Next's `dynamic(..., { ssr: false })`.
// Copied verbatim from the strider/mouthpiece template. (The /editor route itself is
// `ssr: false`, so CodeMirror needs no ClientOnly gate; this stays for any other
// browser-only island.)
export default function ClientOnly({ children, fallback = null }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <>{mounted ? children : fallback}</>;
}

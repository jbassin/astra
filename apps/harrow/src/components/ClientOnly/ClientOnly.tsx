import { type ReactNode, useEffect, useState } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

// Defers rendering of `children` until after mount. Used to keep DOM-dependent
// browser APIs + client-only randomness (the card draw / flip / reveal, the
// matchMedia spread layout) out of the SSR pass — replaces Next's
// `dynamic(..., { ssr: false })`. Copied verbatim from the strider template.
export default function ClientOnly({ children, fallback = null }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <>{mounted ? children : fallback}</>;
}

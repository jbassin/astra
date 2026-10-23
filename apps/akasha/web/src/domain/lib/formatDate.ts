// Display date formatting (ports faerrin Date.tsx formatDate: en-US, short month,
// 2-digit day). Forced to UTC so the SSR string and the client-hydration string are
// byte-identical regardless of server/browser timezone (no hydration mismatch). The
// exact displayed day need not match faerrin (N4 — committer date, parity not required).
const LOCALE = "en-US";

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  });
}

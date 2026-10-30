// Display date formatting: "5 June 2026". Forced to UTC so the SSR string and the
// client-hydration string are byte-identical regardless of server/browser timezone (no
// hydration mismatch). The dates are committer dates, so the day is approximate anyway.
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCFullYear()}`;
}

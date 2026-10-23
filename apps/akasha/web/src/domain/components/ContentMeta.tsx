// Ports faerrin ContentMeta.astro: a dateline (committer date — N4) + reading time.
// Rendered only when the page has a body (the caller gates on bodyHtml), matching
// faerrin's `{text && …}`.
import { formatDate } from "@/domain/lib/formatDate";

export function ContentMeta({ date, minutes }: { date?: string; minutes: number }) {
  return (
    <p className="content-meta">
      {date && <time dateTime={date}>{formatDate(date)}</time>}
      <span>{`${minutes} min read`}</span>
    </p>
  );
}

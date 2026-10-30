// The facts row under a page title: the tags as chips, then "Updated 5 June 2026" when the
// page has a date (the committer date, N4). Renders nothing when there is neither.
import { TagList } from "@/domain/components/TagList";
import { formatDate } from "@/domain/lib/formatDate";
import type { LinkView } from "@/domain/lib/runtimeSite";

export function ContentMeta({ tags, date }: { tags: LinkView[]; date?: string }) {
  if (tags.length === 0 && !date) return null;
  return (
    <div className="ak-facts">
      <TagList tags={tags} />
      {date && <time dateTime={date}>{`Updated ${formatDate(date)}`}</time>}
    </div>
  );
}

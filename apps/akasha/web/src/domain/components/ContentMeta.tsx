// The facts row under a page title: the tags as chips, "Updated 5 June 2026" when the page has
// a date (the committer date, N4), then "Known from: The First Spark and Interred in Iomenei"
// when the page draws on any campaign. Renders nothing when there is none of these.
import { Fragment } from "react";

import { TagList } from "@/domain/components/TagList";
import { formatDate } from "@/domain/lib/formatDate";
import type { CampaignView, LinkView } from "@/domain/lib/runtimeSite";

/** The separator before item `i` of `n`: names can hold commas ("Through a Song, Darkly"),
 *  so the last one is joined with "and". */
const separator = (i: number, n: number): string => {
  if (i === 0) return "";
  return i === n - 1 ? " and " : ", ";
};

function KnownFrom({ campaigns }: { campaigns: CampaignView[] }) {
  return (
    <span className="ak-known-from">
      {"Known from: "}
      {campaigns.map((c, i) => (
        <Fragment key={c.label}>
          {separator(i, campaigns.length)}
          {c.href ? (
            <a href={c.href} data-section="sessions">
              {c.label}
            </a>
          ) : (
            <span>{c.label}</span>
          )}
        </Fragment>
      ))}
    </span>
  );
}

export function ContentMeta({
  tags,
  date,
  knownFrom,
}: {
  tags: LinkView[];
  date?: string;
  knownFrom: CampaignView[];
}) {
  if (tags.length === 0 && !date && knownFrom.length === 0) return null;
  return (
    <div className="ak-facts">
      <TagList tags={tags} />
      {date && <time dateTime={date}>{`Updated ${formatDate(date)}`}</time>}
      {knownFrom.length > 0 && <KnownFrom campaigns={knownFrom} />}
    </div>
  );
}

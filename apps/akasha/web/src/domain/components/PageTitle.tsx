// The wordmark in the header and the phone menu, linking home.
import { SITE } from "@/generated/site";

export function PageTitle() {
  return (
    <a className="ak-wordmark" href="/">
      {SITE.title}
    </a>
  );
}

/**
 * What to do when a page fails to render. akasha redeploys whenever astra-data changes, so a
 * tab opened before a deploy is common. Its next client navigation asks the new server for
 * a server function or a route chunk of the old build. An unknown server-function id comes
 * back as a 500 (`{"status":500,"unhandled":true,"message":"HTTPError"}`) that the client
 * resolves to `undefined` (`pageData` turns that into an error), and a missing chunk fails
 * its dynamic import. A full page load of the target fetches the new build.
 *
 * The guard against loops is the URL the document was loaded with: a failure on that URL
 * happened on a fresh load (or a Retry of one), so reloading again would not help and the
 * error page shows instead. Each reload therefore follows a reader's click, never another
 * reload.
 */

type ErrorAction = "show-error" | "reload" | "load";

const pathAndQuery = (u: URL) => u.pathname + u.search;

/**
 * `target` is the page that failed, `current` the browser's URL now, and `loaded` the URL
 * the document was loaded with. `reload` reloads the current URL (it already is the
 * target); `load` assigns the target; `show-error` renders the error page.
 */
export function errorAction(target: URL, current: URL, loaded: URL): ErrorAction {
  if (target.origin !== loaded.origin) return "show-error";
  if (pathAndQuery(target) === pathAndQuery(loaded)) return "show-error";
  // `location.assign` to the current URL plus a hash would only scroll, so reload instead.
  return pathAndQuery(target) === pathAndQuery(current) ? "reload" : "load";
}

/**
 * Passes page data through; throws when a server-function call returned nothing. Every
 * page-data function returns a value or `null`, never `undefined`. An unknown id (a tab from
 * an older build) gets a 500 whose JSON body Start's client fetcher does not treat as an
 * error: the call resolves to `undefined`, which a loader would otherwise turn into a 404.
 */
export function pageData<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("page data request returned nothing");
  return value;
}

/**
 * The route table: typed routes with `:param` templates, lazily validated JSON bodies,
 * and the JSON helpers and error type the handlers use.
 */

/** HTTP methods a route can answer; `*` answers every method. */
export type Method = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE" | "*";

/**
 * A validator in the Standard Schema shape (`~standard.validate`), which zod 4 schemas
 * implement. The kit takes the interface rather than zod itself, so an app's zod version
 * never has to match the kit's.
 */
export interface Schema<T> {
  readonly "~standard": {
    validate(value: unknown): SchemaResult<T> | Promise<SchemaResult<T>>;
  };
}

export type SchemaResult<T> =
  | { readonly value: T; readonly issues?: undefined }
  | { readonly issues: readonly { readonly message: string }[] };

/** What a route handler receives. */
export interface RouteContext<Auth, Body> {
  readonly req: Request;
  readonly url: URL;
  /** The decoded `:param` values of the route template. */
  readonly params: Record<string, string>;
  /** The group's `authenticate` result (`undefined` outside an authenticated group). */
  readonly auth: Auth;
  /**
   * Read the JSON body and validate it against the route's `body` schema. Called by the
   * handler, so the handler decides when the body is read (after its own lookups, say).
   * Throws an {@link HttpError} 400: the service's `invalidJson` code for a body that is not
   * JSON, or the schema's first issue message for one that fails validation.
   */
  body(): Promise<Body>;
}

/** One route: a method, a path template like `/api/v1/tracks/:id`, and a handler. */
export interface Route<Auth = undefined, Body = unknown> {
  readonly method: Method;
  readonly path: string;
  readonly body?: Schema<Body>;
  handler(ctx: RouteContext<Auth, Body>): Response | Promise<Response>;
}

/** Declare a route, inferring its body type from its schema. */
export function route<Body = unknown, Auth = undefined>(def: Route<Auth, Body>): Route<Auth, Body> {
  return def;
}

/** An error a handler throws to answer `status` with the service's JSON error body. */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** A JSON response. */
export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function segments(path: string): string[] {
  return path.split("/").filter((s) => s.length > 0);
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    // A malformed escape (`%E0`) is kept as written rather than failing the request.
    return segment;
  }
}

/**
 * Match `pathname` against a template: the decoded `:param` values, or null. Empty segments
 * are ignored on both sides, so a trailing slash matches.
 */
export function matchPath(template: string, pathname: string): Record<string, string> | null {
  const want = segments(template);
  const got = segments(pathname);
  if (want.length !== got.length) return null;
  const params: Record<string, string> = {};
  for (const [i, part] of want.entries()) {
    const seg = got[i] as string;
    if (part.startsWith(":")) params[part.slice(1)] = decode(seg);
    else if (part !== seg) return null;
  }
  return params;
}

/** The first route whose method and template match, with its params. */
export function findRoute<R extends Route<never>>(
  routes: readonly R[],
  method: string,
  pathname: string,
): { route: R; params: Record<string, string> } | null {
  for (const r of routes) {
    if (r.method !== "*" && r.method !== method) continue;
    const params = matchPath(r.path, pathname);
    if (params) return { route: r, params };
  }
  return null;
}

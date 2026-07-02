// Bridges the `send` package (Range/206, conditional-GET, etag/last-modified — the
// load-bearing static-file semantics the audio mounts depend on, S6) into a Web Fetch
// `Response`. `send` is Node-http shaped: it reads `req.headers`/`req.method` and pipes
// bytes into a `ServerResponse`-like sink via `res.setHeader`/`res.write`/`res.end`. No
// published adapter bridges that to Fetch, so this is a small, self-contained one:
// a `PassThrough` stands in for `res` (real Writable/Readable semantics for `.pipe()`),
// captures whatever `send` sets on it (status + headers) via a hook that fires on the
// first `write()`/`end()` call — which is always after every `res.setHeader()` call
// send makes, since all header logic runs synchronously before any bytes are written —
// then mirrors the bytes into a Web `ReadableStream` with basic backpressure (pause the
// Node stream when the Web stream's queue is full; resume on `pull()`).

import { PassThrough, type Readable } from "node:stream";

import send from "send";

type NodeReqShape = { headers: Record<string, string>; method: string };

function toNodeReq(req: Request): NodeReqShape {
  const headers: Record<string, string> = {};
  for (const [key, value] of req.headers) headers[key] = value;
  return { headers, method: req.method };
}

// Fetch `Response` forbids a body on these statuses (spec: "null body status").
const NULL_BODY_STATUS = new Set([204, 205, 304]);

/**
 * Fakes just enough of a Node `http.ServerResponse` for `send` to drive: header
 * get/set/remove, `statusCode`, and real Writable+Readable stream behaviour (so
 * `sendStream.pipe(res)` and its backpressure/'drain' handling work unmodified).
 */
class CapturingRes extends PassThrough {
  statusCode = 200;
  headersSent = false;
  #headers = new Map<string, string | number>();
  #onHead: (statusCode: number, headers: Map<string, string | number>) => void;

  constructor(onHead: (statusCode: number, headers: Map<string, string | number>) => void) {
    super();
    this.#onHead = onHead;
  }

  setHeader(name: string, value: string | number): this {
    this.#headers.set(name.toLowerCase(), value);
    return this;
  }

  getHeader(name: string): string | number | undefined {
    return this.#headers.get(name.toLowerCase());
  }

  removeHeader(name: string): void {
    this.#headers.delete(name.toLowerCase());
  }

  // Used by `send`'s error path (`clearHeaders`, index.js:778) to wipe headers
  // before writing an error doc — e.g. a 200's Content-Length must not survive
  // onto a redirect/error response reusing the same `res`.
  getHeaderNames(): string[] {
    return [...this.#headers.keys()];
  }

  // `send`'s cleanup goes through the `on-finished` package, which special-cases
  // an `OutgoingMessage`-shaped `msg` via `typeof msg.finished === "boolean"` —
  // without this, `on-finished` can't classify a plain PassThrough at all and
  // falls back to treating it as ALREADY finished, destroying the file stream
  // before a single byte is piped. `writableEnded` is the accurate underlying
  // Writable-state flag.
  get finished(): boolean {
    return this.writableEnded;
  }

  #head(): void {
    if (this.headersSent) return;
    this.headersSent = true;
    this.#onHead(this.statusCode, this.#headers);
  }

  // `write`/`end` are typed loosely (vs. PassThrough's overloaded signatures) so a
  // single override can forward whichever overload `send` calls at runtime — it
  // only ever uses the (chunk) and (chunk, callback) shapes, but Writable's own
  // overloads don't collapse into one spreadable signature.
  override write(...args: any[]): boolean {
    this.#head();
    return super.write(...(args as [string]));
  }

  override end(...args: any[]): this {
    this.#head();
    return super.end(...(args as []));
  }
}

/**
 * Serve `filePath` for `req` via `send`. Handles Range (206 + `Content-Range`),
 * conditional-GET (304), HEAD (no body), and `send`'s own 403/404/416/500 error
 * pages — the caller only needs to already know the file exists (or wants `send`'s
 * own not-found handling, which produces an HTML error page rather than a plain 404).
 */
export function serveFile(req: Request, filePath: string): Promise<Response> {
  const nodeReq = toNodeReq(req);
  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    const res = new CapturingRes((statusCode, headers) => {
      const webHeaders = new Headers();
      for (const [key, value] of headers) webHeaders.set(key, String(value));
      const noBody = nodeReq.method === "HEAD" || NULL_BODY_STATUS.has(statusCode);
      const body = noBody
        ? null
        : new ReadableStream<Uint8Array>({
            start(controller) {
              res.on("data", (chunk: Uint8Array) => {
                controller.enqueue(chunk);
                if ((controller.desiredSize ?? 0) <= 0) res.pause();
              });
              res.on("end", () => controller.close());
              res.on("error", (err: unknown) => controller.error(err));
            },
            pull() {
              res.resume();
            },
            cancel() {
              res.destroy();
            },
          });
      settled = true;
      resolve(new Response(body, { status: statusCode, headers: webHeaders }));
    });
    res.on("error", (err) => {
      if (!settled) reject(err);
    });
    // No 'error' listener on the SendStream itself: `send`'s `.error()` checks
    // `hasListeners(this, 'error')` and, if anyone is listening, EMITS instead of
    // writing its normal HTTP error response (status/headers/body) to `res` — which
    // is exactly the 404/403/416/500 handling we want to reuse for free. Attaching
    // a listener here would silently divert every error path away from `res` and
    // into an emitted event nothing here is designed to translate back to a
    // Response, leaving the promise (and the client) hanging.
    const stream = send(nodeReq as unknown as Readable, filePath);
    stream.pipe(res);
  });
}

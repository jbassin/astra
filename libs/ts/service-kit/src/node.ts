/**
 * `callNode()`: answer a kit request with a Node-style `(req, res)` handler, for libraries
 * that only speak `node:http` (an Express sub-app, an SDK's Node transport).
 */
import type { IncomingMessage, ServerResponse } from "node:http";

import { fetchNodeHandler } from "srvx/node";

/** A handler that writes its answer to a Node `ServerResponse`. */
export type NodeHandler = (req: IncomingMessage, res: ServerResponse) => unknown;

/**
 * Run `handler` on the Node request and response under `req` and resolve once it has
 * answered. On a real server the handler writes straight to the socket; under
 * `createHandler` (tests) srvx gives it in-memory stand-ins and collects the answer. A
 * handler that throws or rejects before it has written anything rejects here, so the kit
 * answers 500 and logs the error; one that fails mid-answer has its socket destroyed.
 */
export function callNode(req: Request, handler: NodeHandler): Promise<Response> {
  const { promise: failed, reject } = Promise.withResolvers<never>();
  // Two parameters on purpose: srvx calls a three-parameter function as Express-style
  // middleware with a `next`, and an Express app given `next` hands unmatched paths to
  // it instead of answering its own 404.
  const run = (nodeReq: IncomingMessage, nodeRes: ServerResponse): void => {
    Promise.resolve()
      .then(() => handler(nodeReq, nodeRes))
      .catch((err: unknown) => {
        if (nodeRes.headersSent) nodeRes.destroy();
        reject(err);
      });
  };
  return Promise.race([fetchNodeHandler(run, req), failed]);
}

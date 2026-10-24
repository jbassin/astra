/**
 * Building blocks for the API's zod body schemas. A schema states the body type a handler
 * reads; its error messages are the API's error codes. A field whose missing value the
 * handler already rejects (`name_required`, `ids_required`, …) answers that same code for
 * a value of the wrong type; any other wrong type answers `invalid_body`. The handlers keep
 * their own value checks (blank names, colours, enum membership), so a well-typed body
 * gets exactly the answer it always got.
 */
import { z } from "zod";

/** The code of a body whose shape or field types are wrong. */
export const INVALID_BODY = "invalid_body";

/** A JSON object body; a non-object answers `code`. Unknown keys are dropped. */
export function jsonBody<Shape extends z.ZodRawShape>(shape: Shape, code = INVALID_BODY) {
  return z.object(shape, { error: code });
}

/** An optional string field. */
export function text(code = INVALID_BODY) {
  return z.string({ error: code }).optional();
}

/** An integer (an id or a count). */
export function int(code = INVALID_BODY) {
  return z.number({ error: code }).int({ error: code });
}

/** A list of integer ids. */
export function ids(code = INVALID_BODY) {
  return z.array(int(code), { error: code });
}

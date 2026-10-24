/**
 * The field builders the generated schema (`config.gen.ts`) uses for the shapes plain Zod
 * cannot name: a lazy secret and the two kinds of path the loader resolves. They mirror
 * the py `Secret`, `DataPath` and `ContentPath` types in `libs/py/config` `models.py`.
 */
import { z } from "zod";

import { SecretRef } from "./secrets";

/** A secret (py `Secret | None`): a lazy `SecretRef`, or undefined when the KDL sets no ref. */
export const secret = () => z.instanceof(SecretRef).nullish();

/** The schemas `dataPath()` built: the loader resolves these against `data.root`. */
export const DATA_PATH_SCHEMAS = new WeakSet<z.ZodType>();

/** The schemas `contentPath()` built: the loader resolves these against `data.contentRoot`. */
export const CONTENT_PATH_SCHEMAS = new WeakSet<z.ZodType>();

/** A data path (py `DataPath`): a relative value is resolved against `data.root` when the
 * config loads. An absolute value (a container-only path) and an empty one pass through. */
export function dataPath(): z.ZodString {
  const schema = z.string();
  DATA_PATH_SCHEMAS.add(schema);
  return schema;
}

/** A published dataset (py `ContentPath`): like a data path, but a relative value is
 * resolved against `data.contentRoot` (the astra-data clone). */
export function contentPath(): z.ZodString {
  const schema = z.string();
  CONTENT_PATH_SCHEMAS.add(schema);
  return schema;
}

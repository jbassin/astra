/**
 * KDL at the edge: one typed decoder for every KDL file astra reads (0037 LIB-12), the
 * TS twin of `libs/py/config` `astra_config.kdl`.
 *
 * `@bgotink/kdl` parses; `loadKdl` turns its nodes into a plain `KNode` tree once, and
 * `decodeKdl(schema, node)` maps that tree onto a Zod object schema, then validates it.
 * Walkers declare a schema instead of walking nodes by hand. Each field reads one part
 * of the node, chosen by wrapping its schema in a marker:
 *
 * - `kdl.arg(s, i)`: the node's i-th positional argument (`player "josh"` → `"josh"`).
 * - `kdl.prop(s, "name")`: a `name=value` property (default: the field name in kebab-case).
 * - `kdl.child(s, "name")` (the default for an unmarked field): the one child node of that
 *   name. An object-typed field decodes the child as that object; an array field takes
 *   all of the child's arguments; any other field takes its single argument, or a
 *   `SecretRef` when the child carries `ref="sops:KEY"`.
 * - `kdl.children(s, "name")`: every child node of that name, as an array (object items
 *   decode as that object, scalar items take each child's first argument).
 *
 * A marker must wrap the field's outermost schema (`kdl.arg(z.string().min(1))`, not
 * `kdl.arg(z.string()).min(1)`), because each Zod method returns a new schema.
 *
 * A required field the KDL omits throws `KdlDecodeError` naming the node path
 * (`being.kdl: player "josh" > name`); it never becomes `"undefined"`. A `.strict()`
 * object also rejects unknown child nodes, properties and arguments, and a `child` field
 * rejects a repeated node. The decoder reads schemas structurally (`_zod.def`), so it
 * works with every zod 4 copy in the workspace. `kdlQuote` is the one escaper for writers
 * that insert KDL text by hand.
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { type Node, parse } from "@bgotink/kdl";

import { SecretRef } from "./secrets";

export type KdlValue = string | number | bigint | boolean | null;

export class KdlDecodeError extends Error {
  override name = "KdlDecodeError";
}

/** One KDL node, typed. A file's root node has no name; its children are the top-level nodes. */
export interface KNode {
  readonly name: string;
  readonly args: readonly KdlValue[];
  readonly props: Readonly<Record<string, KdlValue>>;
  readonly children: readonly KNode[];
  /** `being.kdl: player "josh" > name` (or just `being.kdl` for the root). */
  readonly path: string;
  /** The node names from the root (`["orator", "session-secret"]`); a `SecretRef` records
   * them dotted as its `configKey`. */
  readonly keys: readonly string[];
}

function label(name: string, args: readonly KdlValue[]): string {
  return typeof args[0] === "string" ? `${name} "${args[0]}"` : name;
}

function toKNode(raw: Node, parent: KNode, source: string): KNode {
  const name = raw.name.name;
  const args = raw.getArgumentEntries().map((e) => e.getValue() as KdlValue);
  const props: Record<string, KdlValue> = {};
  for (const [key, entry] of raw.getPropertyEntryMap()) props[key] = entry.getValue();
  const here = label(name, args);
  const children: KNode[] = [];
  const node: KNode = {
    name,
    args,
    props,
    children,
    path: parent.keys.length > 0 ? `${parent.path} > ${here}` : `${source}: ${here}`,
    keys: [...parent.keys, name],
  };
  for (const child of raw.children?.nodes ?? []) children.push(toKNode(child, node, source));
  return node;
}

/** Parse KDL text into its root `KNode`. */
export function parseKdl(text: string, source = "<kdl>"): KNode {
  const children: KNode[] = [];
  const root: KNode = { name: "", args: [], props: {}, children, path: source, keys: [] };
  for (const node of parse(text).nodes) children.push(toKNode(node, root, source));
  return root;
}

/** Parse a KDL file into its root `KNode` (errors name the file). */
export function loadKdl(path: string): KNode {
  return parseKdl(readFileSync(path, "utf8"), basename(path));
}

/** A JS field name (camelCase or snake_case) → its KDL kebab-case node name. */
export function kebab(name: string): string {
  return name.replaceAll("_", "-").replaceAll(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

export { kdlQuote } from "./kdlQuote";

// ── schemas, read structurally ───────────────────────────────────────────────

interface Issue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

/** The slice of a zod 4 schema the decoder reads; any zod 4 copy satisfies it. */
export interface KdlSchema {
  readonly _zod: { readonly def: { readonly type: string }; readonly output: unknown };
  safeParse(value: unknown): {
    success: boolean;
    data?: unknown;
    error?: { readonly issues: readonly Issue[] };
  };
}

interface Def {
  readonly type: string;
  readonly innerType?: KdlSchema;
  readonly in?: KdlSchema;
  readonly shape?: Record<string, KdlSchema>;
  readonly catchall?: KdlSchema;
  readonly element?: KdlSchema;
}

const def = (schema: KdlSchema): Def => schema._zod.def;

/** Every schema from the outside in, through optional/default/nullable/pipe wrappers. */
function layers(schema: KdlSchema): KdlSchema[] {
  const out = [schema];
  for (let s = schema; ; ) {
    const d = def(s);
    const next = d.innerType ?? (d.type === "pipe" ? d.in : undefined);
    if (next === undefined) return out;
    out.push(next);
    s = next;
  }
}

const base = (schema: KdlSchema): KdlSchema => layers(schema).at(-1) ?? schema;
const isObject = (schema: KdlSchema): boolean => def(base(schema)).type === "object";
const isStrict = (schema: KdlSchema): boolean =>
  def(base(schema)).catchall !== undefined &&
  def(def(base(schema)).catchall as KdlSchema).type === "never";

/** The item schema of an array field, or undefined when the field is not an array. */
function arrayItem(schema: KdlSchema): KdlSchema | undefined {
  const d = def(base(schema));
  return d.type === "array" ? d.element : undefined;
}

// ── field markers ────────────────────────────────────────────────────────────

type Spec =
  | { kind: "arg"; index: number }
  | { kind: "prop"; name: string | undefined }
  | { kind: "child"; name: string | undefined }
  | { kind: "children"; name: string };

const SPECS = new WeakMap<object, Spec>();

function mark<T extends object>(schema: T, spec: Spec): T {
  SPECS.set(schema, spec);
  return schema;
}

export const kdl = {
  /** The field is the node's `index`-th positional argument. */
  arg: <T extends object>(schema: T, index = 0): T => mark(schema, { kind: "arg", index }),
  /** The field is the node's `name=value` property (default: the kebab field name). */
  prop: <T extends object>(schema: T, name?: string): T => mark(schema, { kind: "prop", name }),
  /** The field is the one child node `name` (default: the kebab field name). */
  child: <T extends object>(schema: T, name?: string): T => mark(schema, { kind: "child", name }),
  /** The field is every child node `name`, as an array. */
  children: <T extends object>(schema: T, name: string): T =>
    mark(schema, { kind: "children", name }),
};

function specOf(key: string, schema: KdlSchema): Spec {
  const spec = layers(schema)
    .map((s) => SPECS.get(s))
    .find((s) => s !== undefined) ?? { kind: "child", name: undefined };
  if ((spec.kind === "prop" || spec.kind === "child") && spec.name === undefined) {
    return { ...spec, name: kebab(key) };
  }
  return spec;
}

function where(node: KNode, spec: Spec): string {
  if (spec.kind === "arg") return `${node.path}: argument ${spec.index}`;
  if (spec.kind === "prop") return `${node.path}: property ${spec.name}=`;
  return node.keys.length > 0 ? `${node.path} > ${spec.name}` : `${node.path}: ${spec.name}`;
}

// ── decoding ─────────────────────────────────────────────────────────────────

const MISSING = Symbol("missing");

/** Where each decoded object's fields sit in the KDL, so a Zod issue names the node. */
type Located = Map<string, string>;

class Decoder {
  readonly located = new WeakMap<object, Located>();

  readonly secretsFile: string | undefined;

  constructor(secretsFile: string | undefined) {
    this.secretsFile = secretsFile;
  }

  leaf(node: KNode, schema: KdlSchema): unknown {
    if ("ref" in node.props) {
      return new SecretRef(String(node.props.ref), this.secretsFile, node.keys.join("."));
    }
    if (arrayItem(schema) !== undefined) return [...node.args];
    if (node.args.length === 1) return node.args[0];
    return node.args.length === 0 ? null : [...node.args];
  }

  field(node: KNode, spec: Spec, schema: KdlSchema): unknown {
    switch (spec.kind) {
      case "arg":
        return spec.index < node.args.length ? node.args[spec.index] : MISSING;
      case "prop":
        return spec.name !== undefined && spec.name in node.props ? node.props[spec.name] : MISSING;
      case "child": {
        const found = node.children.filter((c) => c.name === spec.name);
        const [first, second] = found;
        if (first === undefined) return MISSING;
        if (second !== undefined)
          throw new KdlDecodeError(`${second.path}: repeated node; expected one`);
        return isObject(schema) ? this.object(schema, first) : this.leaf(first, schema);
      }
      case "children": {
        const item = arrayItem(schema);
        return node.children
          .filter((c) => c.name === spec.name)
          .map((child) => {
            if (item !== undefined && isObject(item)) return this.object(item, child);
            if (child.args.length === 0)
              throw new KdlDecodeError(`${child.path}: missing its value`);
            return child.args[0];
          });
      }
    }
  }

  object(schema: KdlSchema, node: KNode): Record<string, unknown> {
    const shape = def(base(schema)).shape ?? {};
    const out: Record<string, unknown> = {};
    const located: Located = new Map();
    const specs: Spec[] = [];
    for (const [key, field] of Object.entries(shape)) {
      const spec = specOf(key, field);
      specs.push(spec);
      located.set(key, where(node, spec));
      const value = this.field(node, spec, field);
      if (value !== MISSING) out[key] = value;
      else if (!field.safeParse(undefined).success) {
        throw new KdlDecodeError(`${where(node, spec)}: missing (required)`);
      }
    }
    if (isStrict(schema)) rejectUnknown(node, specs);
    this.located.set(out, located);
    return out;
  }

  /** Name the KDL node of a Zod issue: follow its path to the deepest decoded object. */
  explain(raw: unknown, issue: Issue): string {
    let at = "";
    let value: unknown = raw;
    let rest: PropertyKey[] = [...issue.path];
    const path = [...issue.path];
    for (let i = 0; i < path.length && value !== null && typeof value === "object"; i++) {
      const key = String(path[i]);
      const found = this.located.get(value)?.get(key);
      if (found !== undefined) {
        at = found;
        rest = path.slice(i + 1);
      }
      value = (value as Record<string, unknown>)[key];
    }
    const suffix = rest.length > 0 ? ` [${rest.map(String).join(".")}]` : "";
    return `${at || "<root>"}${suffix}: ${issue.message}`;
  }
}

function rejectUnknown(node: KNode, specs: readonly Spec[]): void {
  const children = new Set<string | undefined>();
  const props = new Set<string | undefined>();
  let arity = 0;
  for (const spec of specs) {
    if (spec.kind === "child" || spec.kind === "children") children.add(spec.name);
    else if (spec.kind === "prop") props.add(spec.name);
    else arity = Math.max(arity, spec.index + 1);
  }
  for (const child of node.children) {
    if (!children.has(child.name)) throw new KdlDecodeError(`${child.path}: unknown node`);
  }
  for (const prop of Object.keys(node.props)) {
    if (!props.has(prop)) throw new KdlDecodeError(`${node.path}: unknown property ${prop}=`);
  }
  if (node.args.length > arity) {
    throw new KdlDecodeError(`${node.path}: ${node.args.length} arguments; expected ${arity}`);
  }
}

/**
 * Decode `node` (usually a file's root from `loadKdl`) into `schema`, then validate it.
 * Throws `KdlDecodeError`, naming the node path, when a required field is missing or a
 * value fails validation. `secretsFile` is handed to each `SecretRef` it creates.
 */
export function decodeKdl<T extends KdlSchema>(
  schema: T,
  node: KNode,
  opts: { secretsFile?: string } = {},
): T["_zod"]["output"] {
  const decoder = new Decoder(opts.secretsFile);
  const raw = decoder.object(schema, node);
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  const issues = result.error?.issues ?? [];
  throw new KdlDecodeError(issues.map((issue) => decoder.explain(raw, issue)).join("\n"));
}

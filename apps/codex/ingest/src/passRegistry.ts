import { getTracer, logger } from "@astra/observe";
/**
 * The generic pass registry the transform runs on (`transform.ts` holds the codex passes).
 *
 * A pass names the state slots it reads and the slots it writes. The registry is a plain
 * array in run order. `validatePasses` checks it before anything runs: unique names, one
 * writer per slot, every read written by some pass, no dependency cycle, every pass after
 * the passes it reads from, and the parse phase before the build phase. `runPasses` then
 * runs it in order, hands each pass only the slots it declared, rejects output that does
 * not match its `writes`, and records one span, one log line and one timing per pass.
 *
 * Passes may mutate entities they read (several do, in place); declaring the slot as a
 * read is what fixes their order relative to every other pass that touches it.
 */
import { SpanStatusCode } from "@opentelemetry/api";

/** `parse` passes all run before the hard-failure gate; `build` passes run after it. */
export type PassPhase = "parse" | "build";

/** What every pass gets besides its slots; a registry may extend it. */
export interface PassContext {
  /** How many report-class events have been recorded so far (for per-pass deltas). */
  reportEventCount: () => number;
  /** How many hard failures have been recorded so far. */
  hardFailureCount: () => number;
}

export interface Pass<S, R extends keyof S, W extends keyof S, C extends PassContext> {
  name: string;
  phase: PassPhase;
  /** One sentence: what the pass does. Shown by `transform --list-passes`. */
  summary: string;
  reads: readonly R[];
  writes: readonly W[];
  run: (input: Pick<S, R>, ctx: C) => Pick<S, W>;
  /** Counts logged and traced for this pass (never written to the corpus). */
  counts?: (output: Pick<S, W>) => Record<string, number>;
}

/** A pass with its slot types erased, so passes over different slots share one array. */
export interface AnyPass<S, C extends PassContext> {
  name: string;
  phase: PassPhase;
  summary: string;
  reads: readonly (keyof S)[];
  writes: readonly (keyof S)[];
  run: (input: Partial<S>, ctx: C) => Partial<S>;
  counts?: (output: Partial<S>) => Record<string, number>;
}

/** Types one pass against the slot map `S` and context `C`, then erases the slot types
 * for the registry array. */
export function definePass<S, C extends PassContext>() {
  return <R extends keyof S, W extends keyof S>(pass: Pass<S, R, W, C>): AnyPass<S, C> =>
    pass as unknown as AnyPass<S, C>;
}

export class PassRegistryError extends Error {
  override name = "PassRegistryError";
}

/** The fields validation and closure need; any registry's passes fit it. */
type PassShape<S> = Pick<AnyPass<S, PassContext>, "name" | "phase" | "reads" | "writes">;

/**
 * Throws a `PassRegistryError` naming every problem in the registry. `initial` lists the
 * slots that exist before any pass runs (none for the transform).
 */
export function validatePasses<S>(
  passes: readonly PassShape<S>[],
  initial: readonly (keyof S)[] = [],
): void {
  const problems: string[] = [];
  const seenNames = new Set<string>();
  for (const pass of passes) {
    if (seenNames.has(pass.name)) problems.push(`duplicate pass name "${pass.name}"`);
    seenNames.add(pass.name);
  }

  const writerOf = new Map<keyof S, string>();
  for (const slot of initial) writerOf.set(slot, "(initial)");
  for (const pass of passes) {
    for (const slot of pass.writes) {
      const other = writerOf.get(slot);
      if (other === undefined) writerOf.set(slot, pass.name);
      else problems.push(`slot "${String(slot)}" is written by both "${other}" and "${pass.name}"`);
    }
  }

  for (const pass of passes) {
    for (const slot of pass.reads) {
      if (!writerOf.has(slot)) {
        problems.push(`pass "${pass.name}" reads "${String(slot)}", which no pass writes`);
      }
    }
  }

  const cycle = findCycle(passes, writerOf);
  if (cycle) problems.push(`dependency cycle: ${cycle.join(" -> ")}`);

  const position = new Map(passes.map((p, i) => [p.name, i] as const));
  passes.forEach((pass, i) => {
    for (const slot of pass.reads) {
      const writer = writerOf.get(slot);
      const at = writer === undefined ? undefined : position.get(writer);
      if (at !== undefined && at > i) {
        problems.push(`pass "${pass.name}" reads "${String(slot)}" before "${writer}" writes it`);
      }
    }
  });

  const firstBuild = passes.findIndex((p) => p.phase === "build");
  if (firstBuild >= 0) {
    for (const pass of passes.slice(firstBuild)) {
      if (pass.phase === "parse") {
        problems.push(`parse pass "${pass.name}" comes after the first build pass`);
      }
    }
  }

  if (problems.length > 0) {
    throw new PassRegistryError(`invalid pass registry:\n  ${problems.join("\n  ")}`);
  }
}

/** The first dependency cycle among the passes (pass -> a pass it reads from), if any. A
 * pass that reads its own write counts as a cycle of one. */
function findCycle<S>(
  passes: readonly PassShape<S>[],
  writerOf: ReadonlyMap<keyof S, string>,
): string[] | undefined {
  const byName = new Map(passes.map((p) => [p.name, p] as const));
  const state = new Map<string, "open" | "done">();
  const stack: string[] = [];
  function visit(name: string): string[] | undefined {
    if (state.get(name) === "done") return undefined;
    if (state.get(name) === "open") return [...stack.slice(stack.indexOf(name)), name];
    state.set(name, "open");
    stack.push(name);
    for (const slot of byName.get(name)?.reads ?? []) {
      const writer = writerOf.get(slot);
      if (writer === undefined || !byName.has(writer)) continue;
      const found = visit(writer);
      if (found) return found;
    }
    stack.pop();
    state.set(name, "done");
    return undefined;
  }
  for (const pass of passes) {
    const found = visit(pass.name);
    if (found) return found;
  }
  return undefined;
}

/**
 * The passes `target` needs, in registry order: the target and every pass it reads from,
 * transitively. Throws on an unknown pass name.
 */
export function passClosure<S, C extends PassContext>(
  passes: readonly AnyPass<S, C>[],
  target: string,
): AnyPass<S, C>[] {
  if (!passes.some((p) => p.name === target)) {
    throw new PassRegistryError(
      `unknown pass "${target}"; passes: ${passes.map((p) => p.name).join(", ")}`,
    );
  }
  const writerOf = new Map<keyof S, string>();
  for (const pass of passes) for (const slot of pass.writes) writerOf.set(slot, pass.name);
  const byName = new Map(passes.map((p) => [p.name, p] as const));
  const needed = new Set<string>();
  const queue = [target];
  for (let name = queue.pop(); name !== undefined; name = queue.pop()) {
    if (needed.has(name)) continue;
    needed.add(name);
    for (const slot of byName.get(name)?.reads ?? []) {
      const writer = writerOf.get(slot);
      if (writer !== undefined) queue.push(writer);
    }
  }
  return passes.filter((p) => needed.has(p.name));
}

/** One pass's run, as logged and traced. */
export interface PassRun {
  name: string;
  durationMs: number;
  /** Report-class events the pass recorded. */
  reportEvents: number;
  /** Hard failures the pass recorded. */
  hardFailures: number;
  counts: Record<string, number>;
}

export interface RunPassesResult<S> {
  state: Partial<S>;
  runs: PassRun[];
  /** True when the run stopped at the hard-failure gate after the parse phase. */
  halted: boolean;
}

const SCOPE = "astra.codex-ingest";
const log = logger(SCOPE);

/**
 * Runs `passes` in order (validate them first). Once the parse phase is over, a run with
 * any hard failure stops before its first build pass. A pass that throws ends its span
 * with an error and rethrows.
 */
export function runPasses<S, C extends PassContext>(
  passes: readonly AnyPass<S, C>[],
  ctx: C,
): RunPassesResult<S> {
  const state: Partial<S> = {};
  const runs: PassRun[] = [];
  const tracer = getTracer(SCOPE);
  for (const pass of passes) {
    if (pass.phase === "build" && ctx.hardFailureCount() > 0) {
      log.warn(`transform halted before ${pass.name}: ${ctx.hardFailureCount()} hard failures`);
      return { state, runs, halted: true };
    }
    const input: Partial<S> = {};
    for (const slot of pass.reads) {
      if (!(slot in state)) {
        throw new PassRegistryError(`pass "${pass.name}" ran before "${String(slot)}" was written`);
      }
      input[slot] = state[slot];
    }
    const before = { reports: ctx.reportEventCount(), failures: ctx.hardFailureCount() };
    const started = performance.now();
    const output = tracer.startActiveSpan(`codex.transform.${pass.name}`, (span) => {
      try {
        const out = pass.run(input, ctx);
        const run = finishRun(pass, out, started, before, ctx);
        span.setAttributes({
          "codex.pass.duration_ms": run.durationMs,
          "codex.pass.report_events": run.reportEvents,
          "codex.pass.hard_failures": run.hardFailures,
          ...prefixed(run.counts),
        });
        runs.push(run);
        return out;
      } catch (e) {
        span.recordException(e instanceof Error ? e : String(e));
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw e;
      } finally {
        span.end();
      }
    });
    Object.assign(state, output);
  }
  return { state, runs, halted: false };
}

function prefixed(counts: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts)) out[`codex.pass.${k}`] = v;
  return out;
}

function finishRun<S, C extends PassContext>(
  pass: AnyPass<S, C>,
  output: Partial<S>,
  started: number,
  before: { reports: number; failures: number },
  ctx: C,
): PassRun {
  const wrote = Object.keys(output).sort();
  const declared = pass.writes.map(String).sort();
  if (wrote.join("\0") !== declared.join("\0")) {
    throw new PassRegistryError(
      `pass "${pass.name}" wrote [${wrote.join(", ")}] but declares [${declared.join(", ")}]`,
    );
  }
  const run: PassRun = {
    name: pass.name,
    durationMs: Math.round(performance.now() - started),
    reportEvents: ctx.reportEventCount() - before.reports,
    hardFailures: ctx.hardFailureCount() - before.failures,
    counts: pass.counts?.(output) ?? {},
  };
  const counts = Object.entries(run.counts).map(([k, v]) => `${k}=${v}`);
  const line = [`pass ${pass.name}`, `${run.durationMs}ms`, ...counts].join(" ");
  log.info(line, {
    "codex.pass": pass.name,
    "codex.pass.duration_ms": run.durationMs,
    "codex.pass.report_events": run.reportEvents,
    "codex.pass.hard_failures": run.hardFailures,
    ...prefixed(run.counts),
  });
  return run;
}

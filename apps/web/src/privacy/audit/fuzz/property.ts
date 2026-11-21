// Runs a check over many generated inputs. When one fails, the input is shrunk to a smaller one that still fails,
// and the message gives the seed, so the failure can be repeated and read.

import { createRng, seedFor, type Rng } from "./rng";

export interface PropertySpec<T> {
  name: string;
  /** How many inputs to try. Default 200. */
  runs?: number;
  /** Base seed. Each run gets its own seed made from it. */
  seed?: number;
  gen: (rng: Rng, run: number) => T;
  /** Throw (for example with expect) when the input breaks the rule. */
  prop: (input: T) => void | Promise<void>;
  /** Simpler inputs to try, simplest first. Without it the failing input is reported as it was. */
  shrink?: (input: T) => Iterable<T>;
  /** How to print an input. Default: JSON, or String for what JSON cannot write. */
  show?: (input: T) => string;
}

export interface PropertyFailure<T> {
  name: string;
  seed: number;
  run: number;
  runSeed: number;
  input: T;
  shrunk: T;
  shrinkSteps: number;
  error: string;
}

export const DEFAULT_RUNS = 200;
export const DEFAULT_SEED = 20261120;
const MAX_SHRINK_STEPS = 400;

function describeError(e: unknown): string {
  if (e instanceof Error) return e.message.split("\n").find((l) => l.trim() !== "")?.trim() ?? e.name;
  return String(e);
}

export function showValue(v: unknown, limit = 400): string {
  try {
    const t = JSON.stringify(v);
    if (t !== undefined) return t.length > limit ? `${t.slice(0, limit)}… (${t.length} characters)` : t;
  } catch {
    // fall through: circular or not JSON
  }
  return String(v);
}

/** Smallest failing input reachable by repeatedly taking the first simpler input that still fails. */
export function minimise<T>(input: T, fails: (t: T) => boolean, shrink: (t: T) => Iterable<T>, maxSteps = MAX_SHRINK_STEPS): { value: T; steps: number } {
  let best = input;
  let steps = 0;
  let progressed = true;
  while (progressed && steps < maxSteps) {
    progressed = false;
    for (const candidate of shrink(best)) {
      steps += 1;
      if (steps >= maxSteps) break;
      if (fails(candidate)) {
        best = candidate;
        progressed = true;
        break;
      }
    }
  }
  return { value: best, steps };
}

function failure<T>(spec: PropertySpec<T>, seed: number, run: number, runSeed: number, input: T, error: unknown, shrunk: T, steps: number): PropertyFailure<T> {
  return { name: spec.name, seed, run, runSeed, input, shrunk, shrinkSteps: steps, error: describeError(error) };
}

export function checkProperty<T>(spec: PropertySpec<T>): PropertyFailure<T> | null {
  const seed = spec.seed ?? DEFAULT_SEED;
  const runs = spec.runs ?? DEFAULT_RUNS;
  for (let run = 0; run < runs; run += 1) {
    const runSeed = seedFor(seed, run);
    const input = spec.gen(createRng(runSeed), run);
    try {
      const r = spec.prop(input);
      if (r instanceof Promise) {
        r.catch(() => undefined);
        throw new TypeError(`${spec.name}: prop returned a promise; use checkPropertyAsync`);
      }
    } catch (e) {
      if (e instanceof TypeError && e.message.includes("checkPropertyAsync")) throw e;
      let shrunk = input;
      let steps = 0;
      if (spec.shrink !== undefined) {
        const m = minimise(
          input,
          (t) => {
            try {
              spec.prop(t);
              return false;
            } catch {
              return true;
            }
          },
          spec.shrink,
        );
        shrunk = m.value;
        steps = m.steps;
      }
      let last: unknown = e;
      if (shrunk !== input) {
        try {
          spec.prop(shrunk);
        } catch (e2) {
          last = e2;
        }
      }
      return failure(spec, seed, run, runSeed, input, last, shrunk, steps);
    }
  }
  return null;
}

export async function checkPropertyAsync<T>(spec: PropertySpec<T>): Promise<PropertyFailure<T> | null> {
  const seed = spec.seed ?? DEFAULT_SEED;
  const runs = spec.runs ?? DEFAULT_RUNS;
  for (let run = 0; run < runs; run += 1) {
    const runSeed = seedFor(seed, run);
    const input = spec.gen(createRng(runSeed), run);
    try {
      await spec.prop(input);
    } catch (e) {
      let shrunk = input;
      let steps = 0;
      if (spec.shrink !== undefined) {
        let best = input;
        let progressed = true;
        while (progressed && steps < MAX_SHRINK_STEPS) {
          progressed = false;
          for (const c of spec.shrink(best)) {
            steps += 1;
            if (steps >= MAX_SHRINK_STEPS) break;
            let fails = false;
            try {
              await spec.prop(c);
            } catch {
              fails = true;
            }
            if (fails) {
              best = c;
              progressed = true;
              break;
            }
          }
        }
        shrunk = best;
      }
      let last: unknown = e;
      if (shrunk !== input) {
        try {
          await spec.prop(shrunk);
        } catch (e2) {
          last = e2;
        }
      }
      return failure(spec, seed, run, runSeed, input, last, shrunk, steps);
    }
  }
  return null;
}

const CLIP = 1200;
const clip = (t: string): string => (t.length > CLIP ? `${t.slice(0, CLIP)}… (${t.length} characters)` : t);

export function explain<T>(f: PropertyFailure<T>, show: (t: T) => string = showValue): string {
  return [
    `Property failed: ${f.name}`,
    `  ${f.error}`,
    `  seed ${f.seed}, run ${f.run} (run seed ${f.runSeed}); shrunk in ${f.shrinkSteps} steps`,
    `  smallest input: ${clip(show(f.shrunk))}`,
    `  first input:    ${clip(show(f.input))}`,
  ].join("\n");
}

/** For a test: throws with the seed and the smallest failing input, or returns when every run holds. */
export function assertProperty<T>(spec: PropertySpec<T>): void {
  const f = checkProperty(spec);
  if (f !== null) throw new Error(explain(f, spec.show));
}

export async function assertPropertyAsync<T>(spec: PropertySpec<T>): Promise<void> {
  const f = await checkPropertyAsync(spec);
  if (f !== null) throw new Error(explain(f, spec.show));
}

// ---- shrinkers ----

export function* shrinkString(s: string): Iterable<string> {
  if (s === "") return;
  yield "";
  for (let size = Math.floor(s.length / 2); size >= 1; size = Math.floor(size / 2)) {
    for (let at = 0; at + size <= s.length; at += size) yield s.slice(0, at) + s.slice(at + size);
    if (size === 1) break;
  }
  if (s.length > 1) yield s.slice(0, 1);
}

export function* shrinkList<T>(list: readonly T[], shrinkItem?: (t: T) => Iterable<T>): Iterable<T[]> {
  if (list.length === 0) return;
  yield [];
  for (let size = Math.floor(list.length / 2); size >= 1; size = Math.floor(size / 2)) {
    for (let at = 0; at + size <= list.length; at += size) yield [...list.slice(0, at), ...list.slice(at + size)];
    if (size === 1) break;
  }
  if (shrinkItem !== undefined) {
    for (let i = 0; i < list.length; i += 1) for (const s of shrinkItem(list[i] as T)) yield [...list.slice(0, i), s, ...list.slice(i + 1)];
  }
}

/** Simpler JSON values: scalars first, then the same value with one part removed or replaced by a simpler one. */
export function* shrinkJson(v: unknown): Iterable<unknown> {
  if (Array.isArray(v)) {
    yield null;
    yield [];
    for (const l of shrinkList(v, shrinkJson)) yield l;
    for (const x of v) if (x !== null && typeof x === "object") yield x;
  } else if (v !== null && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o);
    yield null;
    yield {};
    for (const k of keys) {
      const copy: Record<string, unknown> = {};
      for (const k2 of keys) if (k2 !== k) Object.defineProperty(copy, k2, { value: o[k2], enumerable: true, writable: true, configurable: true });
      yield copy;
    }
    for (const k of keys) yield o[k];
    for (const k of keys) {
      for (const s of shrinkJson(o[k])) {
        const copy: Record<string, unknown> = {};
        for (const k2 of keys) Object.defineProperty(copy, k2, { value: k2 === k ? s : o[k2], enumerable: true, writable: true, configurable: true });
        yield copy;
      }
    }
  } else if (typeof v === "string") {
    for (const s of shrinkString(v)) yield s;
  } else if (typeof v === "number" && v !== 0) {
    yield 0;
  } else if (v === true) {
    yield false;
  }
}

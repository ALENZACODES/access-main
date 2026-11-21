// Generators for awkward input: text and JSON that real storage can hold but nobody planned for.
// Everything takes a seeded Rng, so a failing input can be rebuilt from its seed.

import type { Rng } from "./rng";

/** Strings that have broken parsers, forms and file formats before. */
export const AWKWARD_STRINGS: readonly string[] = [
  "",
  " ",
  " ",
  " ",
  "﻿",
  "\u0000",
  "​",
  "‮",
  "\n",
  "\r\n",
  "\t",
  "é",
  "é",
  "😀",
  "\ud800",
  "\udfff",
  "__proto__",
  "constructor",
  "prototype",
  "toString",
  "hasOwnProperty",
  "valueOf",
  "../",
  "%00",
  "<script>",
  "'\"",
  "\\",
  "=1+1",
  "null",
  "undefined",
  "NaN",
  "-0",
  "1e999",
  "true",
  "{}",
  "[]",
  "0",
];

const WORD_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._:-";

/** A name made only of the characters a storage key may have. */
export function genKeyName(rng: Rng, maxLen = 12): string {
  const n = rng.int(1, maxLen);
  let out = "";
  for (let i = 0; i < n; i += 1) out += WORD_CHARS[rng.int(0, WORD_CHARS.length - 1)];
  return out;
}

/** Any text: mostly ordinary, sometimes one of the awkward strings, sometimes long. */
export function genString(rng: Rng, maxLen = 24): string {
  const roll = rng.next();
  if (roll < 0.25) return rng.pick(AWKWARD_STRINGS);
  if (roll < 0.3) return "x".repeat(rng.int(maxLen, maxLen * 40));
  const n = rng.int(0, maxLen);
  let out = "";
  for (let i = 0; i < n; i += 1) {
    out += rng.bool(0.15) ? rng.pick(AWKWARD_STRINGS) : WORD_CHARS[rng.int(0, WORD_CHARS.length - 1)];
  }
  return out;
}

/** A date text that is sometimes real and sometimes only looks like one. */
export function genDateText(rng: Rng): string {
  const roll = rng.next();
  if (roll < 0.5) return `20${String(rng.int(20, 30))}-${String(rng.int(1, 12)).padStart(2, "0")}-${String(rng.int(1, 28)).padStart(2, "0")}`;
  if (roll < 0.7) return new Date(Date.UTC(2026, rng.int(0, 11), rng.int(1, 28), rng.int(0, 23))).toISOString();
  if (roll < 0.8) return "2026-13-45";
  if (roll < 0.9) return "2026-02-30";
  return genString(rng, 14);
}

export function genNumber(rng: Rng): number {
  return rng.pick([0, -0, 1, -1, 2, 7, 50, 51, 1000, 2 ** 31, 2 ** 53, -(2 ** 53), 0.5, 1e-9, Number.MAX_VALUE, Number.MIN_VALUE, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, rng.int(-1000, 1000)]);
}

/** Sets a property as an own, enumerable one even for names like __proto__. */
export function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

export function genScalar(rng: Rng): unknown {
  const roll = rng.int(0, 5);
  if (roll === 0) return null;
  if (roll === 1) return rng.bool();
  if (roll === 2) return genNumber(rng);
  return genString(rng);
}

/** A JSON value. Numbers that JSON cannot hold (NaN, Infinity) are left in: JSON.stringify turns them into null, which is the point. */
export function genJson(rng: Rng, depth = 3): unknown {
  if (depth <= 0 || rng.bool(0.4)) return genScalar(rng);
  if (rng.bool(0.4)) {
    const n = rng.int(0, 4);
    return Array.from({ length: n }, () => genJson(rng, depth - 1));
  }
  const o: Record<string, unknown> = {};
  const n = rng.int(0, 5);
  for (let i = 0; i < n; i += 1) setOwn(o, rng.bool(0.15) ? rng.pick(AWKWARD_STRINGS) : genKeyName(rng, 8), genJson(rng, depth - 1));
  return o;
}

/** A value that is deeply nested on purpose. */
export function genDeep(depth: number, leaf: unknown = 1): unknown {
  let v: unknown = leaf;
  for (let i = 0; i < depth; i += 1) v = i % 2 === 0 ? [v] : { a: v };
  return v;
}

function clone(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(clone);
  if (v !== null && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) setOwn(o, k, clone(x));
    return o;
  }
  return v;
}

/** Changes one thing somewhere inside a value: a type, a key, a length, a number. Returns a changed copy. */
export function mutateJson(rng: Rng, value: unknown): unknown {
  const root = clone(value);
  const holders: Array<{ get: () => unknown; set: (v: unknown) => void; remove?: () => void; rename?: (to: string) => void }> = [
    { get: () => root, set: () => undefined },
  ];
  const walk = (v: unknown, set: (x: unknown) => void): void => {
    if (Array.isArray(v)) {
      v.forEach((_, i) => {
        holders.push({ get: () => v[i], set: (x) => { v[i] = x; }, remove: () => { v.splice(i, 1); } });
        walk(v[i], (x) => { v[i] = x; });
      });
    } else if (v !== null && typeof v === "object") {
      const o = v as Record<string, unknown>;
      for (const k of Object.keys(o)) {
        holders.push({ get: () => o[k], set: (x) => setOwn(o, k, x), remove: () => { delete o[k]; }, rename: (to) => { const x = o[k]; delete o[k]; setOwn(o, to, x); } });
        walk(o[k], (x) => setOwn(o, k, x));
      }
    }
    void set;
  };
  walk(root, () => undefined);
  const target = rng.pick(holders);
  const op = rng.int(0, 6);
  const cur = target.get();
  if (target.get === holders[0]?.get) {
    if (cur !== null && typeof cur === "object" && !Array.isArray(cur)) {
      setOwn(cur as Record<string, unknown>, rng.pick(["__proto__", "constructor", genKeyName(rng, 6)]), genScalar(rng));
      return root;
    }
    return genScalar(rng);
  }
  if (op === 0) target.set(genScalar(rng));
  else if (op === 1 && target.remove !== undefined) target.remove();
  else if (op === 2) target.set(typeof cur === "string" ? Number(cur.length) : String(cur));
  else if (op === 3) target.set(cur === null ? {} : null);
  else if (op === 4) target.set([cur]);
  else if (op === 5 && target.rename !== undefined) target.rename(rng.pick(["__proto__", "constructor", genKeyName(rng, 6)]));
  else if (typeof cur === "number") target.set(rng.pick([-1, 0.5, Number.NaN, 2 ** 53, -0]));
  else if (cur !== null && typeof cur === "object" && !Array.isArray(cur)) setOwn(cur as Record<string, unknown>, rng.pick(["__proto__", genKeyName(rng, 6)]), genScalar(rng));
  else target.set(genString(rng));
  return root;
}

/** Changes the written-out text itself: cuts it, breaks a quote, splices in an awkward string. */
export function mutateText(rng: Rng, text: string): string {
  if (text === "") return rng.pick(AWKWARD_STRINGS);
  const at = rng.int(0, text.length - 1);
  switch (rng.int(0, 7)) {
    case 0:
      return text.slice(0, at);
    case 1:
      return text.slice(at);
    case 2:
      return text.slice(0, at) + text.slice(at + rng.int(1, 6));
    case 3:
      return text.slice(0, at) + rng.pick(AWKWARD_STRINGS) + text.slice(at);
    case 4:
      return text.slice(0, at) + (text[at] === '"' ? "'" : '"') + text.slice(at + 1);
    case 5:
      return text + text.slice(at, at + rng.int(1, 12));
    case 6: {
      const b = rng.int(0, text.length - 1);
      const [lo, hi] = at <= b ? [at, b] : [b, at];
      return text.slice(0, lo) + text.slice(lo, hi).split("").reverse().join("") + text.slice(hi);
    }
    default:
      return `${rng.pick(["﻿", " ", "\n", "[", "{"])}${text}`;
  }
}

/** JSON text of a value, written out in one of the ways a tool might write it. */
export function writeJson(rng: Rng, value: unknown): string {
  const style = rng.int(0, 3);
  const text = JSON.stringify(value, null, style === 0 ? 2 : style === 1 ? "\t" : undefined);
  return text === undefined ? "null" : style === 3 ? `${text}\n` : text;
}

// English and French copy tables must have the same shape and the same facts.
// This catches a missing translation, a string left in English, and a number
// or placeholder that differs between the two languages.

export type ParityCode =
  | "missing-in-fr"
  | "missing-in-en"
  | "type-mismatch"
  | "empty"
  | "identical"
  | "placeholder-mismatch"
  | "digits-mismatch"
  | "function-unsampled"
  | "function-throws";

export interface ParityProblem {
  path: string;
  code: ParityCode;
  detail: string;
}

export interface ParityOptions {
  /** Argument lists to call each copy function with, keyed by path. Every function needs at least one. */
  samples?: Readonly<Record<string, ReadonlyArray<readonly unknown[]>>>;
  /** Paths whose English and French text may legitimately be the same (names, codes). */
  allowIdentical?: readonly string[];
  /** Strings shorter than this are not flagged as identical (e.g. "Item"). Default 12. */
  minIdenticalLength?: number;
}

const PLACEHOLDER = /\{[a-zA-Z0-9_]+\}/g;
const DIGITS = /\d+/g;

function sig(s: string, re: RegExp): string {
  return (s.match(re) ?? []).slice().sort().join("|");
}

function kind(v: unknown): string {
  return v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
}

export function checkParity(en: unknown, fr: unknown, options: ParityOptions = {}): ParityProblem[] {
  const out: ParityProblem[] = [];
  const minLen = options.minIdenticalLength ?? 12;
  const allow = new Set(options.allowIdentical ?? []);

  const text = (path: string, a: string, b: string): void => {
    if (a.trim() === "" || b.trim() === "") {
      out.push({ path, code: "empty", detail: a.trim() === "" ? "English is empty" : "French is empty" });
      return;
    }
    if (a === b && a.length >= minLen && !allow.has(path)) {
      out.push({ path, code: "identical", detail: `same text in both languages: "${a}"` });
    }
    if (sig(a, PLACEHOLDER) !== sig(b, PLACEHOLDER)) {
      out.push({ path, code: "placeholder-mismatch", detail: `"${a}" vs "${b}"` });
    }
    if (sig(a, DIGITS) !== sig(b, DIGITS)) {
      out.push({ path, code: "digits-mismatch", detail: `"${a}" vs "${b}"` });
    }
  };

  const walk = (a: unknown, b: unknown, path: string): void => {
    if (kind(a) !== kind(b)) {
      out.push({ path, code: "type-mismatch", detail: `${kind(a)} in English, ${kind(b)} in French` });
      return;
    }
    if (typeof a === "string" && typeof b === "string") {
      text(path, a, b);
    } else if (typeof a === "function" && typeof b === "function") {
      const samples = options.samples?.[path];
      if (samples === undefined || samples.length === 0) {
        out.push({ path, code: "function-unsampled", detail: "no sample arguments given for this function" });
        return;
      }
      samples.forEach((args, i) => {
        try {
          const ra: unknown = (a as (...x: unknown[]) => unknown)(...args);
          const rb: unknown = (b as (...x: unknown[]) => unknown)(...args);
          if (typeof ra === "string" && typeof rb === "string") text(`${path}#${i}`, ra, rb);
          else out.push({ path: `${path}#${i}`, code: "type-mismatch", detail: "function did not return text" });
        } catch (e) {
          out.push({ path: `${path}#${i}`, code: "function-throws", detail: String(e) });
        }
      });
    } else if (a !== null && typeof a === "object" && b !== null && typeof b === "object") {
      const ea = a as Record<string, unknown>;
      const eb = b as Record<string, unknown>;
      for (const k of Object.keys(ea)) {
        const p = path === "" ? k : `${path}.${k}`;
        if (!(k in eb)) out.push({ path: p, code: "missing-in-fr", detail: "key is missing in French" });
        else walk(ea[k], eb[k], p);
      }
      for (const k of Object.keys(eb)) {
        if (!(k in ea)) out.push({ path: path === "" ? k : `${path}.${k}`, code: "missing-in-en", detail: "key is missing in English" });
      }
    }
  };

  walk(en, fr, "");
  return out;
}

export function assertParity(en: unknown, fr: unknown, options: ParityOptions = {}): void {
  const p = checkParity(en, fr, options);
  if (p.length > 0) {
    throw new Error(`EN/FR parity failed:\n${p.map((x) => `${x.code} at ${x.path || "(root)"}: ${x.detail}`).join("\n")}`);
  }
}

// What the TypeScript configuration files say about how strictly the code is checked: the on/off flags of the compiler
// options, the file the config extends, and what each flag comes to once the extended files are followed. It reads the
// text of the files. It does not run the compiler, and a flag that the text does not settle (an extended file that is
// not among the files given, a value that is not true or false) is kept as unknown. Node only (tests and CI), never
// shipped to the browser.

import { isArray, isObject, keyLine, parseJsonc, type JsonVal } from "./jsonc";

export const TS_FLAGS = [
  "strict",
  "alwaysStrict",
  "noImplicitAny",
  "noImplicitThis",
  "strictNullChecks",
  "strictFunctionTypes",
  "strictBindCallApply",
  "strictPropertyInitialization",
  "useUnknownInCatchVariables",
  "noUncheckedIndexedAccess",
  "exactOptionalPropertyTypes",
  "noImplicitOverride",
  "noFallthroughCasesInSwitch",
  "noUnusedLocals",
  "noUnusedParameters",
  "skipLibCheck",
  "allowJs",
  "checkJs",
  "noEmit",
  "isolatedModules",
  "verbatimModuleSyntax",
] as const;

export type TsFlag = (typeof TS_FLAGS)[number];
export type FlagState = "true" | "false" | "absent" | "unknown";

/** The flags that `strict` turns on when it is true and they are not written. */
export const STRICT_FAMILY: readonly TsFlag[] = ["alwaysStrict", "noImplicitAny", "noImplicitThis", "strictNullChecks", "strictFunctionTypes", "strictBindCallApply", "strictPropertyInitialization", "useUnknownInCatchVariables"];

export interface TsConfig {
  path: string;
  /** Null when the text was read. */
  problem: string | null;
  /** The files named by `extends`, as written (a text or a list of texts). */
  extends: string[];
  /** True when `extends` is written as something other than text or a list of texts. */
  extendsUnreadable: boolean;
  /** Each flag as written in this file only. */
  flags: Record<TsFlag, FlagState>;
  lines: Partial<Record<TsFlag, number>>;
  include: string[] | null;
  exclude: string[] | null;
}

const stringsOf = (v: JsonVal | undefined): string[] | null => (isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null);

/** Reads one configuration file. Never throws. */
export function parseTsConfig(path: string, text: string): TsConfig {
  const flags = Object.fromEntries(TS_FLAGS.map((f) => [f, "absent"])) as Record<TsFlag, FlagState>;
  const base: TsConfig = { path, problem: null, extends: [], extendsUnreadable: false, flags, lines: {}, include: null, exclude: null };
  const r = parseJsonc(text);
  if (r.value === undefined) return { ...base, problem: r.problem };
  if (!isObject(r.value)) return { ...base, problem: "the file is not an object" };
  const root = r.value;
  const ext = root["extends"];
  const extList = typeof ext === "string" ? [ext] : stringsOf(ext);
  const options = root["compilerOptions"];
  const lines: Partial<Record<TsFlag, number>> = {};
  if (isObject(options)) {
    const from = text.indexOf("compilerOptions");
    for (const f of TS_FLAGS) {
      if (!(f in options)) continue;
      const v = options[f];
      flags[f] = v === true ? "true" : v === false ? "false" : "unknown";
      lines[f] = keyLine(text, f, Math.max(0, from));
    }
  }
  return {
    ...base,
    extends: extList ?? [],
    extendsUnreadable: ext !== undefined && extList === null,
    flags,
    lines,
    include: stringsOf(root["include"]),
    exclude: stringsOf(root["exclude"]),
  };
}

function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

/** Joins a relative path to a folder and takes out . and .. ; null when it climbs out of the root. */
export function joinPath(dir: string, rel: string): string | null {
  const parts = dir === "" ? [] : dir.split("/");
  for (const seg of rel.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join("/");
}

/** The path of the file an `extends` text names, among the paths given, or null when it is not one of them. */
export function resolveExtends(from: string, target: string, known: ReadonlySet<string>): string | null {
  if (!target.startsWith(".")) return null;
  const joined = joinPath(dirOf(from), target);
  if (joined === null) return null;
  for (const cand of [joined, `${joined}.json`, `${joined}/tsconfig.json`]) if (known.has(cand)) return cand;
  return null;
}

export type Effective = Record<TsFlag, FlagState>;

/** What each flag comes to for each file once `extends` is followed. A flag that an unreachable file may set is unknown. */
export function effectiveFlags(configs: readonly TsConfig[]): Map<string, Effective> {
  const byPath = new Map(configs.map((c) => [c.path, c]));
  const known = new Set(byPath.keys());
  const memo = new Map<string, Effective>();

  const build = (path: string, seen: readonly string[]): Effective => {
    const hit = memo.get(path);
    if (hit !== undefined) return hit;
    const cfg = byPath.get(path) as TsConfig;
    const result = Object.fromEntries(TS_FLAGS.map((f) => [f, "absent"])) as Effective;
    let unreachable = cfg.extendsUnreadable || cfg.problem !== null;
    for (const target of cfg.extends) {
      const p = resolveExtends(path, target, known);
      if (p === null || seen.includes(p)) {
        unreachable = true;
        continue;
      }
      const parent = build(p, [...seen, path]);
      for (const f of TS_FLAGS) if (parent[f] !== "absent") result[f] = parent[f];
    }
    for (const f of TS_FLAGS) {
      const own = cfg.flags[f];
      if (own !== "absent") result[f] = own;
      else if (unreachable && result[f] === "absent") result[f] = "unknown";
    }
    memo.set(path, result);
    return result;
  };

  const out = new Map<string, Effective>();
  for (const c of configs) out.set(c.path, build(c.path, []));
  return out;
}

/** The flag with `strict` taken into account: a flag of the strict family that is not written follows strict. */
export function withStrict(e: Effective, flag: TsFlag): FlagState {
  if (e[flag] !== "absent") return e[flag];
  if (STRICT_FAMILY.includes(flag)) return e["strict"] === "true" ? "true" : e["strict"];
  return "absent";
}

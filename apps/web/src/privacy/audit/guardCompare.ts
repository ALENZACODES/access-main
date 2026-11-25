// Compares what the strictness scans found with the register: the compiler flags of each configuration, the
// suppressions in the code, the lists in the test and lint configuration, the package files read, and the findings
// against the accepted list. It reads nothing itself. Node only (tests and CI), never shipped to the browser.

import type { ConfigFacts } from "./configScan";
import type { GuardFinding } from "./guardRules";
import type { GuardAcceptRow, GuardRegister } from "./guardRegister";
import { GUARD_ACCEPTABLE } from "./guardRegister";
import type { SuppressCount } from "./suppressScan";
import { effectiveFlags, TS_FLAGS, type TsConfig } from "./tsModel";

export type GuardProblemCode =
  | "config-added"
  | "config-gone"
  | "flags-changed"
  | "suppress-added"
  | "suppress-gone"
  | "suppress-count-changed"
  | "list-changed"
  | "list-gone"
  | "list-added"
  | "file-gone"
  | "package-added"
  | "package-gone"
  | "finding-not-accepted"
  | "accepted-gone"
  | "count-changed"
  | "unacceptable-code";

export interface GuardProblem {
  code: GuardProblemCode;
  key: string;
  detail: string;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const byKey = (a: GuardProblem, b: GuardProblem): number => cmp(a.key, b.key) || cmp(a.code, b.code);

/** The flags of a configuration as text: each flag that is written somewhere, as name=state, in the order of TS_FLAGS. */
export function flagSummary(e: Record<(typeof TS_FLAGS)[number], string>): string {
  return TS_FLAGS.filter((f) => e[f] !== "absent").map((f) => `${f}=${e[f]}`).join(",");
}

/** The differences between the flags that the configurations come to and the register. */
export function compareFlags(configs: readonly TsConfig[], reg: GuardRegister): GuardProblem[] {
  const out: GuardProblem[] = [];
  const eff = effectiveFlags(configs);
  for (const [path, e] of eff) {
    const want = reg.tsFlags[path];
    const got = flagSummary(e);
    if (want === undefined) out.push({ code: "config-added", key: path, detail: `the configuration has ${got}; the register does not list it` });
    else if (want !== got) out.push({ code: "flags-changed", key: path, detail: `register ${want}; file ${got}` });
  }
  for (const path of Object.keys(reg.tsFlags)) if (!eff.has(path)) out.push({ code: "config-gone", key: path, detail: "the register lists a configuration that is not there" });
  return out.sort(byKey);
}

/** The differences between the suppressions found (counted) and the register. */
export function compareSuppressions(found: readonly SuppressCount[], reg: GuardRegister): GuardProblem[] {
  const out: GuardProblem[] = [];
  const id = (r: { path: string; kind: string; rules: string }): string => `${r.path} ${r.kind}${r.rules === "" ? "" : ` [${r.rules}]`}`;
  const listed = new Map(reg.suppressions.map((r) => [id(r), r]));
  const seen = new Set<string>();
  for (const f of found) {
    const k = id(f);
    seen.add(k);
    const r = listed.get(k);
    if (r === undefined) out.push({ code: "suppress-added", key: k, detail: `${f.count} found; the register does not list it` });
    else if (r.count !== f.count) out.push({ code: "suppress-count-changed", key: k, detail: `register ×${r.count}; found ×${f.count}` });
  }
  for (const [k, r] of listed) if (!seen.has(k)) out.push({ code: "suppress-gone", key: k, detail: `the register lists ×${r.count}; none found` });
  return out.sort(byKey);
}

/** The differences between the lists in the configuration files and the register. */
export function compareLists(facts: readonly ConfigFacts[], reg: GuardRegister): GuardProblem[] {
  const out: GuardProblem[] = [];
  const byPath = new Map(facts.map((f) => [f.path, f]));
  for (const [path, lists] of Object.entries(reg.lists)) {
    const f = byPath.get(path);
    if (f === undefined) {
      out.push({ code: "file-gone", key: path, detail: "the register lists a configuration file that was not read" });
      continue;
    }
    for (const [key, want] of Object.entries(lists)) {
      const got = f.lists[key];
      if (got === undefined) out.push({ code: "list-gone", key: `${path} ${key}`, detail: "the list is not written in the file" });
      else if (JSON.stringify(got) !== JSON.stringify(want)) out.push({ code: "list-changed", key: `${path} ${key}`, detail: `register ${JSON.stringify(want)}; file ${JSON.stringify(got)}` });
    }
    for (const key of Object.keys(f.lists)) if (!(key in lists)) out.push({ code: "list-added", key: `${path} ${key}`, detail: `the file has ${JSON.stringify(f.lists[key])}; the register does not list it` });
  }
  for (const f of facts) if (!(f.path in reg.lists)) out.push({ code: "file-gone", key: f.path, detail: "the file was read but the register has nothing for it" });
  return out.sort(byKey);
}

/** The differences between the package.json files read and the register. */
export function comparePackages(read: readonly string[], reg: GuardRegister): GuardProblem[] {
  const out: GuardProblem[] = [];
  for (const p of read) if (!reg.packages.includes(p)) out.push({ code: "package-added", key: p, detail: "a package.json that the register does not list" });
  for (const p of reg.packages) if (!read.includes(p)) out.push({ code: "package-gone", key: p, detail: "the register lists a package.json that was not read" });
  return out.sort(byKey);
}

/** The differences between the findings and the accepted list. */
export function compareGuardAccepted(findings: readonly GuardFinding[], accepted: readonly GuardAcceptRow[]): GuardProblem[] {
  const counts = new Map<string, number>();
  for (const f of findings) counts.set(`${f.path}\u0000${f.code}`, (counts.get(`${f.path}\u0000${f.code}`) ?? 0) + 1);
  const out: GuardProblem[] = [];
  const listed = new Set<string>();
  for (const a of accepted) {
    const id = `${a.path}\u0000${a.code}`;
    listed.add(id);
    if (!GUARD_ACCEPTABLE.includes(a.code)) out.push({ code: "unacceptable-code", key: `${a.path} ${a.code}`, detail: `${a.code} may not be accepted` });
    const n = counts.get(id) ?? 0;
    if (n === 0) out.push({ code: "accepted-gone", key: `${a.path} ${a.code}`, detail: `accepted ×${a.count} but no longer found; remove it from the list` });
    else if (n !== a.count) out.push({ code: "count-changed", key: `${a.path} ${a.code}`, detail: `accepted ×${a.count}, found ×${n}` });
  }
  for (const [id, n] of counts) {
    if (listed.has(id)) continue;
    const [path, code] = id.split("\u0000") as [string, string];
    out.push({ code: "finding-not-accepted", key: `${path} ${code}`, detail: `${n} finding${n === 1 ? "" : "s"} not on the accepted list` });
  }
  return out.sort(byKey);
}

export const formatGuardProblem = (p: GuardProblem): string => `${p.code} ${p.key}: ${p.detail}`;
export const formatGuardProblems = (ps: readonly GuardProblem[]): string => ps.map(formatGuardProblem).join("\n");

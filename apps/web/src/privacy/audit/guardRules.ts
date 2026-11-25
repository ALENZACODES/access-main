// The rules for the strictness settings read by tsModel.ts, suppressScan.ts, scriptScan.ts and configScan.ts, with one
// finding type for all of them. "No finding" means that none of these rules matched what is written; it does not say the
// code is correct or that every check runs. Node only (tests and CI), never shipped to the browser.

import type { ConfigFinding } from "./configScan";
import { CONFIG_CODES, type ConfigCode } from "./configScan";
import type { ScriptFinding } from "./scriptScan";
import { SCRIPT_CODES, type ScriptCode } from "./scriptScan";
import type { Suppression } from "./suppressScan";
import { effectiveFlags, STRICT_FAMILY, type TsConfig, type TsFlag } from "./tsModel";

export type TsCode = "ts-config-unreadable" | "ts-strict-off" | "ts-strict-flag-off" | "ts-no-unchecked-index" | "ts-flag-unknown";
export type SuppressCode = "suppress-nocheck" | "suppress-ignore" | "suppress-no-reason" | "suppress-blanket" | "suppress-file-wide" | "suppress-any";
export type GuardCode = TsCode | SuppressCode | ScriptCode | ConfigCode;

export const TS_CODES: readonly TsCode[] = ["ts-config-unreadable", "ts-strict-off", "ts-strict-flag-off", "ts-no-unchecked-index", "ts-flag-unknown"];
export const SUPPRESS_CODES: readonly SuppressCode[] = ["suppress-nocheck", "suppress-ignore", "suppress-no-reason", "suppress-blanket", "suppress-file-wide", "suppress-any"];
export const GUARD_CODES: readonly GuardCode[] = [...TS_CODES, ...SUPPRESS_CODES, ...SCRIPT_CODES, ...CONFIG_CODES];

export interface GuardFinding {
  code: GuardCode;
  path: string;
  /** The line in the file, or 0 when the finding is about the whole file or a setting with no line. */
  line: number;
  detail: string;
}

export interface GuardPolicy {
  /** Flags that must come to true for every TypeScript configuration. */
  requiredTrue: readonly TsFlag[];
  /** The fewest characters a reason after a directive may have. */
  minReason: number;
}

export const GUARD_POLICY: GuardPolicy = {
  requiredTrue: ["strict", "noUncheckedIndexedAccess"],
  minReason: 8,
};

const find = (code: GuardCode, path: string, line: number, detail: string): GuardFinding => ({ code, path, line, detail });

/** The findings for a set of TypeScript configurations, which are read together so that `extends` can be followed. */
export function auditTsConfigs(configs: readonly TsConfig[], policy: GuardPolicy = GUARD_POLICY): GuardFinding[] {
  const out: GuardFinding[] = [];
  const eff = effectiveFlags(configs);
  for (const c of configs) {
    if (c.problem !== null) {
      out.push(find("ts-config-unreadable", c.path, 0, `the file cannot be read: ${c.problem.slice(0, 80)}`));
      continue;
    }
    const e = eff.get(c.path);
    if (e === undefined) continue;
    for (const f of policy.requiredTrue) {
      const state = e[f];
      const detail = `${f} is ${state === "absent" ? "not written" : state}`;
      if (state === "unknown") out.push(find("ts-flag-unknown", c.path, c.lines[f] ?? 0, `${detail} (the file it extends is not among the files read, or the value is not true or false)`));
      else if (state !== "true") out.push(find(f === "strict" ? "ts-strict-off" : "ts-no-unchecked-index", c.path, c.lines[f] ?? 0, detail));
    }
    for (const f of STRICT_FAMILY) {
      if (c.flags[f] === "false") out.push(find("ts-strict-flag-off", c.path, c.lines[f] ?? 0, `${f} is false`));
      else if (c.flags[f] === "unknown") out.push(find("ts-flag-unknown", c.path, c.lines[f] ?? 0, `${f} is not true or false`));
    }
  }
  return sort(out);
}

/** The findings for the directives and uses of `any` that the scan found. */
export function auditSuppressions(found: readonly Suppression[], policy: GuardPolicy = GUARD_POLICY): GuardFinding[] {
  const out: GuardFinding[] = [];
  for (const s of found) {
    const short = s.reason === null || s.reason.length < policy.minReason;
    if (s.kind === "any") out.push(find("suppress-any", s.path, s.line, `the type any is used (${s.detail})`));
    else if (s.kind === "ts-nocheck") out.push(find("suppress-nocheck", s.path, s.line, "type checking is switched off for the whole file"));
    else if (s.kind === "ts-ignore") out.push(find("suppress-ignore", s.path, s.line, "ts-ignore hides any error on the next line; expect-error says which one and fails when it is gone"));
    else if (s.kind === "ts-expect-error") {
      if (short) out.push(find("suppress-no-reason", s.path, s.line, "an expect-error directive has no reason"));
    } else {
      if (s.rules.length === 0) out.push(find("suppress-blanket", s.path, s.line, `${s.kind} names no rule, so it switches off every rule`));
      if (s.kind === "eslint-disable") out.push(find("suppress-file-wide", s.path, s.line, `eslint-disable switches off ${s.rules.length === 0 ? "every rule" : s.rules.join(", ")} until the end of the file or an enable`));
      if (short) out.push(find("suppress-no-reason", s.path, s.line, `${s.kind} ${s.rules.join(", ")} has no reason after --`));
    }
  }
  return sort(out);
}

export const fromScripts = (f: readonly ScriptFinding[]): GuardFinding[] => sort(f.map((x) => find(x.code, x.path, 0, x.script === "" ? x.detail : `${x.script}: ${x.detail}`)));
export const fromConfig = (f: readonly ConfigFinding[]): GuardFinding[] => sort(f.map((x) => find(x.code, x.path, x.line, x.detail)));

function sort(f: GuardFinding[]): GuardFinding[] {
  const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  return [...f].sort((a, b) => cmp(a.path, b.path) || a.line - b.line || cmp(a.code, b.code) || cmp(a.detail, b.detail));
}

export const sortFindings = sort;

export function formatGuardFinding(f: GuardFinding): string {
  return `${f.path}${f.line > 0 ? `:${f.line}` : ""} ${f.code}: ${f.detail}`;
}

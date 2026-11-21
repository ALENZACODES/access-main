// Robustness audit for the strictness scanners. Whatever text a file holds, reading it must not throw and every
// line it gives must lie inside the text; adding one directive adds exactly one finding; a directive that is only
// written in a string or described in a comment adds none; a register built from what was read compares clean.

import { describe, expect, it } from "vitest";
import { compareFlags, compareSuppressions } from "./guardCompare";
import type { GuardRegister } from "./guardRegister";
import { auditSuppressions, auditTsConfigs } from "./guardRules";
import { scanConfig } from "./configScan";
import { scanScripts } from "./scriptScan";
import { genJson, genString, mutateText } from "./fuzz/gen";
import { assertProperty, shrinkString } from "./fuzz/property";
import type { Rng } from "./fuzz/rng";
import { countSuppressions, scanSuppressions } from "./suppressScan";
import { effectiveFlags, parseTsConfig } from "./tsModel";
import { flagSummary } from "./guardCompare";

const SEEDS = ["// @ts-expect-error: a reason\nlet a: any;\n", 'const s = "/* x */"; // eslint-disable-line a -- b\n', "export default { test: { include: ['a'], retry: 1 } };", '{ "compilerOptions": { "strict": true } }', "`${ /* c */ x }` /re[/]x/g"];
const text = (rng: Rng): string => (rng.bool() ? mutateText(rng, rng.pick(SEEDS)) : genString(rng, 80));
const lineCount = (s: string): number => s.split("\n").length;

/** Lines that hold no directive, no use of any and nothing a scanner reads. */
function quiet(rng: Rng): string {
  const lines: string[] = [];
  for (let i = rng.int(0, 10); i > 0; i -= 1) {
    const roll = rng.int(0, 3);
    if (roll === 0) lines.push(`const v${i} = ${JSON.stringify(genString(rng, 16).replace(/any|ts-|eslint/g, "x"))};`);
    else if (roll === 1) lines.push(`// see the note on ${rng.pick(["@ts-ignore", "eslint-disable", "a: any"])} here`.replace(/^\/\/ see/, "// see"));
    else if (roll === 2) lines.push(`const s${i} = "// @ts-ignore";`);
    else lines.push(`export const f${i} = (x: number): number => x + ${i};`);
  }
  return lines.join("\n");
}

describe("the readers never fail", () => {
  it("scanSuppressions gives lines inside the text, and does not throw", () =>
    assertProperty({
      name: "lines fit", gen: text, shrink: shrinkString, show: (s) => JSON.stringify(s),
      prop: (s) => {
        for (const f of scanSuppressions([{ path: "a.ts", text: s }])) {
          expect(f.line).toBeGreaterThanOrEqual(1);
          expect(f.line).toBeLessThanOrEqual(lineCount(s));
        }
      },
    }));
  it("scanConfig, scanScripts and parseTsConfig do not throw", () =>
    assertProperty({
      name: "no throw", gen: text, shrink: shrinkString, show: (s) => JSON.stringify(s),
      prop: (s) => {
        for (const f of scanConfig("c.ts", s).findings) expect(f.line).toBeLessThanOrEqual(lineCount(s));
        scanScripts("package.json", s);
        const c = parseTsConfig("t.json", s);
        auditTsConfigs([c]);
        effectiveFlags([c]);
      },
    }));
  it("reads JSON of any shape as a configuration or a package file", () =>
    assertProperty({
      name: "json", gen: (rng) => JSON.stringify(genJson(rng)), shrink: shrinkString, show: (s) => s,
      prop: (s) => {
        scanScripts("package.json", s);
        auditTsConfigs([parseTsConfig("t.json", s)]);
      },
    }));
});

describe("one change makes one finding", () => {
  const SHAPES = ["// @ts-ignore: this line is odd\nx();", "// @ts-nocheck", "// eslint-disable-next-line a -- a good reason here\nx();", "let v: any;", "const w = y as any;"];
  it("adding a directive to quiet code adds exactly one suppression", () =>
    assertProperty({
      name: "one added",
      gen: (rng) => ({ before: quiet(rng), add: rng.pick(SHAPES), at: rng.int(0, 10) }),
      show: (v) => JSON.stringify(v),
      prop: ({ before, add, at }) => {
        const lines = before.split("\n");
        const n = scanSuppressions([{ path: "a.ts", text: before }]).length;
        expect(n).toBe(0);
        lines.splice(Math.min(at, lines.length), 0, add);
        expect(scanSuppressions([{ path: "a.ts", text: lines.join("\n") }])).toHaveLength(1);
      },
    }));
  it("a directive inside a string or a comment that only describes it adds none", () =>
    assertProperty({
      name: "none added", gen: quiet, shrink: shrinkString, show: (s) => JSON.stringify(s),
      prop: (s) => expect(scanSuppressions([{ path: "a.ts", text: s }])).toEqual([]),
    }));
  it("a flagged file gives findings that are the same on a second read", () =>
    assertProperty({
      name: "stable", gen: text, shrink: shrinkString, show: (s) => JSON.stringify(s),
      prop: (s) => {
        const a = auditSuppressions(scanSuppressions([{ path: "a.ts", text: s }]));
        const b = auditSuppressions(scanSuppressions([{ path: "a.ts", text: s }]));
        expect(b).toEqual(a);
      },
    }));
});

describe("a register built from what was read compares clean", () => {
  it("for suppressions and for flags", () =>
    assertProperty({
      name: "self compare", runs: 100,
      gen: (rng) => ({ code: text(rng) + "\n" + rng.pick(SEEDS), cfg: rng.pick(['{ "compilerOptions": { "strict": true } }', '{ "compilerOptions": { "strict": false, "noEmit": true } }', "{}"]) }),
      show: (v) => JSON.stringify(v),
      prop: ({ code, cfg }) => {
        const counts = countSuppressions(scanSuppressions([{ path: "a.ts", text: code }]));
        const tsc = [parseTsConfig("t.json", cfg)];
        const eff = effectiveFlags(tsc).get("t.json");
        expect(eff).toBeDefined();
        const reg: GuardRegister = { tsFlags: { "t.json": flagSummary(eff as never) }, suppressions: counts.map((c) => ({ ...c })), lists: {}, packages: [] };
        expect(compareSuppressions(counts, reg)).toEqual([]);
        expect(compareFlags(tsc, reg)).toEqual([]);
      },
    }));
});

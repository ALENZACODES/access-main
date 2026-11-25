// Robustness audit for the diagnostics scan and the canary helper. Whatever text a file holds, scanning must not
// throw and every line it gives must lie inside the text; adding one console call to quiet code adds exactly one
// site; a thrown template that writes a user-looking name is found whatever else surrounds it; a probe judges every
// thrown value without throwing.

import { describe, expect, it } from "vitest";
import { judge, probe, sweep } from "./dgCanary";
import { namesIn, readTemplate, userLooking } from "./dgInterp";
import { auditSites } from "./dgRules";
import { scanFile } from "./dgScan";
import { genJson, genString, mutateText } from "./fuzz/gen";
import { assertProperty, shrinkString } from "./fuzz/property";
import type { Rng } from "./fuzz/rng";

const PATH = "apps/web/src/fuzz/File.ts";
const SEEDS = ["try { f(); } catch (e) { show(e.message); }", "console.log(`a ${b}`);", "throw new Error(`bad ${query}`);", "window.onerror = null; debugger;", "class A { static getDerivedStateFromError() { return {}; } }", "p.catch((e) => String(e));"];
const text = (rng: Rng): string => (rng.bool() ? mutateText(rng, rng.pick(SEEDS)) : genString(rng, 80));
const lines = (s: string): number => s.split("\n").length;

/** Lines that hold nothing the scan looks for: ordinary code, strings and comments that only mention the words. */
function quiet(rng: Rng): string {
  const out: string[] = [];
  for (let i = rng.int(0, 10); i > 0; i -= 1) {
    const roll = rng.int(0, 3);
    if (roll === 0) out.push(`const v${i} = ${JSON.stringify(genString(rng, 14).replace(/console|debugger|alert|catch|Error|error/g, "x"))};`);
    else if (roll === 1) out.push(`// ${rng.pick(["console.log(1)", "debugger", "alert(1)", "window.onerror"])} is only described here`);
    else if (roll === 2) out.push(`const s${i} = ${JSON.stringify(rng.pick(["console.log(1)", "throw new Error(`x ${query}`)", "e.message"]))};`);
    else out.push(`export const f${i} = (x: number): number => x + ${i};`);
  }
  return out.join("\n");
}

describe("the scan never fails", () => {
  it("gives lines inside the text, a known kind, and does not throw", () =>
    assertProperty({
      name: "lines fit", gen: text, shrink: shrinkString, show: (s) => JSON.stringify(s),
      prop: (s) => {
        for (const site of scanFile({ path: PATH, text: s })) {
          expect(site.line).toBeGreaterThanOrEqual(1);
          expect(site.line).toBeLessThanOrEqual(lines(s));
        }
        auditSites(scanFile({ path: PATH, text: s }));
      },
    }));
  it("gives the same sites twice", () =>
    assertProperty({
      name: "stable", gen: text, shrink: shrinkString, show: (s) => JSON.stringify(s),
      prop: (s) => expect(scanFile({ path: PATH, text: s })).toEqual(scanFile({ path: PATH, text: s })),
    }));
  it("reads templates and names of any text without throwing", () =>
    assertProperty({
      name: "interp", gen: (rng) => genString(rng, 60), shrink: shrinkString, show: (s) => JSON.stringify(s),
      prop: (s) => {
        readTemplate(`\`${s}\``, 0);
        namesIn(s);
        userLooking(s);
      },
    }));
});

describe("one change makes one site", () => {
  const ADD: Array<[string, string]> = [["console.log(1);", "console"], ["debugger;", "debugger"], ["alert('x');", "dialog"], ["window.onerror = null;", "error-hook"], ["throw new Error(`bad ${query}`);", "throw-template"]];
  it("adding a statement to quiet code adds exactly one site, of its kind", () =>
    assertProperty({
      name: "one added",
      gen: (rng) => ({ before: quiet(rng), add: rng.pick(ADD), at: rng.int(0, 10) }),
      show: (v) => JSON.stringify(v),
      prop: ({ before, add, at }) => {
        expect(scanFile({ path: PATH, text: before })).toEqual([]);
        const l = before.split("\n");
        l.splice(Math.min(at, l.length), 0, add[0]);
        const sites = scanFile({ path: PATH, text: l.join("\n") });
        expect(sites.map((s) => s.kind)).toEqual([add[1]]);
      },
    }));
  it("a thrown template that writes a user-looking name is a finding, whatever surrounds it", () =>
    assertProperty({
      name: "user name", gen: (rng) => ({ pre: genString(rng, 10).replace(/[`${}\\]/g, ""), post: genString(rng, 10).replace(/[`${}\\]/g, ""), name: rng.pick(["query", "label", "email", "address", "note"]) }), show: (v) => JSON.stringify(v),
      prop: ({ pre, post, name }) => {
        const f = auditSites(scanFile({ path: PATH, text: `throw new Error(\`${pre} \${${name}} ${post}\`);` }));
        expect(f.map((x) => x.code)).toEqual(["dg-throw-user-name"]);
      },
    }));
  it("a name that does not look like a user value is not a finding", () =>
    assertProperty({
      name: "other name", gen: (rng) => rng.pick(["id", "count", "code", "index", "limit", "path"]), show: (s) => s,
      prop: (name) => expect(auditSites(scanFile({ path: PATH, text: `throw new Error(\`bad \${${name}}\`);` }))).toEqual([]),
    }));
});

describe("the canary helper never fails", () => {
  it("probes and judges any thrown value without throwing", () =>
    assertProperty({
      name: "any thrown", gen: (rng) => genJson(rng), show: (v) => JSON.stringify(v),
      prop: (v) => {
        const o = probe(() => {
          throw v;
        });
        expect(o.threw).toBe(true);
        judge(o);
      },
    }));
  it("finds a leak in any message that holds the canary, at any place in it", () =>
    assertProperty({
      name: "leak found", gen: (rng) => ({ pre: genString(rng, 20), post: genString(rng, 20) }), show: (v) => JSON.stringify(v),
      prop: ({ pre, post }) => expect(probe(() => { throw new Error(`${pre}zq7canary${post}`); }).leaked).toContain("message"),
    }));
  it("finds no leak in a message made of other text", () =>
    assertProperty({
      name: "no leak", gen: (rng) => genString(rng, 40).replace(/zq7canary/gi, ""), shrink: shrinkString, show: (s) => JSON.stringify(s),
      prop: (s) => expect(probe(() => { throw new Error(s); }).leaked).toEqual([]),
    }));
  it("sweeps a function that never throws as clean", () =>
    assertProperty({ name: "clean sweep", gen: (rng) => rng.int(0, 100), show: String, prop: () => expect(sweep(() => 1)).toEqual([]) }));
});

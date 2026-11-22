// Robustness audit for the identifier scan: whatever text a file holds, masking and scanning must not throw, the
// mask keeps the length and the lines, every line a site gives lies inside the text, adding one identifier to quiet
// code adds exactly one site, and a name that only appears in a comment, a string or a regular expression adds none.

import { describe, expect, it } from "vitest";
import { compareIds } from "./idCompare";
import { flowsInFile } from "./idFlow";
import { maskCode } from "./idMask";
import { auditSites } from "./idRules";
import { scanFile } from "./idScan";
import { genString, mutateText } from "./fuzz/gen";
import { assertProperty, shrinkString } from "./fuzz/property";
import type { Rng } from "./fuzz/rng";

const PATH = "apps/web/src/fuzz/File.ts";
const SEEDS = [
  "const id = crypto.randomUUID();",
  "db.put({ id: Math.random() });",
  "const nav = navigator; nav.language;",
  "const k = `a-${Date.now()}`;",
  "c.getRandomValues(new Uint8Array(16));",
  "x = /navigator\\.userAgent/.test(s);",
  "// Math.random() in a comment",
  "const s = 'crypto.randomUUID()';",
];
const text = (rng: Rng): string => (rng.bool() ? mutateText(rng, rng.pick(SEEDS)) : genString(rng, 100));
const show = (s: string): string => JSON.stringify(s);
const linesOf = (s: string): number => s.split("\n").length;

/** Lines that hold no identifier: ordinary code, and comments, strings and expressions that only name the APIs. */
function quiet(rng: Rng): string {
  const out: string[] = [];
  for (let i = rng.int(0, 10); i > 0; i -= 1) {
    const roll = rng.int(0, 4);
    if (roll === 0) out.push(`// ${rng.pick(["Math.random()", "crypto.randomUUID()", "navigator.userAgent", "Date.now()"])} is only described here`);
    else if (roll === 1) out.push(`const s${i} = ${JSON.stringify(rng.pick(["Math.random()", "crypto.randomUUID()", "navigator.hardwareConcurrency"]))};`);
    else if (roll === 2) out.push(`const r${i} = /${rng.pick(["navigator", "Math\\.random", "randomUUID"])}/.test(v${i});`);
    else if (roll === 3) out.push(`/* ${rng.pick(["getRandomValues(", "toDataURL(", "enumerateDevices("])} */`);
    else out.push(`export const f${i} = (x: number): number => x + ${i};`);
  }
  return out.join("\n");
}

describe("the mask never fails", () => {
  it("keeps the length and the line breaks of any text", () =>
    assertProperty({
      name: "shape", gen: text, shrink: shrinkString, show,
      prop: (s) => {
        const m = maskCode(s);
        expect(m).toHaveLength(s.length);
        for (let i = 0; i < s.length; i++) if (s[i] === "\n") expect(m[i]).toBe("\n");
      },
    }));
  it("only blanks: every character is the same, a space, or a line break turned into itself", () =>
    assertProperty({
      name: "blanks", gen: text, shrink: shrinkString, show,
      prop: (s) => {
        const m = maskCode(s);
        for (let i = 0; i < s.length; i++) expect(m[i] === s[i] || m[i] === " ", `${i}`).toBe(true);
      },
    }));
  it("masks twice to the same text as masking once", () =>
    assertProperty({ name: "idempotent", gen: text, shrink: shrinkString, show, prop: (s) => expect(maskCode(maskCode(s))).toBe(maskCode(s)) }));
});

describe("the scan never fails", () => {
  it("gives lines inside the text and a known kind, and does not throw", () =>
    assertProperty({
      name: "lines fit", gen: text, shrink: shrinkString, show,
      prop: (s) => {
        for (const site of scanFile({ path: PATH, text: s })) {
          expect(site.line).toBeGreaterThanOrEqual(1);
          expect(site.line).toBeLessThanOrEqual(linesOf(s));
        }
        auditSites(scanFile({ path: PATH, text: s }));
        flowsInFile({ path: PATH, text: s });
      },
    }));
  it("gives the same sites twice", () =>
    assertProperty({ name: "stable", gen: text, shrink: shrinkString, show, prop: (s) => expect(scanFile({ path: PATH, text: s })).toEqual(scanFile({ path: PATH, text: s })) }));
  it("finds the same in a text and in the same text masked first, since masking is done inside the scan", () =>
    assertProperty({ name: "mask first", gen: text, shrink: shrinkString, show, prop: (s) => expect(scanFile({ path: PATH, text: maskCode(s) })).toEqual(scanFile({ path: PATH, text: s })) }));
});

describe("what the scan finds is what was written", () => {
  it("adds exactly one site for one more identifier in quiet code", () =>
    assertProperty({
      name: "one more", gen: (r) => ({ q: quiet(r), call: r.pick(["crypto.randomUUID()", "Math.random()", "c.getRandomValues(a)"]) }), show: (x) => JSON.stringify(x),
      prop: ({ q, call }) => {
        expect(scanFile({ path: PATH, text: q })).toEqual([]);
        expect(scanFile({ path: PATH, text: `${q}\nconst v = ${call};` })).toHaveLength(1);
      },
    }));
  it("finds the line the identifier was written on", () =>
    assertProperty({
      name: "line", gen: (r) => ({ q: quiet(r) }), show: (x) => JSON.stringify(x),
      prop: ({ q }) => expect(scanFile({ path: PATH, text: `${q}\nconst v = Math.random();` })[0]?.line).toBe(linesOf(q) + 1),
    }));
  it("finds nothing in a file that is not scanned, whatever it holds", () =>
    assertProperty({ name: "not scanned", gen: text, shrink: shrinkString, show, prop: (s) => expect(scanFile({ path: "apps/web/src/x.test.ts", text: s })).toEqual([]) }));
  it("finds a read through an alias of the navigator whatever name is used", () =>
    assertProperty({
      name: "alias", gen: (r) => ({ name: r.pick(["nav", "n", "host_nav", "$n", "_nav2"]), prop: r.pick(["language", "userAgent", "hardwareConcurrency"]) }), show: (x) => JSON.stringify(x),
      prop: ({ name, prop }) => expect(scanFile({ path: PATH, text: `const ${name} = env.navigator;\nconst v = ${name}?.${prop};` })).toHaveLength(1),
    }));
});

describe("a finding is compared with the list the same way every time", () => {
  it("gives no problem when each finding has a row with its own count", () =>
    assertProperty({
      name: "rows match", gen: (r) => r.int(1, 6), show: (n) => String(n),
      prop: (n) => {
        const src = Array.from({ length: n }, (_, i) => `const a${i} = crypto.randomUUID();`).join("\n");
        const f = auditSites(scanFile({ path: PATH, text: src }));
        expect(compareIds(f, [{ path: PATH, code: "id-uuid", count: n, reason: "A reason that says what was read." }])).toEqual([]);
        expect(compareIds(f, [{ path: PATH, code: "id-uuid", count: n + 1, reason: "A reason that says what was read." }]).map((p) => p.code)).toEqual(["count-changed"]);
      },
    }));
});

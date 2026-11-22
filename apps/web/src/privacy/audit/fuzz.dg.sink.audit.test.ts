// Robustness audit for the markup-write scan: whatever text a file holds it does not throw, its lines lie inside the
// text, one more assignment adds exactly one write, and a comment line or a file it does not scan adds none.

import { describe, expect, it } from "vitest";
import { classifyValue, riskySinks, scanSinks, withoutCommentLines } from "./dgSink";
import { genString, mutateText } from "./fuzz/gen";
import { assertProperty, shrinkString } from "./fuzz/property";
import type { Rng } from "./fuzz/rng";

const PATH = "apps/web/src/fuzz/File.ts";
const SEEDS = ["el.innerHTML = render(a);", "x.innerHTML += `<p>${v}</p>`;", "<div dangerouslySetInnerHTML={{ __html: h }} />", "document.write(h);", "a.innerHTML = '';", "// el.innerHTML = x"];
const text = (rng: Rng): string => (rng.bool() ? mutateText(rng, rng.pick(SEEDS)) : genString(rng, 90));
const show = (s: string): string => JSON.stringify(s);

describe("the sink scan never fails", () => {
  it("gives lines inside the text and does not throw", () =>
    assertProperty({
      name: "lines fit", gen: text, shrink: shrinkString, show,
      prop: (s) => {
        for (const x of scanSinks([{ path: PATH, text: s }])) {
          expect(x.line).toBeGreaterThanOrEqual(1);
          expect(x.line).toBeLessThanOrEqual(s.split("\n").length);
        }
      },
    }));
  it("gives the same writes twice", () =>
    assertProperty({ name: "stable", gen: text, shrink: shrinkString, show, prop: (s) => expect(scanSinks([{ path: PATH, text: s }])).toEqual(scanSinks([{ path: PATH, text: s }])) }));
  it("keeps the number of lines when it empties the comment lines", () =>
    assertProperty({ name: "lines kept", gen: text, shrink: shrinkString, show, prop: (s) => expect(withoutCommentLines(s).split("\n")).toHaveLength(s.split("\n").length) }));
  it("reads any right side without throwing, and gives a known value", () =>
    assertProperty({ name: "classify", gen: (r) => genString(r, 40), shrink: shrinkString, show, prop: (s) => expect(["empty", "call", "template", "other", "none"]).toContain(classifyValue(s).value) }));
});

describe("one more assignment adds one write", () => {
  it("adds exactly one write to quiet code", () =>
    assertProperty({
      name: "one more", gen: (r) => ({ n: r.int(0, 6), v: r.pick(["f(a)", "`x`", "opts.v", "g.h(1)"]) }), show: (x) => JSON.stringify(x),
      prop: ({ n, v }) => {
        const quiet = Array.from({ length: n }, (_, i) => `export const k${i} = ${i};`).join("\n");
        const base = scanSinks([{ path: PATH, text: quiet }]).length;
        expect(scanSinks([{ path: PATH, text: `${quiet}\nel.innerHTML = ${v};` }])).toHaveLength(base + 1);
      },
    }));
  it("adds none when the line is a comment or the file is a test", () =>
    assertProperty({
      name: "no write", gen: (r) => r.pick(["// el.innerHTML = f();", " * el.innerHTML = f();", "/* document.write(x) */"]), show,
      prop: (line) => {
        expect(scanSinks([{ path: PATH, text: line }])).toEqual([]);
        expect(scanSinks([{ path: "apps/web/src/x.test.ts", text: "el.innerHTML = f();" }])).toEqual([]);
      },
    }));
  it("does not count a write that empties an element as risky", () =>
    assertProperty({ name: "empty", gen: (r) => r.pick(['""', "''", ' ""', "'' "]), show, prop: (v) => expect(riskySinks(scanSinks([{ path: PATH, text: `el.innerHTML = ${v};` }]))).toEqual([]) }));
});

// Robustness audit for the source scanner behind the register of links that open another app. Whatever text a file
// holds, scanning must not throw; adding a link to a file must add exactly one place; and a link that is only
// mentioned in a comment must add none.

import { describe, expect, it } from "vitest";
import { compareHandoffs, scanHandoffs } from "./handoffScan";
import { genString, mutateText } from "./fuzz/gen";
import { assertProperty, shrinkString } from "./fuzz/property";
import type { Rng } from "./fuzz/rng";

const PATH = "apps/web/src/fuzz/File.ts";
const LINKS = ['"mailto:?subject=x"', "`tel:${n}`", "'sms:1234'", '"geo:1,2"', "window.open(u)", "location.assign(u)"];
const SCHEME_OF = (link: string): string => (link.startsWith("window") || link.startsWith("location") ? "navigation" : link.replace(/^["'`]/, "").split(":")[0] ?? "");

/** Source text that holds no link: ordinary lines, awkward strings, and lines that only mention one. */
function quietSource(rng: Rng): string {
  const lines: string[] = [];
  for (let i = rng.int(0, 12); i > 0; i -= 1) {
    const roll = rng.int(0, 3);
    if (roll === 0) lines.push(`const v${i} = ${JSON.stringify(genString(rng, 20).replace(/(mailto|tel|sms|geo|webcal|maps|intent|whatsapp|facetime):/gi, "x"))};`);
    else if (roll === 1) lines.push(`// see ${rng.pick(["mailto:", "tel:", "geo:"])} in the docs`);
    else if (roll === 2) lines.push(` * a ${rng.pick(["window.open(", "location.assign("])} call is described here`);
    else lines.push(`export const f${i} = (x: number): number => x + ${i};`);
  }
  return lines.join("\n");
}

describe("scanning any text", () => {
  it("never throws", () => {
    assertProperty({
      name: "scanHandoffs on any text",
      runs: 400,
      gen: (rng) => (rng.bool(0.5) ? genString(rng, 200) : mutateText(rng, `${quietSource(rng)}\n${rng.pick(LINKS)}`)),
      shrink: shrinkString,
      prop: (text) => {
        const found = scanHandoffs([{ path: PATH, text }]);
        for (const f of found) {
          expect(f.lines.length).toBeGreaterThan(0);
          for (const line of f.lines) expect(line).toBeGreaterThanOrEqual(1);
        }
      },
    });
  });
});

describe("adding to a file", () => {
  it("finds nothing in source that only mentions a link", () => {
    assertProperty({ name: "quiet source has no hand-off", gen: quietSource, shrink: shrinkString, prop: (text) => expect(scanHandoffs([{ path: PATH, text }])).toEqual([]) });
  });
  it("finds exactly one more place for each link added, on the line it was added", () => {
    assertProperty({
      name: "one link, one place",
      runs: 300,
      gen: (rng) => ({ text: quietSource(rng), link: rng.pick(LINKS) }),
      prop: ({ text, link }) => {
        const body = text === "" ? "" : `${text}\n`;
        const found = scanHandoffs([{ path: PATH, text: `${body}const x = ${link};` }]);
        expect(found).toHaveLength(1);
        expect(found[0]?.scheme).toBe(SCHEME_OF(link));
        expect(found[0]?.lines).toEqual([body.split("\n").length]);
      },
    });
  });
  it("is clean against a row that says the same, and not against a row that says one more", () => {
    assertProperty({
      name: "count agrees with the row",
      gen: (rng) => ({ n: rng.int(1, 5), link: rng.pick(LINKS) }),
      prop: ({ n, link }) => {
        const text = Array.from({ length: n }, (_, i) => `const a${i} = ${link};`).join("\n");
        const found = scanHandoffs([{ path: PATH, text }]);
        const row = (uses: number) => [{ scheme: SCHEME_OF(link) as never, path: PATH, uses, opens: { en: "a", fr: "a" }, carries: { en: "a", fr: "a" }, source: "s", recordedOn: "2026-11-20" }];
        expect(compareHandoffs(found, row(n))).toEqual({ unlisted: [], gone: [], wrongCount: [] });
        expect(compareHandoffs(found, row(n + 1)).wrongCount).toHaveLength(1);
      },
    });
  });
});

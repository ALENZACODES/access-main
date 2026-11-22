// Robustness audit of the reader of source text and the reader of written times. Whatever text they are given they
// must not throw; the masker keeps the length and the line breaks; a call written in a known way is found exactly
// once; code that has been masked finds nothing in a comment or a string; and a time written by a known function is
// read back with the precision and the zone that the function gives it.

import { describe, expect, it } from "vitest";
import { genString, mutateText } from "./fuzz/gen";
import { assertProperty, shrinkString } from "./fuzz/property";
import type { Rng } from "./fuzz/rng";
import { findTimes, finestPrecision } from "./tmText";
import { maskCode } from "./tmMask";
import { scanTimeFile } from "./tmScan";
import { extractFunctions, normaliseSource } from "./tmCopies";

const SAMPLES = [
  "const a = Date.now();",
  "const id = `k-${Date.now()}-${n}`;",
  "return new Date().toISOString().slice(0, 10);",
  "function localDate(d: Date): string {\n  const p = (n: number): string => String(n).padStart(2, '0');\n  return `${d.getFullYear()}-${p(d.getMonth() + 1)}`;\n}",
  "<p>don't stop</p>\n{performance.now()}",
  "const r = /Date\\.now\\(\\)/g; // new Date()\nconst s = 'x';",
  "x.replace(/[/]/g, '-'); new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' });",
];

const text = (rng: Rng): string => mutateText(rng, rng.pick(SAMPLES));

describe("the masker", () => {
  it("never throws, keeps the length and keeps every line break in place", () =>
    assertProperty({
      name: "mask shape",
      runs: 500,
      gen: text,
      shrink: shrinkString,
      prop: (t) => {
        const m = maskCode(t);
        expect(m.length).toBe(t.length);
        for (let i = 0; i < t.length; i++) if (t[i] === "\n") expect(m[i]).toBe("\n");
      },
    }));
  it("only blanks: every character is the same or a space", () =>
    assertProperty({
      name: "mask only blanks",
      runs: 500,
      gen: text,
      shrink: shrinkString,
      prop: (t) => {
        const m = maskCode(t);
        for (let i = 0; i < t.length; i++) expect(m[i] === t[i] || m[i] === " ", `at ${i}`).toBe(true);
      },
    }));
  it("never brings code back: masking a masked text only blanks more", () =>
    assertProperty({
      name: "mask twice",
      runs: 300,
      gen: text,
      shrink: shrinkString,
      prop: (t) => {
        const once = maskCode(t);
        const twice = maskCode(once);
        for (let i = 0; i < t.length; i++) if (twice[i] !== " ") expect(twice[i], `at ${i}`).toBe(once[i]);
      },
    }));
  it("finds nothing in a comment or a quoted string made from any text without a line break, a quote or a star", () =>
    assertProperty({
      name: "comment and string hide a call",
      runs: 300,
      gen: (rng) => genString(rng, 20).replace(/[\n\r"'`\\*/]/g, "x"),
      prop: (filler) => {
        expect(scanTimeFile({ path: "apps/web/src/a.ts", text: `// ${filler} Date.now()\n` })).toEqual([]);
        expect(scanTimeFile({ path: "apps/web/src/a.ts", text: `const s = "${filler} Date.now()";\n` })).toEqual([]);
        expect(scanTimeFile({ path: "apps/web/src/a.ts", text: `/* ${filler}\nDate.now() */\n` })).toEqual([]);
      },
    }));
});

describe("the scanner", () => {
  it("never throws, and gives lines inside the file and kinds that exist", () =>
    assertProperty({
      name: "scan shape",
      runs: 500,
      gen: text,
      shrink: shrinkString,
      prop: (t) => {
        const lines = t.split("\n").length;
        for (const s of scanTimeFile({ path: "apps/web/src/a.ts", text: t })) {
          expect(s.line).toBeGreaterThanOrEqual(1);
          expect(s.line).toBeLessThanOrEqual(lines);
          expect(s.detail.length).toBeLessThanOrEqual(60);
          expect(s.detail).not.toContain("\n");
        }
      },
    }));
  it("finds a call written in a known way once, after any code that does not open a comment or a string", () =>
    assertProperty({
      name: "a known call is found once",
      runs: 300,
      gen: (rng) => `${genString(rng, 16).replace(/[\n\r"'`\\/*{}$]/g, " ")};\nconst t = Date.now();\n`,
      prop: (t) => expect(scanTimeFile({ path: "apps/web/src/a.ts", text: t }).filter((s) => s.kind === "clock-ms")).toHaveLength(1),
    }));
  it("does not depend on how a call is spaced", () =>
    assertProperty({
      name: "spacing",
      runs: 200,
      gen: (rng) => ` `.repeat(rng.int(0, 4)),
      prop: (sp) => expect(scanTimeFile({ path: "apps/web/src/a.ts", text: `Date${sp}.${sp}now${sp}(${sp})` }).map((s) => s.kind)).toEqual(["clock-ms"]),
    }));
});

describe("the reader of written times", () => {
  it("never throws, and gives mentions inside the text with a precision and a zone that exist", () =>
    assertProperty({
      name: "findTimes shape",
      runs: 500,
      gen: (rng) => mutateText(rng, rng.pick(["2026-11-21T14:05:09.123Z", "at 2026-11-21 14:05", "the-app-data-2026-11-21.json", "t=1795000000000", "2026-11-21T10:00:00+05:30"])),
      shrink: shrinkString,
      prop: (t) => {
        for (const m of findTimes(t)) {
          expect(t.slice(m.index, m.index + m.text.length)).toBe(m.text);
          expect(["millisecond", "second", "minute", "date"]).toContain(m.precision);
          expect(["utc", "offset", "none"]).toContain(m.zone);
        }
      },
    }));
  it("reads back what toISOString writes, to the millisecond and in UTC, for any moment from 2001 to 2100", () =>
    assertProperty({
      name: "round trip",
      runs: 500,
      gen: (rng) => new Date(978_307_200_000 + Math.floor(rng.next() * (4_102_444_800_000 - 978_307_200_000 - 1))).getTime(),
      prop: (ms) => {
        const iso = new Date(ms).toISOString();
        const found = findTimes(`x ${iso} y`);
        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({ text: iso, precision: "millisecond", zone: "utc" });
        expect(finestPrecision(found)).toBe("millisecond");
      },
    }));
});

describe("the reader of functions", () => {
  it("takes out a declaration whatever comes before and after it, and its text normalises the same", () =>
    assertProperty({
      name: "extract",
      runs: 300,
      gen: (rng) => ({ before: genString(rng, 12).replace(/[{}()`'"/*\\$]/g, " "), after: genString(rng, 12).replace(/[{}()`'"/*\\$]/g, " ") }),
      prop: ({ before, after }) => {
        const body = "function f(d: Date): string {\n  return String(d.getFullYear());\n}";
        const got = extractFunctions({ path: "a.ts", text: `${before};\n${body}\n${after}` }, "f");
        expect(got).toHaveLength(1);
        expect(normaliseSource(got[0]?.source ?? "")).toBe(normaliseSource(body));
      },
    }));
});

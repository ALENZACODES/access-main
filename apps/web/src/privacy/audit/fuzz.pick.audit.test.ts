// Robustness audit for the file-you-choose scanner, the size-check finders, the register checks and the downloads.
// Whatever text a source file holds, scanning it must not throw and must give kinds from the closed list at lines
// inside the file; a call written in a known way must be found, once, in the right kind; a comparison of a scan with a
// register built from it is clean; and a register of any shape must be judged and exported without throwing.

import { describe, expect, it } from "vitest";
import { PICK_ACCEPTS, PICK_KINDS, PICK_LIMITS, validatePick, type PickRow } from "../panel/pickRegister";
import { picksAsCsv, picksAsText, renderPickHtml } from "../panel/pickSection";
import { comparePicks, formatPickComparison, isCleanPick, readLines, scanPicks, sizeCheckLines, type FoundPick } from "./pickScan";
import { genString, mutateText } from "./fuzz/gen";
import { assertProperty, shrinkString } from "./fuzz/property";
import type { Rng } from "./fuzz/rng";

const SAMPLES = [
  'const f = event.currentTarget.files?.[0];\nif (!f) return;\nif (f.size > MAX) { setIssue("too-large"); return; }\nconst raw = await f.text();',
  "const list = Array.from(event.target.files ?? []);",
  "const reader = new FileReader();\nreader.onload = () => done(String(reader.result));\nreader.readAsText(file);",
  '<input type="file" accept=".csv,text/csv" onChange={pick} />',
  "const res = await fetch(url, { headers });",
  "// input.files?.[0]",
];

const WRITTEN: ReadonlyArray<[string, "pick" | "reader"]> = [
  ["a.files?.[0];", "pick"],
  ["a.files[0];", "pick"],
  ["a.b.files?.item(0);", "pick"],
  ["Array.from(e.target.files ?? []);", "pick"],
  ["new FileReader();", "reader"],
];

const NOT_CALLS = ["const files = [];", "input.files.length", "x.profiles?.[0]", "type T = FileReader;", "makeFileReader();", "// new FileReader()", "reader.files"];

/** Text that cannot make a call by itself: no brackets, quotes, braces or the words the scan looks for. */
function noise(rng: Rng): string {
  return genString(rng, 40)
    .replace(/[<>`"'{}()[\]]/g, " ")
    .replace(/files|FileReader|\.size|text|arrayBuffer|readAs/g, " ");
}

describe("scanning any text", () => {
  it("never throws, and gives kinds from the list at lines inside the file, in order within a kind", () => {
    assertProperty({
      name: "scanPicks on mutated source",
      runs: 400,
      gen: (rng) => (rng.bool(0.3) ? genString(rng, 200) : mutateText(rng, mutateText(rng, rng.pick(SAMPLES)))),
      shrink: shrinkString,
      prop: (text) => {
        const found = scanPicks([{ path: "apps/web/src/pages/x.tsx", text }]);
        const lines = text.split("\n").length;
        for (const f of found) {
          expect(PICK_KINDS).toContain(f.kind);
          expect(f.lines.length).toBeGreaterThan(0);
          for (const line of f.lines) {
            expect(line).toBeGreaterThanOrEqual(1);
            expect(line).toBeLessThanOrEqual(lines);
          }
          expect(f.lines).toEqual([...f.lines].sort((a, b) => a - b));
        }
      },
    });
  });

  it("finds each size comparison and read at a line inside the file", () => {
    assertProperty({
      name: "sizeCheckLines and readLines",
      runs: 300,
      gen: (rng) => mutateText(rng, rng.pick(SAMPLES)),
      shrink: shrinkString,
      prop: (text) => {
        const lines = text.split("\n").length;
        for (const l of [...sizeCheckLines(text), ...readLines(text)]) {
          expect(l).toBeGreaterThanOrEqual(1);
          expect(l).toBeLessThanOrEqual(lines);
        }
        expect(sizeCheckLines(text)).toEqual([...sizeCheckLines(text)].sort((a, b) => a - b));
      },
    });
  });

  it("finds a call written in a known way exactly once, in the right kind, however it is surrounded", () => {
    assertProperty({
      name: "known calls",
      runs: 300,
      gen: (rng) => ({ call: rng.pick(WRITTEN), before: noise(rng), after: noise(rng), newline: rng.bool(0.5) }),
      prop: ({ call: [code, kind], before, after, newline }) => {
        const text = `${before}${newline ? "\n" : " "}${code}${newline ? "\n" : " "}${after}`;
        const got = scanPicks([{ path: "apps/web/src/input/x.tsx", text }]).map((f) => [f.kind, f.lines.length] as const);
        expect(got).toEqual([[kind, 1]]);
      },
    });
  });

  it("finds nothing in text that only looks like a call, and nothing in a file the scan skips", () => {
    assertProperty({
      name: "not calls",
      runs: 200,
      gen: (rng) => `${noise(rng)}\n${rng.pick(NOT_CALLS)}\n${noise(rng)}`,
      shrink: shrinkString,
      prop: (text) => expect(scanPicks([{ path: "apps/web/src/input/x.tsx", text }])).toEqual([]),
    });
    assertProperty({
      name: "skipped files",
      runs: 100,
      gen: (rng) => rng.pick(["apps/web/src/a/x.test.tsx", "apps/web/src/a/x.d.ts", "apps/web/src/privacy/audit/y.ts", "apps/web/src/narrow/z.ts", "apps/web/src/e2e/w.ts"]),
      prop: (path) => expect(scanPicks([{ path, text: "i.files?.[0]; new FileReader();" }])).toEqual([]),
    });
  });

  it("gives the same lines for a call wherever the file is, and the same result in any order of files", () => {
    assertProperty({
      name: "location and order",
      runs: 200,
      gen: (rng) => ({ text: `${noise(rng)}\n${rng.pick(WRITTEN)[0]}\n${noise(rng)}`, a: rng.int(0, 9), b: rng.int(0, 9) }),
      prop: ({ text, a, b }) => {
        const one = scanPicks([{ path: `apps/web/src/a${a}/f.tsx`, text }]).map((f) => [f.kind, f.lines]);
        const two = scanPicks([{ path: `apps/web/src/z${b}/g.ts`, text }]).map((f) => [f.kind, f.lines]);
        expect(one).toEqual(two);
        const files = [
          { path: "apps/web/src/m.ts", text },
          { path: "apps/web/src/b.ts", text },
        ];
        expect(scanPicks(files)).toEqual(scanPicks([...files].reverse()));
      },
    });
  });
});

describe("comparing a scan with a register built from it", () => {
  const rowFor = (f: FoundPick): PickRow => ({ kind: f.kind, path: f.path, uses: f.lines.length, reads: { en: "a b c", fr: "a b c" }, accepts: f.kind === "pick" ? ["json"] : [], limit: f.kind === "pick" ? "before-read" : "not-applicable", source: "s", recordedOn: "2026-11-21" });

  it("is clean, and breaks the moment the rows or the source change", () => {
    assertProperty({
      name: "compare built from the scan",
      runs: 200,
      gen: (rng) => Array.from({ length: rng.int(1, 6) }, (_, i) => ({ path: `apps/web/src/p/f${i}.tsx`, text: `${noise(rng)}\n${rng.pick(WRITTEN)[0]}\n${rng.pick(WRITTEN)[0]}` })),
      prop: (files) => {
        const found = scanPicks(files);
        const rows = found.map(rowFor);
        expect(validatePick(rows)).toEqual([]);
        expect(isCleanPick(comparePicks(found, rows))).toBe(true);
        expect(formatPickComparison(comparePicks(found, rows))).toBe("");
        if (rows.length > 0) {
          expect(isCleanPick(comparePicks(found, rows.map((r, i) => (i === 0 ? { ...r, uses: r.uses + 1 } : r))))).toBe(false);
          expect(isCleanPick(comparePicks(found, rows.slice(1)))).toBe(false);
          expect(isCleanPick(comparePicks(found.slice(1), rows))).toBe(false);
        }
      },
    });
  });
});

describe("a register of any shape", () => {
  const genRow = (rng: Rng, i: number): PickRow => {
    const kind = rng.pick(PICK_KINDS);
    const limit = rng.pick(PICK_LIMITS);
    return {
      kind,
      path: rng.bool(0.8) ? `apps/web/src/p/f${i}.tsx` : genString(rng, 20),
      uses: rng.pick([0, 1, 2, 3, -1, 1.5]),
      reads: { en: rng.bool(0.8) ? genString(rng, 20) || "x" : "", fr: genString(rng, 20) },
      accepts: Array.from({ length: rng.int(0, 3) }, () => rng.pick(PICK_ACCEPTS)),
      limit,
      ...(rng.bool(0.3) ? { checkedIn: genString(rng, 20) } : {}),
      source: rng.bool(0.9) ? "s" : "",
      recordedOn: rng.bool(0.8) ? "2026-11-21" : genString(rng, 10),
    };
  };

  it("is judged without throwing, in a stable order, and the same whatever order it comes in", () => {
    assertProperty({
      name: "validatePick",
      runs: 300,
      gen: (rng) => Array.from({ length: rng.int(0, 8) }, (_, i) => genRow(rng, i)),
      prop: (rows) => {
        const a = validatePick(rows);
        expect(validatePick(rows)).toEqual(a);
        expect(validatePick([...rows].reverse())).toEqual(a);
      },
    });
  });

  it("is exported and shown without throwing, one line per row, in both languages", () => {
    assertProperty({
      name: "exports",
      runs: 200,
      gen: (rng) => ({ rows: Array.from({ length: rng.int(0, 6) }, (_, i) => genRow(rng, i)), month: rng.int(0, 11), day: rng.int(1, 28) }),
      prop: ({ rows, month, day }) => {
        const now = new Date(2026, month, day, 9, 0, 0);
        for (const locale of ["en", "fr"] as const) {
          const csv = picksAsCsv(locale, rows, now);
          const text = picksAsText(locale, rows, now);
          expect(csv.count).toBe(rows.length);
          expect(text.count).toBe(rows.length);
          expect(csv.filename).toMatch(/-\d{4}-\d{2}-\d{2}\.csv$/);
          expect(text.filename).toMatch(/-\d{4}-\d{2}-\d{2}\.txt$/);
          expect(typeof renderPickHtml(locale, rows)).toBe("string");
        }
      },
    });
  });

  it("never lets a cell run as a formula, whatever the text is", () => {
    assertProperty({
      name: "csv formulas",
      runs: 200,
      gen: (rng) => `${rng.pick(["=", "+", "-", "@", "\t", "\r"])}${genString(rng, 20)}`,
      shrink: shrinkString,
      prop: (cell) => {
        const row: PickRow = { kind: "pick", path: "apps/web/src/p/a.tsx", uses: 1, reads: { en: cell, fr: cell }, accepts: ["json"], limit: "before-read", source: "s", recordedOn: "2026-11-21" };
        const body = picksAsCsv("en", [row], new Date(2026, 10, 21)).text.split("\r\n").slice(1).join("\r\n");
        expect(body).not.toMatch(/(?:^|,)"?[=+\-@\t\r]/);
      },
    });
  });

  it("escapes the markup in any text on screen", () => {
    assertProperty({
      name: "html escaping",
      runs: 200,
      gen: (rng) => genString(rng, 30),
      shrink: shrinkString,
      prop: (text) => {
        const row: PickRow = { kind: "pick", path: "apps/web/src/p/a.tsx", uses: 1, reads: { en: `<${text}>`, fr: `<${text}>` }, accepts: ["json"], limit: "before-read", source: "s", recordedOn: "2026-11-21" };
        const html = renderPickHtml("en", [row]);
        const cell = html.slice(html.indexOf('data-label="What you give"'), html.indexOf("</span>", html.indexOf('data-label="What you give"')));
        expect(cell.slice(cell.indexOf(">") + 1)).not.toMatch(/[<>]/);
      },
    });
  });
});

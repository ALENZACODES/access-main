// Robustness audit for the downloads register's scanner, the look at the browser and the downloads of the list.
// Whatever text a file holds, scanning must not throw; adding a call adds exactly one place; a call only mentioned in
// a comment adds none. Whatever a browser answers, reading must not throw and must keep only a plain yes or no.
// Whatever the rows hold, the downloads must not throw and must hold one block per row.

import { describe, expect, it } from "vitest";
import { SAVE_QUESTIONS, answeredSave, checkSave, readSave, saveAnswerText, saveCheck, saveHost, saveSummary, type SaveEnv, type SaveHost } from "../panel/saveLive";
import { SAVE_KINDS, SAVE_REGISTER, validateSave, type SaveRow } from "../panel/saveRegister";
import { renderSaveHtml, saveAsCsv, saveAsText } from "../panel/saveSection";
import { genString, mutateText } from "./fuzz/gen";
import { assertProperty } from "./fuzz/property";
import { shrinkString } from "./fuzz/property";
import type { Rng } from "./fuzz/rng";
import { compareSave, isCleanSave, kindOfFormats, namedFormats, scanSave } from "./saveScan";

const PATH = "apps/web/src/fuzz/File.ts";
const CALLS = ["URL.createObjectURL(b)", "window.URL.createObjectURL(new Blob([x]))", "view.URL.createObjectURL (blob)", "URL.createObjectURL(\n  b)"];
const FORMATS = ['"application/json"', "'text/plain;charset=utf-8'", '"text/csv"', "format === 'txt'"];

function quietSource(rng: Rng): string {
  const lines: string[] = [];
  for (let i = rng.int(0, 12); i > 0; i -= 1) {
    const roll = rng.int(0, 3);
    if (roll === 0) lines.push(`const v${i} = ${JSON.stringify(genString(rng, 20).replace(/createObjectURL/g, "x"))};`);
    else if (roll === 1) lines.push(`// ${rng.pick(CALLS)} makes the file`);
    else if (roll === 2) lines.push(` * ${rng.pick(CALLS)} is described here`);
    else lines.push(`export const f${i} = (x: number): number => x + ${i};`);
  }
  return lines.join("\n");
}

describe("scanning any text", () => {
  it("never throws, and every place has a line of 1 or more", () => {
    assertProperty({
      name: "scanSave on any text",
      runs: 400,
      gen: (rng) => (rng.bool(0.5) ? genString(rng, 200) : mutateText(rng, `${quietSource(rng)}\n${rng.pick(CALLS)}`)),
      shrink: shrinkString,
      prop: (text) => {
        for (const f of scanSave([{ path: PATH, text }])) {
          expect(f.lines.length).toBeGreaterThan(0);
          for (const line of f.lines) expect(line).toBeGreaterThanOrEqual(1);
        }
      },
    });
  });

  it("finds nothing in source that only mentions a call", () => {
    assertProperty({ name: "quiet source has no place", gen: quietSource, shrink: shrinkString, prop: (text) => expect(scanSave([{ path: PATH, text }])).toEqual([]) });
  });

  it("finds exactly one more place for each call added, on the line it was added", () => {
    assertProperty({
      name: "one call, one place",
      runs: 300,
      gen: (rng) => ({ text: quietSource(rng), call: rng.pick(CALLS) }),
      prop: ({ text, call }) => {
        const body = text === "" ? "" : `${text}\n`;
        const found = scanSave([{ path: PATH, text: `${body}const x = ${call};` }]);
        expect(found).toHaveLength(1);
        expect(found[0]?.lines).toEqual([body.split("\n").length]);
      },
    });
  });

  it("gives the format a file names whatever order the names come in, and only from code", () => {
    assertProperty({
      name: "format kind",
      gen: (rng) => ({ names: FORMATS.filter(() => rng.bool(0.5)), hidden: rng.pick(FORMATS) }),
      prop: ({ names, hidden }) => {
        const text = `${names.map((n) => `const a = ${n};`).join("\n")}\n// ${hidden}`;
        const f = namedFormats(text);
        const again = namedFormats(`${[...names].reverse().map((n) => `const a = ${n};`).join("\n")}\n// ${hidden}`);
        expect(f).toEqual(again);
        expect(f.json).toBe(names.some((n) => n.includes("json")));
        expect(f.csv).toBe(names.some((n) => n.includes("csv")));
        expect(["json", "text", "csv", "json-and-text", "mixed", "none"]).toContain(kindOfFormats(f));
      },
    });
  });

  it("is the same twice, and does not depend on the order of the files", () => {
    assertProperty({
      name: "scan is deterministic",
      gen: (rng) => [0, 1, 2].map((i) => ({ path: `apps/web/src/f${i}.ts`, text: `${quietSource(rng)}\n${rng.pick(CALLS)}` })),
      prop: (files) => {
        expect(scanSave(files)).toEqual(scanSave(files));
        expect(scanSave([...files].reverse())).toEqual(scanSave(files));
      },
    });
  });

  it("is clean against itself: rows built from what was found match it", () => {
    assertProperty({
      name: "rows from a scan compare clean",
      gen: (rng) => ({ path: PATH, text: [...Array.from({ length: rng.int(0, 4) }, () => rng.pick(CALLS)), ...FORMATS.filter(() => rng.bool(0.4)).map((f) => `const t = ${f};`)].join(";\n") }),
      prop: (file) => {
        const found = scanSave([file]);
        const rows: SaveRow[] = found.map((f) => ({ kind: f.kind, path: f.path, uses: f.lines.length, makes: { en: "a", fr: "b" }, source: "s", recordedOn: "2026-11-21" }));
        expect(isCleanSave(compareSave(found, rows))).toBe(true);
      },
    });
  });

  it("does not stall on a very long line", () => {
    const start = Date.now();
    expect(() => scanSave([{ path: PATH, text: `URL.${"x".repeat(20000)}\nURL.createObjectURL${" ".repeat(20000)}(${"(".repeat(5000)}` }])).not.toThrow();
    expect(Date.now() - start).toBeLessThan(2000);
  });
});

const ODD: readonly unknown[] = [undefined, null, 0, 1, -1, Number.NaN, "", "true", "no", {}, [], () => true, Symbol("s"), true, false];

function oddHost(rng: Rng): SaveHost {
  const maybe = <T>(v: T): T | undefined => (rng.bool(0.2) ? undefined : v);
  const one = (): (() => unknown) => (rng.bool(0.15) ? () => { throw new Error("no"); } : () => rng.pick(ODD));
  return { blob: maybe(one()), address: maybe(one()), attribute: maybe(one()) };
}

describe("looking at any browser", () => {
  it("never throws, and keeps only a plain yes or no", () => {
    assertProperty({
      name: "readSave on any host",
      runs: 400,
      gen: oddHost,
      prop: (host) => {
        const r = readSave(host);
        for (const q of SAVE_QUESTIONS) expect(r[q] === null || typeof r[q] === "boolean").toBe(true);
        expect(answeredSave(r).length).toBeLessThanOrEqual(SAVE_QUESTIONS.length);
      },
    });
  });

  it("says the same twice, and every finding and answer is plain text in both languages", () => {
    assertProperty({
      name: "check is deterministic",
      runs: 200,
      gen: oddHost,
      prop: (host) => {
        const r = readSave(host);
        expect(checkSave(r)).toEqual(checkSave(r));
        const view = saveCheck(r);
        expect(view.answered).toBe(answeredSave(r).length);
        expect(view.findings.length).toBeGreaterThanOrEqual(SAVE_QUESTIONS.length - view.answered);
        for (const l of ["en", "fr"] as const) {
          for (const q of SAVE_QUESTIONS) expect(saveAnswerText(l, q, r)).toMatch(/^(?:Yes|No|Unknown|Oui|Non|Inconnu)$/);
          expect(saveSummary(l, view.answered)).not.toMatch(/undefined|NaN/);
        }
      },
    });
  });

  it("never makes a file or an address, however odd the browser is", () => {
    assertProperty({
      name: "saveHost makes nothing",
      runs: 200,
      gen: (rng) => ({ has: [rng.bool(), rng.bool(), rng.bool()], link: rng.pick(ODD) }),
      prop: ({ has, link }) => {
        const made = { blobs: 0, urls: 0 };
        const env: SaveEnv = {
          Blob: has[0] ? function Blob() { made.blobs += 1; } : undefined,
          URL: has[1] ? { createObjectURL: () => (made.urls += 1, "x") } : undefined,
          document: has[2] ? { createElement: () => link } : undefined,
        };
        expect(() => readSave(saveHost(env))).not.toThrow();
        expect(made).toEqual({ blobs: 0, urls: 0 });
      },
    });
  });
});

function genRow(rng: Rng): SaveRow {
  return {
    kind: rng.pick(SAVE_KINDS),
    path: rng.pick(["apps/web/src/a/B.ts", "packages/x-y/src/z.ts"]),
    uses: rng.int(1, 5),
    makes: { en: genString(rng, 40), fr: genString(rng, 40) },
    source: genString(rng, 10) || "s",
    recordedOn: "2026-11-21",
  };
}

describe("rows and downloads", () => {
  const NOW = new Date(2026, 10, 21, 9, 0, 0);

  it("never throws on any rows, and keeps one block per row", () => {
    assertProperty({
      name: "exports on any rows",
      runs: 200,
      gen: (rng) => Array.from({ length: rng.int(0, 8) }, () => genRow(rng)),
      prop: (rows) => {
        for (const l of ["en", "fr"] as const) {
          expect(saveAsCsv(l, rows, NOW).count).toBe(rows.length);
          expect(saveAsText(l, rows, NOW).count).toBe(rows.length);
          expect(() => renderSaveHtml(l, rows, null)).not.toThrow();
        }
      },
    });
  });

  it("never lets a row's text open a tag in the panel", () => {
    assertProperty({
      name: "html escapes row text",
      runs: 200,
      gen: (rng) => [{ ...genRow(rng), makes: { en: `<img src=x onerror=${genString(rng, 5)}>`, fr: "<b>x</b>" } }],
      prop: (rows) => {
        const html = renderSaveHtml("en", rows, null);
        expect(html).not.toContain("<img src=x");
        expect(html).not.toContain("<b>x</b>");
      },
    });
  });

  it("is the same twice", () => {
    assertProperty({
      name: "exports are deterministic",
      gen: (rng) => Array.from({ length: rng.int(0, 6) }, () => genRow(rng)),
      prop: (rows) => {
        expect(saveAsCsv("fr", rows, NOW, ";")).toEqual(saveAsCsv("fr", rows, NOW, ";"));
        expect(saveAsText("en", rows, NOW)).toEqual(saveAsText("en", rows, NOW));
      },
    });
  });

  it("is told about a row that breaks the rules, whatever else it holds", () => {
    assertProperty({
      name: "validate reports a bad path",
      gen: (rng) => ({ ...genRow(rng), path: rng.pick(["", "src/a.ts", "apps/web/a.ts", "../apps/web/src/a.ts"]) }),
      prop: (row) => expect(validateSave([row]).map((v) => v.code)).toContain("bad-path"),
    });
    expect(validateSave(SAVE_REGISTER)).toEqual([]);
  });
});

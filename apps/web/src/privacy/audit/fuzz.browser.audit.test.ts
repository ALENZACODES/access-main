// Robustness audit for the browser register's scanner, the reading of the browser and the downloads. Whatever text a
// file holds, scanning must not throw; adding a call adds exactly one place; a call only mentioned in a comment adds
// none. Whatever a browser answers, reading must not throw, must keep nothing that is not a clean answer, and must
// say the same thing twice. Whatever the rows hold, the downloads must not throw and must hold one block per row.

import { describe, expect, it } from "vitest";
import { BROWSER_QUESTIONS, answeredQuestions, browserAnswerText, browserCheck, browserSize, checkBrowser, cleanBytes, cleanLanguage, readBrowser, type BrowserHost } from "../panel/browserLive";
import { BROWSER_KINDS, BROWSER_REGISTER, validateBrowser, type BrowserRow } from "../panel/browserRegister";
import { browserAsCsv, browserAsText, renderBrowserHtml } from "../panel/browserSection";
import { compareBrowser, isCleanBrowser, scanBrowser } from "./browserScan";
import { genString, mutateText } from "./fuzz/gen";
import { assertProperty, assertPropertyAsync, shrinkString } from "./fuzz/property";
import type { Rng } from "./fuzz/rng";

const PATH = "apps/web/src/fuzz/File.ts";
const CALLS = ["navigator.language", "navigator.onLine", "window.matchMedia('(prefers-contrast: more)')", "navigator.storage", "crypto.randomUUID()", "(3).toLocaleString()", "nav.languages", "window.isSecureContext"];
const KIND_OF = (call: string): string =>
  /language/.test(call) ? "language" : /onLine/.test(call) ? "online" : /matchMedia/.test(call) ? "preference" : /storage/.test(call) ? "storage-size" : /randomUUID/.test(call) ? "identifier" : /isSecureContext/.test(call) ? "privacy-signal" : "own-language";

function quietSource(rng: Rng): string {
  const lines: string[] = [];
  for (let i = rng.int(0, 12); i > 0; i -= 1) {
    const roll = rng.int(0, 3);
    if (roll === 0) lines.push(`const v${i} = ${JSON.stringify(genString(rng, 20).replace(/navigator|matchMedia|crypto|toLocale|isSecureContext/g, "x"))};`);
    else if (roll === 1) lines.push(`// ${rng.pick(CALLS)} is how the page asks`);
    else if (roll === 2) lines.push(` * ${rng.pick(CALLS)} is described here`);
    else lines.push(`export const f${i} = (x: number): number => x + ${i};`);
  }
  return lines.join("\n");
}

describe("scanning any text", () => {
  it("never throws, and every place has a line of 1 or more", () => {
    assertProperty({
      name: "scanBrowser on any text",
      runs: 400,
      gen: (rng) => (rng.bool(0.5) ? genString(rng, 200) : mutateText(rng, `${quietSource(rng)}\n${rng.pick(CALLS)}`)),
      shrink: shrinkString,
      prop: (text) => {
        for (const f of scanBrowser([{ path: PATH, text }])) {
          expect(f.lines.length).toBeGreaterThan(0);
          for (const line of f.lines) expect(line).toBeGreaterThanOrEqual(1);
        }
      },
    });
  });

  it("finds nothing in source that only mentions a call", () => {
    assertProperty({ name: "quiet source has no place", gen: quietSource, shrink: shrinkString, prop: (text) => expect(scanBrowser([{ path: PATH, text }])).toEqual([]) });
  });

  it("finds exactly one more place for each call added, on the line it was added", () => {
    assertProperty({
      name: "one call, one place",
      runs: 300,
      gen: (rng) => ({ text: quietSource(rng), call: rng.pick(CALLS) }),
      prop: ({ text, call }) => {
        const body = text === "" ? "" : `${text}\n`;
        const found = scanBrowser([{ path: PATH, text: `${body}const x = ${call};` }]);
        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({ kind: KIND_OF(call), lines: [body.split("\n").length] });
      },
    });
  });

  it("is the same twice, and does not depend on the order of the files", () => {
    assertProperty({
      name: "scan is deterministic",
      gen: (rng) => [0, 1, 2].map((i) => ({ path: `apps/web/src/f${i}.ts`, text: `${quietSource(rng)}\n${rng.pick(CALLS)}` })),
      prop: (files) => {
        expect(scanBrowser(files)).toEqual(scanBrowser(files));
        expect(scanBrowser([...files].reverse())).toEqual(scanBrowser(files));
      },
    });
  });

  it("is clean against itself: rows built from what was found match it", () => {
    assertProperty({
      name: "rows from a scan compare clean",
      gen: (rng) => ({ path: PATH, text: Array.from({ length: rng.int(0, 5) }, () => rng.pick(CALLS)).join(";\n") }),
      prop: (file) => {
        const found = scanBrowser([file]);
        const rows: BrowserRow[] = found.map((f) => ({ kind: f.kind, path: f.path, uses: f.lines.length, asks: { en: "a", fr: "b" }, usedFor: { en: "c", fr: "d" }, source: "s", recordedOn: "2026-11-21" }));
        expect(isCleanBrowser(compareBrowser(found, rows))).toBe(true);
      },
    });
  });

  it("does not stall on a very long line", () => {
    const start = Date.now();
    expect(() => scanBrowser([{ path: PATH, text: `navigator.${"x".repeat(20000)}\nwindow.matchMedia(${"(".repeat(5000)}` }])).not.toThrow();
    expect(Date.now() - start).toBeLessThan(2000);
  });
});

const ODD: readonly unknown[] = [undefined, null, 0, -1, 1.5, Number.NaN, Infinity, 2 ** 60, "", " ", "en", "fr-CA", "<script>", "x".repeat(500), true, false, {}, [], () => 1, Symbol("s")];

function oddHost(rng: Rng): BrowserHost {
  const maybe = <T>(v: T): T | undefined => (rng.bool(0.2) ? undefined : v);
  const answer = (): unknown => rng.pick(ODD);
  const wrap = (f: () => unknown): (() => unknown) => (rng.bool(0.15) ? () => { throw new Error("no"); } : f);
  return {
    language: maybe(wrap(answer)) as BrowserHost["language"],
    online: maybe(wrap(answer)) as BrowserHost["online"],
    prefers: maybe(wrap(answer)) as BrowserHost["prefers"],
    storage: maybe(rng.bool(0.15) ? async () => { throw new Error("no"); } : async () => ({ usage: answer(), quota: answer(), persisted: answer() })) as BrowserHost["storage"],
  };
}

describe("reading any browser", () => {
  it("never throws, and keeps only clean answers", async () => {
    await assertPropertyAsync({
      name: "readBrowser on any host",
      runs: 300,
      gen: oddHost,
      prop: async (host) => {
        const r = await readBrowser(host);
        expect(r.language === null || (typeof r.language === "string" && r.language.length <= 35 && /^[A-Za-z0-9-]+$/.test(r.language))).toBe(true);
        for (const b of [r.online, r.contrast, r.motion, r.persisted]) expect(b === null || typeof b === "boolean").toBe(true);
        for (const n of [r.usage, r.quota]) expect(n === null || (Number.isSafeInteger(n) && n >= 0)).toBe(true);
        expect(answeredQuestions(r).length).toBeLessThanOrEqual(BROWSER_QUESTIONS.length);
      },
    });
  });

  it("says the same twice, and every finding and answer is plain text in both languages", async () => {
    await assertPropertyAsync({
      name: "check is deterministic",
      runs: 150,
      gen: (rng) => ({ r: rng.int(1, 1_000_000), h: oddHost(rng) }),
      prop: async ({ h }) => {
        const r = await readBrowser(h);
        expect(checkBrowser(r)).toEqual(checkBrowser(r));
        const view = browserCheck(r);
        expect(view.answered).toBe(answeredQuestions(r).length);
        for (const l of ["en", "fr"] as const) for (const q of BROWSER_QUESTIONS) expect(browserAnswerText(l, q, r)).not.toMatch(/undefined|NaN|\[object/);
      },
    });
  });

  it("cleans a language and a size to something a person can read, or to unknown", () => {
    assertProperty({
      name: "cleaners",
      runs: 400,
      gen: (rng) => (rng.bool(0.5) ? genString(rng, 60) : rng.pick(ODD)),
      prop: (v) => {
        const l = cleanLanguage(v);
        expect(l === null || /^[A-Za-z0-9-]+$/.test(l)).toBe(true);
        const b = cleanBytes(v);
        if (b !== null) {
          expect(Number.isSafeInteger(b)).toBe(true);
          for (const loc of ["en", "fr"] as const) expect(browserSize(loc, b)).toMatch(/^\d+(?:[.,]\d+)?[\u00A0 ](?:B|o|kB|ko|MB|Mo|GB|Go|TB|To)$/);
        }
      },
    });
  });
});

function genRow(rng: Rng): BrowserRow {
  return {
    kind: rng.pick(BROWSER_KINDS),
    path: rng.pick(["apps/web/src/a/B.ts", "packages/x-y/src/z.ts"]),
    uses: rng.int(1, 5),
    asks: { en: genString(rng, 40), fr: genString(rng, 40) },
    usedFor: { en: genString(rng, 40), fr: genString(rng, 40) },
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
          expect(browserAsCsv(l, rows, NOW).count).toBe(rows.length);
          expect(browserAsText(l, rows, NOW).count).toBe(rows.length);
          expect(() => renderBrowserHtml(l, rows, null)).not.toThrow();
        }
      },
    });
  });

  it("never lets a row's text open a tag in the panel", () => {
    assertProperty({
      name: "html escapes row text",
      runs: 200,
      gen: (rng) => [{ ...genRow(rng), asks: { en: `<img src=x onerror=${genString(rng, 5)}>`, fr: "<b>x</b>" } }],
      prop: (rows) => {
        const html = renderBrowserHtml("en", rows, null);
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
        expect(browserAsCsv("fr", rows, NOW, ";")).toEqual(browserAsCsv("fr", rows, NOW, ";"));
        expect(browserAsText("en", rows, NOW)).toEqual(browserAsText("en", rows, NOW));
      },
    });
  });

  it("is told about a row that breaks the rules, whatever else it holds", () => {
    assertProperty({
      name: "validate reports a bad path",
      gen: (rng) => ({ ...genRow(rng), path: rng.pick(["", "src/a.ts", "apps/web/a.ts", "../apps/web/src/a.ts"]) }),
      prop: (row) => expect(validateBrowser([row]).map((v) => v.code)).toContain("bad-path"),
    });
    expect(validateBrowser(BROWSER_REGISTER)).toEqual([]);
  });
});

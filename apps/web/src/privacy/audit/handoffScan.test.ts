import { describe, expect, it } from "vitest";
import type { HandoffRow } from "../panel/handoffRegister";
import { SCHEME_CATALOGUE, compareHandoffs, formatHandoffComparison, isClean, scanHandoffs } from "./handoffScan";

const file = (text: string, path = "apps/web/src/a.ts") => ({ path, text });
const one = (text: string) => scanHandoffs([file(text)]);
const row = (scheme: HandoffRow["scheme"], uses = 1, path = "apps/web/src/a.ts"): HandoffRow => ({ scheme, path, uses, opens: { en: "a", fr: "a" }, carries: { en: "a", fr: "a" }, source: "s", recordedOn: "2026-11-20" });

describe("what counts as a link", () => {
  it("finds each kind written at the start of a string or template", () => {
    expect(one('const a = "mailto:?subject=x";').map((f) => f.scheme)).toEqual(["mailto"]);
    expect(one("const a = `tel:${n}`;").map((f) => f.scheme)).toEqual(["tel"]);
    expect(one("const a = 'sms:123';").map((f) => f.scheme)).toEqual(["sms"]);
    expect(one("const a = `geo:${1},${2}`;").map((f) => f.scheme)).toEqual(["geo"]);
    expect(one('const a = "webcal://x";').map((f) => f.scheme)).toEqual(["webcal"]);
    expect(one('const a = "webcals://x";').map((f) => f.scheme)).toEqual(["webcal"]);
    expect(one('const a = "maps://x";').map((f) => f.scheme)).toEqual(["maps"]);
    expect(one('const a = "intent://x";').map((f) => f.scheme)).toEqual(["intent"]);
    expect(one('const a = "whatsapp://send";').map((f) => f.scheme)).toEqual(["whatsapp"]);
    expect(one('const a = "facetime:x";').map((f) => f.scheme)).toEqual(["facetime"]);
    expect(one('const a = "facetime-audio:x";').map((f) => f.scheme)).toEqual(["facetime"]);
  });
  it("finds a link inside markup", () => {
    expect(one('<a href="tel:416">x</a>').map((f) => f.scheme)).toEqual(["tel"]);
  });
  it("does not find a scheme that is only mentioned", () => {
    expect(one("// opens mailto: in the mail app\nconst x = 1;")).toEqual([]);
    expect(one("/**\n * A `geo:` link\n */\nconst x = 1;")).toEqual([]);
    expect(one('const m = "Write only digits after tel: and a plus";')).toEqual([]);
    expect(one("const re = /^mailto:/i;")).toEqual([]);
    expect(one("const hotel: string = 'x';")).toEqual([]);
  });
  it("does not take a longer word that ends in a scheme", () => {
    expect(one('const a = "hotel:room";')).toEqual([]);
    expect(one('const a = "geometry:x";')).toEqual([]);
  });
  it("gives the line of each place, in order, and counts a repeated place once", () => {
    const f = one('const a = "tel:1";\n\nconst b = "tel:2";\n');
    expect(f).toEqual([{ scheme: "tel", path: "apps/web/src/a.ts", lines: [1, 3] }]);
  });
  it("skips files the storage scan skips: tests, type files and the narrow samples", () => {
    for (const path of ["apps/web/src/a.test.ts", "apps/web/src/a.d.ts", "apps/web/src/narrow/samples.ts", "apps/web/src/privacy/audit/x.ts", "apps/web/src/a.css"]) {
      expect(scanHandoffs([file('const a = "tel:1";', path)]), path).toEqual([]);
    }
  });
  it("orders by kind and then path", () => {
    const f = scanHandoffs([file('"tel:1"', "apps/web/src/z.ts"), file('"tel:1"', "apps/web/src/b.ts"), file('"geo:1"', "apps/web/src/y.ts")]);
    expect(f.map((x) => `${x.scheme} ${x.path.split("/").pop()}`)).toEqual(["geo y.ts", "tel b.ts", "tel z.ts"]);
  });
});

describe("navigation to a run-time address", () => {
  it("finds assign, replace, a write to location and window.open", () => {
    for (const code of [
      "window.location.assign(u);",
      "location.replace(u);",
      "document.location.assign(u);",
      "window.location.href = u;",
      "window.location = u;",
      "location.href = u;",
      "globalThis.location.href = u;",
      "window.open(u, '_blank');",
    ]) expect(one(code).map((f) => f.scheme), code).toEqual(["navigation"]);
  });
  it("does not take a variable called location, a comparison, or a read", () => {
    for (const code of [
      "const location = useLocation();",
      "<Route location={{ type: 'x' }} />",
      "if (window.location.href === u) {}",
      "const h = window.location.href;",
      "const p = location.pathname;",
      "this.location = x;",
      "const reopen = (u) => u;",
    ]) expect(one(code), code).toEqual([]);
  });
  it("counts two calls on one line as two places on that line", () => {
    expect(one("window.open(a); window.open(b);")).toEqual([{ scheme: "navigation", path: "apps/web/src/a.ts", lines: [1, 1] }]);
  });
});

describe("compareHandoffs", () => {
  const found = (text: string, path = "apps/web/src/a.ts") => scanHandoffs([file(text, path)]);
  it("is clean when the rows match", () => {
    const c = compareHandoffs(found('"tel:1"'), [row("tel")]);
    expect(isClean(c)).toBe(true);
    expect(formatHandoffComparison(c)).toBe("");
  });
  it("is clean for nothing found and no rows", () => {
    expect(isClean(compareHandoffs([], []))).toBe(true);
  });
  it("reports a link with no row, with its first line", () => {
    const c = compareHandoffs(found('\n"geo:1"'), []);
    expect(c.unlisted.map((u) => u.lines)).toEqual([[2]]);
    expect(formatHandoffComparison(c)).toBe("apps/web/src/a.ts:2: a geo link (1 place) is in no row");
  });
  it("says places in the plural", () => {
    expect(formatHandoffComparison(compareHandoffs(found('"geo:1" + "geo:2"'), []))).toContain("(2 places)");
  });
  it("reports a row whose link is gone", () => {
    const c = compareHandoffs([], [row("mailto")]);
    expect(c.gone).toEqual([{ scheme: "mailto", path: "apps/web/src/a.ts" }]);
    expect(formatHandoffComparison(c)).toBe("apps/web/src/a.ts: the row for mailto finds no such link");
  });
  it("reports a different count, in singular and plural", () => {
    const c = compareHandoffs(found('"tel:1"; "tel:2"'), [row("tel", 1)]);
    expect(c.wrongCount).toEqual([{ scheme: "tel", path: "apps/web/src/a.ts", listed: 1, found: 2 }]);
    expect(formatHandoffComparison(c)).toBe("apps/web/src/a.ts: the row says 1 tel link but 2 found");
    expect(formatHandoffComparison(compareHandoffs(found('"tel:1"'), [row("tel", 3)]))).toContain("the row says 3 tel links but 1 found");
  });
  it("treats the same kind in two files as two rows", () => {
    const f = scanHandoffs([file('"tel:1"', "apps/web/src/a.ts"), file('"tel:1"', "apps/web/src/b.ts")]);
    const c = compareHandoffs(f, [row("tel", 1, "apps/web/src/a.ts")]);
    expect(c.unlisted.map((u) => u.path)).toEqual(["apps/web/src/b.ts"]);
  });
  it("lists every kind of difference together", () => {
    const f = found('"tel:1"; "tel:2"; "sms:1"');
    const c = compareHandoffs(f, [row("tel", 1), row("geo")]);
    expect(formatHandoffComparison(c).split("\n")).toHaveLength(3);
    expect(isClean(c)).toBe(false);
  });
});

describe("the catalogue", () => {
  it("has one entry for each kind, with at least one pattern each", () => {
    expect(new Set(SCHEME_CATALOGUE.map((s) => s.id)).size).toBe(SCHEME_CATALOGUE.length);
    for (const s of SCHEME_CATALOGUE) expect(s.patterns.length, s.id).toBeGreaterThan(0);
  });
  it("uses a scan that can be run twice on the same text with the same result", () => {
    const text = 'const a = "tel:1"; window.open(a);';
    expect(one(text)).toEqual(one(text));
  });
});

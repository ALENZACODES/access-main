import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { POINT_STYLES } from "./pointFormat";
import {
  pointEquivalents,
  pointFormatName,
  pointPasteHelp,
  pointProblemText,
  pointReadText,
  pointStatusText,
  pointStyleName,
} from "./pointCopy";
import { readPoint, type PointFormat, type PointProblem } from "./pointRead";
import { lintFrench } from "./typography";

const PROBLEMS: PointProblem[] = [
  "too-long", "no-numbers", "one-number", "number-count", "out-of-range", "bad-minutes",
  "bad-letters", "sign-and-letter", "mixed-parts", "link-no-point", "stray-text",
];
const FORMATS: PointFormat[] = ["decimal", "hemisphere", "dm", "dms", "geo-link", "map-link"];
const LOCALES = ["en", "fr"] as const;

function ok(s: string) {
  const r = readPoint(s);
  if (r.status !== "ok") throw new Error(`not ok: ${s}`);
  return r;
}

describe("every string is present and clean", () => {
  it("has text for each problem in both languages, all different", () => {
    for (const l of LOCALES) {
      const seen = new Set<string>();
      for (const p of PROBLEMS) {
        const s = pointProblemText(p, l);
        expect(s.length, `${p} ${l}`).toBeGreaterThan(10);
        expect(s.endsWith("."), `${p} ${l}`).toBe(true);
        seen.add(s);
      }
      expect(seen.size).toBe(PROBLEMS.length);
    }
  });
  it("has a name for each format and style in both languages", () => {
    for (const l of LOCALES) {
      expect(new Set(FORMATS.map((f) => pointFormatName(f, l))).size).toBe(FORMATS.length);
      expect(new Set(POINT_STYLES.map((s) => pointStyleName(s, l))).size).toBe(POINT_STYLES.length);
    }
  });
  it("keeps French typography: curly apostrophes, no stray spaces", () => {
    const all: string[] = [pointPasteHelp("fr")];
    for (const p of PROBLEMS) all.push(pointProblemText(p, "fr"));
    for (const f of FORMATS) all.push(pointFormatName(f, "fr"));
    for (const s of POINT_STYLES) all.push(pointStyleName(s, "fr"));
    all.push(pointReadText(ok("43.65, 95"), "fr"));
    for (const s of all) expect(lintFrench(s), s).toEqual([]);
  });
  it("passes the copy linter in both languages", () => {
    for (const l of LOCALES) {
      const all: string[] = [pointPasteHelp(l)];
      for (const p of PROBLEMS) all.push(pointProblemText(p, l));
      for (const f of FORMATS) all.push(pointFormatName(f, l));
      for (const s of POINT_STYLES) all.push(pointStyleName(s, l));
      for (const s of all) expect(lintCopy(s, l), `${l}: ${s}`).toEqual([]);
    }
  });
  it("never uses a straight apostrophe or an irregular space in French", () => {
    const irregular = new RegExp("[" + ["2028", "2029", "feff", "2007", "2009", "200a"].map((h) => String.fromCharCode(parseInt(h, 16))).join("") + "]");
    for (const p of PROBLEMS) {
      const s = pointProblemText(p, "fr");
      expect(s.includes("'")).toBe(false);
      expect(irregular.test(s)).toBe(false);
    }
  });
});

describe("what the problems tell the person to do", () => {
  it("names the limits for a range problem", () => {
    expect(pointProblemText("out-of-range", "en")).toContain("-90 to 90");
    expect(pointProblemText("out-of-range", "en")).toContain("-180 to 180");
  });
  it("names the allowed counts of numbers", () => {
    const s = pointProblemText("number-count", "en");
    expect(s).toContain("two numbers");
    expect(s).toContain("four");
    expect(s).toContain("six");
  });
  it("mentions O for west in French", () => {
    expect(pointProblemText("bad-letters", "fr")).toContain("O");
  });
  it("tells the person to paste only the point when it is too long", () => {
    expect(pointProblemText("too-long", "en")).toMatch(/only the point/);
  });
});

describe("pointReadText", () => {
  it("says what was read and from what", () => {
    expect(pointReadText(ok("43.65, -79.38"), "en")).toBe("Read as 43.65000, -79.38000, from decimal degrees.");
  });
  it("names each format that was read", () => {
    const cases: Array<[string, string]> = [
      ["43.65 N, 79.38 W", "degrees with north, south, east or west"],
      ["43 39.0 N, 79 22.8 W", "degrees and minutes"],
      ["43 39 0 N, 79 22 48 W", "degrees, minutes and seconds"],
      ["geo:43.65,-79.38", "a geo link"],
      ["https://example.org/?mlat=43.65&mlon=-79.38", "a map link"],
    ];
    for (const [text, name] of cases) expect(pointReadText(ok(text), "en"), text).toContain(name);
  });
  it("adds the swap note only when the order was changed", () => {
    expect(pointReadText(ok("43.65, -79.38"), "en")).not.toContain("longitude");
    const swapped = pointReadText(ok("151.2, -33.9"), "en");
    expect(swapped).toContain("longitude");
    expect(swapped).toContain("Check that this is right.");
    expect(pointReadText(ok("151.2, -33.9"), "fr")).toContain("Vérifiez");
  });
  it("writes the French decimal comma", () => {
    expect(pointReadText(ok("43.65, -79.38"), "fr")).toContain("43,65000");
  });
});

describe("pointStatusText", () => {
  it("is empty for nothing", () => {
    expect(pointStatusText(readPoint(""), "en")).toBe("");
  });
  it("gives the problem for a bad paste", () => {
    expect(pointStatusText(readPoint("hello"), "en")).toBe(pointProblemText("stray-text", "en"));
    expect(pointStatusText(readPoint("43.65"), "fr")).toBe(pointProblemText("one-number", "fr"));
  });
  it("gives the reading for a good paste", () => {
    expect(pointStatusText(readPoint("43.65, -79.38"), "en")).toBe(pointReadText(ok("43.65, -79.38"), "en"));
  });
});

describe("pointEquivalents", () => {
  const p = { lat: 43.65, lon: -79.38 };
  it("lists the five styles in order with labels", () => {
    const list = pointEquivalents(p, "en");
    expect(list.map((x) => x.style)).toEqual([...POINT_STYLES]);
    expect(list.map((x) => x.label)).toEqual(POINT_STYLES.map((s) => pointStyleName(s, "en")));
  });
  it("gives text that reads back as the same point", () => {
    for (const l of LOCALES) {
      for (const e of pointEquivalents(p, l)) {
        const r = readPoint(e.text);
        expect(r.status, `${l} ${e.style} ${e.text}`).toBe("ok");
        if (r.status === "ok") {
          expect(Math.abs(r.point.lat - p.lat)).toBeLessThan(1e-4);
          expect(Math.abs(r.point.lon - p.lon)).toBeLessThan(1e-4);
        }
      }
    }
  });
  it("writes French with the French decimal comma", () => {
    expect(pointEquivalents(p, "fr")[0]?.text).toContain("43,65000");
  });
});

describe("pointPasteHelp", () => {
  it("shows the forms that are read", () => {
    const s = pointPasteHelp("en");
    expect(s).toContain("geo link");
    expect(s).toContain("map link");
  });
  it("makes no claim about data, which is the register's to make", () => {
    expect(pointPasteHelp("en")).not.toMatch(/sent|stored|saved|shared/i);
    expect(pointPasteHelp("fr")).not.toMatch(/envoy|stock|enregistr|partag/i);
  });
  it("is in French for fr", () => {
    expect(pointPasteHelp("fr")).toContain("Collez un point");
  });
});

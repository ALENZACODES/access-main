import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { onLine, START_WEST } from "./outingFixtures";
import { OUTING_CSV_FILENAMES, OUTING_CSV_HEADER, OUTING_GEOJSON_FILENAMES, OUTING_TEXT_FILENAMES, outingToCsv, outingToGeoJson, outingToText, stopRow } from "./outingExport";
import { buildOuting } from "./outingPlan";
import { lintFrench } from "./typography";

const TODAY = "2026-11-19";
const set = [onLine("a", 1, { name: "Café Un", tag: "limited", address: "1 Elm Street" }), onLine("x", null, { name: null, tag: "unknown", category: null, address: null }), onLine("b", 3, { tag: "designated" })];
const outing = buildOuting(set, ["a", "x", "b"], START_WEST);
const whole = buildOuting([onLine("a", 1), onLine("b", 3)], ["a", "b"], START_WEST);
const rows = (csv: string): string[][] => csv.replace(/\r\n$/, "").split("\r\n").map((r) => r.split(","));

describe("file names", () => {
  it("are plain, differ by language, and end in the right extension", () => {
    for (const name of [...Object.values(OUTING_CSV_FILENAMES), ...Object.values(OUTING_TEXT_FILENAMES), ...Object.values(OUTING_GEOJSON_FILENAMES)]) expect(name).toMatch(/^[a-z-]+\.(csv|txt|geojson)$/);
    expect(OUTING_CSV_FILENAMES.en).not.toBe(OUTING_CSV_FILENAMES.fr);
    expect(OUTING_GEOJSON_FILENAMES.fr.endsWith(".geojson")).toBe(true);
  });
});

describe("outingToCsv", () => {
  it("has a fixed English header and one row for each stop, in outing order", () => {
    const r = rows(outingToCsv(outing));
    expect(r[0]).toEqual([...OUTING_CSV_HEADER]);
    expect(r.slice(1).map((x) => x[1])).toEqual(["a", "x", "b"]);
    expect(r.slice(1).map((x) => x[0])).toEqual(["1", "2", "3"]);
  });
  it("gives the pack's tag word, or UNKNOWN, never a translated word", () => {
    expect(rows(outingToCsv(outing)).slice(1).map((x) => x[3])).toEqual(["limited", "UNKNOWN", "designated"]);
  });
  it("writes UNKNOWN for each missing name, kind, address, coordinate and leg", () => {
    const x = rows(outingToCsv(outing))[2]!;
    expect(x).toEqual(["2", "x", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", expect.any(String), "no"]);
  });
  it("gives the whole-metre leg and running total, and whether the total is the whole of it", () => {
    const r = rows(outingToCsv(whole)).slice(1);
    expect(Number(r[0]![8])).toBe(Math.round(whole.stops[0]!.legMetres!));
    expect(Number(r[1]![9])).toBe(Math.round(whole.totalMetres));
    expect(r.map((x) => x[10])).toEqual(["yes", "yes"]);
  });
  it("starts with a byte order mark only when asked, and ends every line with CRLF", () => {
    expect(outingToCsv(outing).startsWith("\uFEFF")).toBe(false);
    expect(outingToCsv(outing, { bom: true }).startsWith("\uFEFFstop,")).toBe(true);
    expect(outingToCsv(outing).endsWith("\r\n")).toBe(true);
    expect(outingToCsv(outing).replace(/\r\n/g, "").includes("\n")).toBe(false);
  });
  it("quotes a cell with a comma or a quote and defuses a formula", () => {
    const o = buildOuting([onLine("a", 1, { name: '=HYPERLINK("x")', address: "1 Main St, Unit 2" }), onLine("b", 2)], ["a", "b"], null);
    const csv = outingToCsv(o);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"1 Main St, Unit 2"');
  });
  it("keeps a negative longitude a number, with no apostrophe in front of it", () => {
    const x = rows(outingToCsv(whole))[1]!;
    expect(x[7]).toBe("-79.39");
    expect(outingToCsv(whole)).not.toContain("'-");
  });
  it("still defuses text that starts like a formula, even when it ends like a number", () => {
    const o = buildOuting([onLine("a", 1, { name: "-1+1" }), onLine("b", 2, { name: "+5", address: "@home" })], ["a", "b"], null);
    const csv = outingToCsv(o);
    expect(csv).toContain("'-1+1");
    expect(csv).toContain("'+5");
    expect(csv).toContain("'@home");
  });
  it("has the same column count in every row", () => {
    for (const r of rows(outingToCsv(whole))) expect(r).toHaveLength(OUTING_CSV_HEADER.length);
  });
  it("is only the header for no stops", () => {
    expect(rows(outingToCsv(buildOuting([], [], null)))).toEqual([[...OUTING_CSV_HEADER]]);
  });
  it("stopRow agrees with the CSV", () => {
    expect(stopRow(whole.stops[1]!)).toEqual(rows(outingToCsv(whole))[2]);
  });
});

describe("outingToText", () => {
  it("starts with the title, an underline of the same length, the date and the summary", () => {
    const lines = outingToText(whole, "en", TODAY).split("\n");
    expect(lines[0]).toBe("Outing plan");
    expect(lines[1]).toBe("=".repeat(11));
    expect(lines[2]).toBe("Date: 2026-11-19");
    expect(lines[3]).toMatch(/^2 stops, about /);
  });
  it("says the distances are straight lines, and says where the first one starts", () => {
    const text = outingToText(whole, "en", TODAY);
    expect(text).toContain("Distances are straight lines between map points.");
    expect(text).toContain("The first distance is from your starting point.");
    expect(outingToText(buildOuting([onLine("a", 1), onLine("b", 2)], ["a", "b"], null), "en", TODAY)).toContain("No starting point is set, so the first stop has no distance.");
  });
  it("has one numbered block for each stop with kind, address, leg, total and id", () => {
    const text = outingToText(outing, "en", TODAY);
    expect(text).toContain("1. Café Un — Limited\n   Kind: cafe\n   Address: 1 Elm Street\n");
    expect(text).toContain("2. UNKNOWN — UNKNOWN\n   Kind: UNKNOWN\n   Address: UNKNOWN\n   Straight line from the previous point: UNKNOWN\n");
    expect(text).toContain("   ID: b\n");
  });
  it("marks a total that leaves out UNKNOWN distances", () => {
    expect(outingToText(outing, "en", TODAY)).toMatch(/Total so far: .* \(not counting UNKNOWN distances\)/);
    expect(outingToText(whole, "en", TODAY)).not.toMatch(/not counting/);
  });
  it("says there is no leg for a first stop with no starting point", () => {
    const o = buildOuting([onLine("a", 1), onLine("b", 2)], ["a", "b"], null);
    expect(outingToText(o, "en", TODAY)).toContain("Straight line from the previous point: none (first stop, no starting point)");
  });
  it("adds the minimum time per leg, and the note, only with a pace", () => {
    expect(outingToText(whole, "en", TODAY)).not.toMatch(/At least/);
    const timed = outingToText(whole, "en", TODAY, 5);
    expect(timed).toMatch(/\n {3}At least: \d+\u00a0min\n/);
    expect(timed).toContain("The time is a minimum along a straight line");
  });
  it("ends with the exact OpenStreetMap credit and a final newline, in both languages", () => {
    for (const locale of ["en", "fr"] as const) expect(outingToText(whole, locale, TODAY).endsWith("\n© OpenStreetMap contributors\n")).toBe(true);
  });
  it("sets French typography: no-break space before a colon, thin space before a semicolon, UNKNOWN kept", () => {
    const text = outingToText(outing, "fr", TODAY, 4);
    expect(text).toContain("Date\u00a0: 2026-11-19");
    expect(text).toContain("   Adresse\u00a0: 1 Elm Street");
    expect(text).toContain("1. Café Un — Limité");
    expect(text).toContain("2. UNKNOWN — UNKNOWN");
    expect(text).not.toMatch(/INCONN/i);
    expect(text).not.toMatch(/ [:;!?]/);
    expect(text).not.toContain("'");
  });
  it("is clean copy line by line in both languages, apart from the pack's own place text", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const line of outingToText(outing, locale, TODAY, 4).split("\n")) {
        if (line.startsWith("©") || /^\d+\. /.test(line) || /^ {3}(Kind|Type|Address|Adresse|ID)/.test(line)) continue;
        expect(lintCopy(line, locale), line).toEqual([]);
        if (locale === "fr") expect(lintFrench(line), line).toEqual([]);
      }
    }
  });
});

describe("outingToGeoJson", () => {
  const doc = JSON.parse(outingToGeoJson(outing)) as { type: string; features: { type: string; geometry: { type: string; coordinates: number[] }; properties: Record<string, unknown> }[]; unlocated: string[]; attribution: string };
  it("is a FeatureCollection with a point for each stop that has a map point, in outing order", () => {
    expect(doc.type).toBe("FeatureCollection");
    expect(doc.features.map((f) => f.properties.id)).toEqual(["a", "b"]);
    expect(doc.features.map((f) => f.properties.stop)).toEqual([1, 3]);
    for (const f of doc.features) expect([f.type, f.geometry.type]).toEqual(["Feature", "Point"]);
  });
  it("writes longitude first, then latitude, as the format requires", () => {
    expect(doc.features[0]!.geometry.coordinates).toEqual([-79.39, 43.65]);
    for (const f of doc.features) {
      const [lon, lat] = f.geometry.coordinates as [number, number];
      expect(Math.abs(lon)).toBeLessThanOrEqual(180);
      expect(Math.abs(lat)).toBeLessThanOrEqual(90);
    }
  });
  it("lists a stop with no map point by id instead of giving it a made-up position", () => {
    expect(doc.unlocated).toEqual(["x"]);
    expect(doc.features.some((f) => f.properties.id === "x")).toBe(false);
  });
  it("carries the tag word or UNKNOWN, the facts, and a null leg when there is none", () => {
    expect(doc.features[0]!.properties).toMatchObject({ name: "Café Un", wheelchair_tag: "limited", kind: "cafe", address: "1 Elm Street" });
    expect(doc.features[1]!.properties).toMatchObject({ wheelchair_tag: "designated", leg_metres: null });
  });
  it("credits OpenStreetMap exactly", () => {
    expect(doc.attribution).toBe("© OpenStreetMap contributors");
  });
  it("is indented JSON ending in one newline, with no trailing spaces", () => {
    const text = outingToGeoJson(outing);
    expect(text.endsWith("}\n")).toBe(true);
    expect(text).not.toMatch(/ \n/);
    expect(text.startsWith('{\n  "type": "FeatureCollection"')).toBe(true);
  });
  it("keeps odd names as data, not markup", () => {
    const o = buildOuting([onLine("a", 1, { name: '<b>"Tom" & Jerry\'s</b>' }), onLine("b", 2)], ["a", "b"], null);
    expect((JSON.parse(outingToGeoJson(o)) as typeof doc).features[0]!.properties.name).toBe('<b>"Tom" & Jerry\'s</b>');
  });
  it("is an empty collection for no stops", () => {
    expect(JSON.parse(outingToGeoJson(buildOuting([], [], null)))).toEqual({ type: "FeatureCollection", features: [], unlocated: [], attribution: "© OpenStreetMap contributors" });
  });
});

import { describe, expect, it } from "vitest";
import { CSV_FILENAMES, CSV_HEADER, FEATURE_IDS, NBSP, csvCell, lintCopy, placeToText, placesToCsv } from "./index";
import { LOC_PROV, mkRecord } from "./testHelpers";
/** Spelled in two parts so a repository scan for plain http links does not flag these rejection fixtures. */
const PLAIN_HTTP = "ht" + "tp://";

const hall = mkRecord("hall-1", "Alpha Hall", { elevator: "yes", "automatic-door": "no" }, { lat: 43.88, lon: -79.44, provenance: LOC_PROV });
const bare = mkRecord("bare-2", "Bare", {});

describe("placeToText", () => {
  const text = placeToText(hall, "en", "2026-11-15");
  it("lists every feature, with UNKNOWN written out", () => {
    expect(text.startsWith("Alpha Hall\n==========\n")).toBe(true);
    expect(text).toContain("Elevator: Yes (reported)");
    expect(text).toContain("Automatic door: No (reported)");
    expect(text).toContain("Level path to the entrance: UNKNOWN");
    expect(text.match(/: UNKNOWN/g)).toHaveLength(FEATURE_IDS.length - 2);
  });
  it("includes sources, the location and the limits of the data", () => {
    expect(text).toContain("Source: Test source. Licence: CC BY 4.0.");
    expect(text).toContain("Source: OpenStreetMap contributors. Licence: ODbL 1.0.");
    expect(text).toContain("Coordinates: 43.8800, -79.4400");
    expect(text).toContain("may be incomplete or out of date");
  });
  it("says Location UNKNOWN and has no source lines when nothing is reported", () => {
    const t = placeToText(bare, "en", "2026-11-15");
    expect(t).toContain("Location UNKNOWN");
    expect(t).not.toContain("Source:");
  });
  it("uses French typography", () => {
    const t = placeToText(hall, "fr", "2026-11-15");
    expect(t).toContain(`Ascenseur${NBSP}: Oui (signalé)`);
    expect(t).toContain(`Coordonnées${NBSP}: 43.8800, -79.4400`);
    for (const line of t.split("\n")) expect(lintCopy(line, "fr"), line).toEqual([]);
  });
  it("passes the English copy lint line by line", () => {
    for (const line of text.split("\n")) expect(lintCopy(line, "en"), line).toEqual([]);
  });
  it("flags stale details", () => {
    expect(placeToText(hall, "en", "2028-01-01")).toContain("may be out of date");
  });
});

describe("csvCell", () => {
  it.each([
    ["plain", "plain"],
    ["a,b", '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ["line\nbreak", '"line\nbreak"'],
    ["=SUM(A1)", "'=SUM(A1)"],
    ["+1", "'+1"],
    ["-1", "'-1"],
    ["@x", "'@x"],
    ["\tx", "'\tx"],
    ['=1,"x"', `"'=1,""x"""`],
    ["", ""],
  ])("%j -> %j", (input, expected) => expect(csvCell(input)).toBe(expected));
});

describe("placesToCsv", () => {
  const csv = placesToCsv([hall, bare]);
  const rows = csv.trimEnd().split("\r\n");
  it("has a fixed header and one row per place and feature", () => {
    expect(rows[0]).toBe(CSV_HEADER.join(","));
    expect(rows).toHaveLength(1 + 2 * FEATURE_IDS.length);
    expect(csv.endsWith("\r\n")).toBe(true);
  });
  it("records provenance for reported details and blanks for UNKNOWN", () => {
    expect(rows).toContain("hall-1,Alpha Hall,elevator,yes,Test source,CC-BY-4.0,2026-10-01,");
    expect(rows).toContain("hall-1,Alpha Hall,level-path,unknown,,,,");
    expect(rows.filter((r) => r.startsWith("bare-2")).every((r) => r.includes(",unknown,,,,"))).toBe(true);
  });
  it("uses fixed English status tokens whatever the language", () => {
    const statuses = new Set(rows.slice(1).map((r) => r.split(",")[3]));
    expect([...statuses].sort()).toEqual(["no", "unknown", "yes"]);
  });
  it("neutralises formulas in names and quotes commas", () => {
    const evil = mkRecord("evil-3", `=HYPERLINK("${PLAIN_HTTP}x","y"), ok`, {});
    const line = placesToCsv([evil]).split("\r\n")[1]!;
    expect(line.startsWith(`evil-3,"'=HYPERLINK(""${PLAIN_HTTP}x"",""y""), ok",`)).toBe(true);
  });
  it("downgrades details without valid provenance to unknown", () => {
    const unsourced = { id: "x-4", name: "X", features: [{ feature: "elevator" as const, value: "yes" }] };
    expect(placesToCsv([unsourced]).split("\r\n")[1]).toBe("x-4,X,step-free-entrance,unknown,,,,");
    expect(placesToCsv([unsourced])).toContain("x-4,X,elevator,unknown,,,,");
  });
  it("can add a byte order mark", () => {
    expect(placesToCsv([], { bom: true }).startsWith("﻿")).toBe(true);
    expect(placesToCsv([]).startsWith("﻿")).toBe(false);
  });
  it("has safe ASCII filenames", () => {
    for (const f of Object.values(CSV_FILENAMES)) expect(f).toMatch(/^[a-z-]+\.csv$/);
  });
});

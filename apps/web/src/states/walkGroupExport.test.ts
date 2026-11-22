import { describe, expect, it } from "vitest";
import { parseCsv } from "./csvParse";
import { place } from "./placeFixtures";
import { WG_CSV_HEADER, WG_CSV_NAME, WG_TEXT_NAME } from "./walkGroupCopy";
import { groupsCsvFile, groupsTextFile, groupsToCsv, groupsToText } from "./walkGroupExport";
import { groupPlaces } from "./walkGroups";

const at = (id: string, east: number, north: number, over: Record<string, unknown> = {}) => place(id, { lat: 43.65 + north / 111_195, lon: -79.38 + east / 80_500, ...over });
const groups = () =>
  groupPlaces(
    [
      at("b", 10, 0, { name: "Beta, Inc.", address: "2 Main Street", wheelchair: "no" }),
      at("a", 0, 0, { name: "=Alpha", address: "1 Main Street", wheelchair: "yes" }),
      at("c", 6000, 0, { name: null, address: null, wheelchair: "UNKNOWN" }),
      at("d", 6020, 0, { name: "Dee", address: null, wheelchair: "limited" }),
    ],
    100,
  ).groups;

describe("groupsToCsv", () => {
  it("writes the header and one row per place", () => {
    const p = parseCsv(groupsToCsv(groups()));
    expect(p.ok && p.rows[0]).toEqual([...WG_CSV_HEADER]);
    expect(p.ok && p.rows).toHaveLength(5);
  });
  it("numbers groups from 1 in the order given and lists members by name", () => {
    const p = parseCsv(groupsToCsv(groups()));
    const rows = p.ok ? p.rows.slice(1) : [];
    expect(rows.map((r) => [r[0], r[5]])).toEqual([["1", "a"], ["1", "b"], ["2", "d"], ["2", "c"]]);
  });
  it("writes the group name, size, spread and width", () => {
    const p = parseCsv(groupsToCsv(groups()));
    const first = p.ok ? p.rows[1]! : [];
    expect(first[1]).toBe("Main Street");
    expect(first[2]).toBe("2");
    expect(Number(first[3])).toBeGreaterThan(0);
    expect(Number(first[4])).toBeGreaterThan(0);
  });
  it("writes coordinates with six decimals and a dot", () => {
    const p = parseCsv(groupsToCsv(groups()));
    const r = p.ok ? p.rows[1]! : [];
    expect(r[9]).toMatch(/^\d+\.\d{6}$/);
    expect(r[10]).toMatch(/^-\d+\.\d{6}$/);
  });
  it("guards a name a spreadsheet could read as a formula, and quotes commas", () => {
    const csv = groupsToCsv(groups());
    expect(csv).toContain("'=Alpha");
    expect(csv).toContain('"Beta, Inc."');
  });
  it("writes the tag token and leaves a missing field empty", () => {
    const p = parseCsv(groupsToCsv(groups()));
    const rows = p.ok ? p.rows.slice(1) : [];
    expect(rows.find((r) => r[5] === "c")!.slice(6, 9)).toEqual(["", "unknown", ""]);
  });
  it("writes each member's nearest other place in metres and whether it links its group", () => {
    const trio = groupPlaces([at("a", 0, 0), at("b", 90, 0), at("c", 180, 0)], 100).groups;
    const p = parseCsv(groupsToCsv(trio));
    const rows = p.ok ? p.rows.slice(1) : [];
    expect(rows.map((r) => [r[5], r[11], r[12]]).sort()).toEqual([["a", "90", "no"], ["b", "90", "yes"], ["c", "90", "no"]]);
  });
  it("leaves the link column empty for a group too large to compare", () => {
    const big = Array.from({ length: 405 }, (_, i) => at(`p${i}`, (i % 20) * 5, Math.floor(i / 20) * 5));
    const p = parseCsv(groupsToCsv(groupPlaces(big, 100).groups));
    expect(p.ok && p.rows[1]!.slice(11)).toEqual(["", ""]);
  });
  it("writes only the header for no groups, and a byte order mark only when asked", () => {
    expect(groupsToCsv([])).toBe(WG_CSV_HEADER.join(",") + "\r\n");
    expect(groupsToCsv([]).charCodeAt(0)).not.toBe(0xfeff);
    expect(groupsToCsv([], { bom: true }).charCodeAt(0)).toBe(0xfeff);
  });
  it("leaves the width empty for a group too large to measure", () => {
    const big = Array.from({ length: 405 }, (_, i) => at(`p${i}`, (i % 20) * 5, Math.floor(i / 20) * 5));
    const p = parseCsv(groupsToCsv(groupPlaces(big, 100).groups));
    expect(p.ok && p.rows[1]![4]).toBe("");
  });
});

describe("groupsToText", () => {
  it("starts with the caveat and gives each group a number, a size line and a tag line", () => {
    const t = groupsToText(groups(), "en");
    expect(t.startsWith("Straight-line distances")).toBe(true);
    expect(t).toContain("1. Around Main Street");
    expect(t).toContain("Tags: 1 yes, 1 no");
    expect(t).toContain("2. Around Dee");
  });
  it("lists every member with its id and address", () => {
    const t = groupsToText(groups(), "en");
    expect(t).toContain("- =Alpha (a), 1 Main Street");
    expect(t).toContain("- Name not in the pack (c)");
  });
  it("names the places that link a group", () => {
    const trio = groupPlaces([at("a", 0, 0, { name: "Aa" }), at("b", 90, 0, { name: "Bb" }), at("c", 180, 0, { name: "Cc" })], 100).groups;
    expect(groupsToText(trio, "en")).toContain("Without this place the rest of the group would split into parts more than 100\u00a0m apart: Bb.");
    expect(groupsToText(groups(), "en")).not.toContain("Without");
  });
  it("sketches a group with a legend", () => {
    const t = groupsToText(groups(), "en");
    expect(t).toContain("Layout, north at the top (not to scale):");
    expect(t).toMatch(/\n {3}\| .*[AB]/);
    expect(t).toContain("A = =Alpha (a)");
    expect(t).toContain("B = Beta, Inc. (b)");
  });
  it("leaves the sketch out of a group of more than 26 places", () => {
    const big = Array.from({ length: 27 }, (_, i) => at(`p${i}`, i * 40, 0));
    expect(groupsToText(groupPlaces(big, 100).groups, "en")).not.toContain("Layout");
  });
  it("is in French for French", () => expect(groupsToText(groups(), "fr")).toContain("Autour de Main Street"));
});

describe("files", () => {
  it("name the files for the language and set the type", () => {
    expect(groupsCsvFile(groups(), "fr")).toMatchObject({ name: WG_CSV_NAME.fr, mime: "text/csv;charset=utf-8" });
    expect(groupsTextFile(groups(), "en")).toMatchObject({ name: WG_TEXT_NAME.en, mime: "text/plain;charset=utf-8" });
    expect(groupsCsvFile(groups(), "en").content.charCodeAt(0)).toBe(0xfeff);
  });
});

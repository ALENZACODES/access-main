import { describe, expect, it } from "vitest";
import { parseCsv } from "./csvParse";
import { DUP_CSV_HEADER } from "./duplicateCopy";
import { duplicatesCsvFile, duplicatesTextFile, duplicatesToCsv, duplicatesToText } from "./duplicateExport";
import { findDuplicates } from "./duplicateGroups";
import { place } from "./placeFixtures";

const twin = (id: string, over: Record<string, unknown> = {}) => place(id, { name: "Alpha Hall", address: "5 Elm Street", category: "cafe", lat: 43.65, lon: -79.38, ...over });
const places = [twin("a", { wheelchair: "yes" }), twin("b", { wheelchair: "no", name: "Alpha, \"Hall\"" }), twin("c", { name: "=Evil", address: "9 Oak Ave", lat: 44, lon: -80 }), twin("d", { name: "=Evil", address: "9 Oak Ave", lat: 44, lon: -80 })];
const report = findDuplicates(places);

describe("duplicatesToCsv", () => {
  const csv = duplicatesToCsv(report, places);
  it("has the header and one row for each pair in each group", () => {
    const p = parseCsv(csv);
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.rows[0]).toEqual([...DUP_CSV_HEADER]);
      expect(p.rows).toHaveLength(report.groups.reduce((n, g) => n + g.pairs.length, 0) + 1);
    }
  });
  it("numbers the groups from one", () => {
    const p = parseCsv(csv);
    if (p.ok) expect(new Set(p.rows.slice(1).map((r) => r[0]))).toEqual(new Set(report.groups.map((_, i) => String(i + 1))));
  });
  it("round-trips a name with a comma and quotes, and guards a formula", () => {
    const p = parseCsv(csv);
    if (p.ok) {
      const names = p.rows.slice(1).flatMap((r) => [r[2], r[4]]);
      expect(names).toContain("'=Evil");
      expect(names.some((n) => n === 'Alpha, "Hall"')).toBe(true);
    }
  });
  it("gives the reasons and tags as fixed English tokens", () => {
    const p = parseCsv(csv);
    if (p.ok) {
      const row = p.rows.slice(1).find((r) => r[1] === "a" || r[3] === "a")!;
      expect(row[6]).toMatch(/same-address/);
      expect([row[8], row[9]].sort()).toEqual(["no", "yes"]);
    }
  });
  it("rounds the distance to whole metres and leaves it empty without positions", () => {
    const p = parseCsv(csv);
    if (p.ok) expect(p.rows[1]![7]).toMatch(/^\d+$/);
    const nopos = [twin("a", { lat: null, lon: null }), twin("b", { lat: null, lon: null })];
    const q = parseCsv(duplicatesToCsv(findDuplicates(nopos), nopos));
    if (q.ok) expect(q.rows[1]![7]).toBe("");
  });
  it("ends with CRLF, and has a byte order mark only when asked", () => {
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.startsWith("﻿")).toBe(false);
    expect(duplicatesToCsv(report, places, { bom: true }).startsWith("﻿")).toBe(true);
  });
  it("is only the header when there are no groups", () => {
    expect(duplicatesToCsv(findDuplicates([]), [])).toBe(`${DUP_CSV_HEADER.join(",")}\r\n`);
  });
});

describe("duplicatesToText", () => {
  it("starts with the caveat and says nothing was merged", () => {
    const t = duplicatesToText(report, places, "en");
    expect(t.startsWith("Places that may be the same place.")).toBe(true);
    expect(t).toContain("nothing was merged or removed");
  });
  it("lists every member with its id, address, kind and tag", () => {
    const t = duplicatesToText(report, places, "en");
    expect(t).toContain("(Id a)");
    expect(t).toContain("Address: 5 Elm Street");
    expect(t).toContain("Kind: cafe");
    expect(t).toContain("Tag: yes");
  });
  it("says when members report different tags", () => {
    expect(duplicatesToText(report, places, "en")).toContain("report different wheelchair tags");
  });
  it("writes UNKNOWN for a missing address or kind, never the French word", () => {
    const p2 = [twin("a", { address: null, category: null, lat: 43.65 }), twin("b", { address: null, category: null })];
    const r = findDuplicates(p2, "loose");
    const t = duplicatesToText(r, p2, "fr");
    expect(r.groups).toHaveLength(1);
    expect(t).toContain("UNKNOWN");
    expect(t).not.toMatch(/inconnu/i);
  });
  it("is in French when asked", () => {
    const t = duplicatesToText(report, places, "fr");
    expect(t).toContain("Lieux qui pourraient être un même lieu");
    expect(t).toContain("Adresse");
  });
  it("has no more than one blank line in a row", () => {
    expect(duplicatesToText(report, places, "en")).not.toMatch(/\n\n\n/);
  });
});

describe("files", () => {
  it("are named by language", () => {
    expect(duplicatesCsvFile(report, places, "en").name).toBe("possible-repeats.csv");
    expect(duplicatesCsvFile(report, places, "fr").name).toBe("repetitions-possibles.csv");
    expect(duplicatesTextFile(report, places, "en").name).toBe("possible-repeats.txt");
    expect(duplicatesTextFile(report, places, "fr").name).toBe("repetitions-possibles.txt");
  });
  it("carry the same content as the converters, the CSV with a byte order mark", () => {
    expect(duplicatesTextFile(report, places, "en").content).toBe(duplicatesToText(report, places, "en"));
    expect(duplicatesCsvFile(report, places, "en").content).toBe(duplicatesToCsv(report, places, { bom: true }));
    expect(duplicatesCsvFile(report, places, "en").mime).toContain("text/csv");
  });
});

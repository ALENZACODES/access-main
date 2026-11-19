import { describe, expect, it } from "vitest";
import { containsForbiddenOrg } from "../../../../packages/shared/test/forbiddenOrg";
import { lintCopy } from "./copyLint";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";
import { resolveShortlist, type ShortlistEntry } from "./shortlist";
import { UNKNOWN_CELL, buildShortlistTable, differencesLine, differingColumns, missingNotice, shortlistToCsv, shortlistToText, tableHeaders } from "./shortlistTable";
import { lintFrench } from "./typography";

const TODAY = "2026-11-19";
const OSM = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 };
const raw = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Place ${id}`, wheelchair: "yes", category: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: OSM, ...over });
const parse = (items: unknown[]): PackPlaceRecord[] => [...parsePackPlaces(items).places];
const entry = (id: string): ShortlistEntry => ({ id, addedOn: TODAY });
const resolve = (items: unknown[], ids: string[]) => resolveShortlist(ids.map(entry), parse(items));

describe("tableHeaders", () => {
  it("has nine columns, and a tenth for distance only when asked", () => {
    expect(tableHeaders("en", false)).toEqual(["Place", "Wheelchair tag", "Kind", "Address", "Tier", "Retrieved", "Source", "Licence", "Added to list"]);
    expect(tableHeaders("en", true).at(-1)).toBe("Distance");
    expect(tableHeaders("en", true)).toHaveLength(10);
  });
  it("is French with the same number of columns", () => {
    expect(tableHeaders("fr", false)).toHaveLength(9);
    expect(tableHeaders("fr", false)[8]).toBe("Ajouté à la liste");
    expect(tableHeaders("fr", false)[1]).toBe("Indication pour fauteuil roulant");
    expect(tableHeaders("fr", true).at(-1)).toBe("Distance");
  });
});

describe("buildShortlistTable", () => {
  const items = [raw("a"), raw("b", { name: "", category: "", address: "", provenance: null, wheelchair: "limited" })];
  const table = buildShortlistTable(resolve(items, ["a", "b"]), "en", TODAY);
  it("has one row per found place, in list order, each as wide as the header row", () => {
    expect(table.rows.map((r) => r.id)).toEqual(["a", "b"]);
    for (const row of table.rows) expect(row.cells).toHaveLength(table.headers.length);
  });
  it("states a place's facts as the pack reports them", () => {
    expect(table.rows[0]!.cells).toEqual(["Place a", "Yes", "cafe", "1 Main Street", "Tier 0", "Retrieved 9 days ago", "OpenStreetMap, Geofabrik Ontario extract", "ODbL-1.0", "19 November 2026"]);
  });
  it("writes UNKNOWN for every missing value, and for a tag with no source, never an empty cell or a guess", () => {
    expect(table.rows[1]!.cells).toEqual([UNKNOWN_CELL, UNKNOWN_CELL, UNKNOWN_CELL, UNKNOWN_CELL, "Tier UNKNOWN", UNKNOWN_CELL, UNKNOWN_CELL, UNKNOWN_CELL, "19 November 2026"]);
    expect(table.rows[1]!.name).toBe(UNKNOWN_CELL);
  });
  it("shows a tag with no usable source as UNKNOWN even when the pack says limited", () => {
    const t = buildShortlistTable(resolve([raw("x", { provenance: null, wheelchair: "limited" })], ["x"]), "en", TODAY);
    expect(t.rows[0]!.cells[1]).toBe("UNKNOWN");
  });
  it("shows the tag the pack reports when it has a source", () => {
    const t = buildShortlistTable(resolve([raw("x", { wheelchair: "limited" })], ["x"]), "en", TODAY);
    expect(t.rows[0]!.cells[1]).toBe("Limited");
  });
  it("leaves out places the pack no longer holds", () => {
    const t = buildShortlistTable(resolve(items, ["a", "gone"]), "en", TODAY);
    expect(t.rows.map((r) => r.id)).toEqual(["a"]);
    expect(t.caption).toContain("(1)");
  });
  it("adds a distance column when a starting point is known, UNKNOWN for a place with no position", () => {
    const items2 = [raw("near", { lat: 43.651, lon: -79.38 }), raw("nowhere", { lat: undefined, lon: undefined })];
    const t = buildShortlistTable(resolve(items2, ["near", "nowhere"]), "en", TODAY, { lat: 43.65, lon: -79.38 });
    expect(t.headers.at(-1)).toBe("Distance");
    expect(t.rows[0]!.cells.at(-1)).toMatch(/^\d+\s?m$|^\d+(\.\d)?\s?km$/);
    expect(t.rows[1]!.cells.at(-1)).toBe(UNKNOWN_CELL);
    expect(t.rows.every((r) => r.cells.length === t.headers.length)).toBe(true);
  });
  it("says in the caption that nothing is ranked", () => {
    expect(table.caption).toBe("Shortlisted places side by side (2). Each cell repeats what the pack reports; nothing is ranked.");
  });
  it("is French, with the Niveau UNKNOWN token and clean typography in the caption", () => {
    const fr = buildShortlistTable(resolve(items, ["a", "b"]), "fr", TODAY);
    expect(fr.rows[1]!.cells[4]).toBe("Niveau UNKNOWN");
    expect(fr.rows[0]!.cells[1]).toBe("Oui");
    expect(lintFrench(fr.caption)).toEqual([]);
    expect(fr.caption).toContain(" ;");
  });
  it("passes the copy linter and carries no banned organisation name", () => {
    for (const locale of ["en", "fr"] as const) {
      const t = buildShortlistTable(resolve(items, ["a", "b"]), locale, TODAY);
      for (const line of [t.caption, ...t.headers]) {
        expect(lintCopy(line, locale), `${locale}: ${line}`).toEqual([]);
        expect(containsForbiddenOrg(line)).toBe(false);
      }
    }
  });
  it("has no rows for an empty list", () => {
    expect(buildShortlistTable({ found: [], missing: [] }, "en", TODAY).rows).toEqual([]);
  });
});

describe("order and the added column", () => {
  const items = [raw("a", { name: "Zed Bar" }), raw("b", { name: "" }), raw("c", { name: "Alpha Hall" }), raw("d", { name: "alpha hall" })];
  const resolved = resolve(items, ["a", "b", "c", "d"]);
  it("keeps the order places were added by default", () => {
    expect(buildShortlistTable(resolved, "en", TODAY).rows.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
    expect(buildShortlistTable(resolved, "en", TODAY, null, "added").rows.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("sorts by name with UNKNOWN names last and the id as the tie-break", () => {
    expect(buildShortlistTable(resolved, "en", TODAY, null, "name").rows.map((r) => r.id)).toEqual(["c", "d", "a", "b"]);
  });
  it("does not change the list it sorts", () => {
    const before = resolved.found.map((f) => f.place.id);
    buildShortlistTable(resolved, "en", TODAY, null, "name");
    expect(resolved.found.map((f) => f.place.id)).toEqual(before);
  });
  it("keeps each row's added date with its place when sorted", () => {
    const list: ShortlistEntry[] = [{ id: "a", addedOn: "2026-11-01" }, { id: "c", addedOn: "2026-11-05" }];
    const t = buildShortlistTable(resolveShortlist(list, parse(items)), "en", TODAY, null, "name");
    expect(t.rows.map((r) => [r.id, r.cells[8]])).toEqual([["c", "5 November 2026"], ["a", "1 November 2026"]]);
  });
  it("writes UNKNOWN when the stored date was not a valid date", () => {
    const t = buildShortlistTable(resolveShortlist([{ id: "a", addedOn: null }], parse(items)), "en", TODAY);
    expect(t.rows[0]!.cells[8]).toBe(UNKNOWN_CELL);
  });
  it("writes the date in French", () => {
    expect(buildShortlistTable(resolve(items, ["a"]), "fr", TODAY).rows[0]!.cells[8]).toBe("19 novembre 2026");
  });
  it("does not count the added column as a difference between places", () => {
    const list: ShortlistEntry[] = [{ id: "a", addedOn: "2026-11-01" }, { id: "c", addedOn: "2026-11-05" }];
    const t = buildShortlistTable(resolveShortlist(list, parse([raw("a"), raw("c")])), "en", TODAY);
    expect(differingColumns(t)).toEqual([]);
    expect(t.rows[0]!.cells[8]).not.toBe(t.rows[1]!.cells[8]);
  });
  it("puts the distance after the added column", () => {
    const t = buildShortlistTable(resolve(items, ["a"]), "en", TODAY, { lat: 43.65, lon: -79.38 });
    expect(t.headers.slice(-2)).toEqual(["Added to list", "Distance"]);
  });
});

describe("missingNotice", () => {
  it("is empty for none, singular for one and plural for more", () => {
    expect(missingNotice(0, "en")).toBe("");
    expect(missingNotice(1, "en")).toBe("1 listed place is not in the pack on this device, so nothing about it is known.");
    expect(missingNotice(3, "en")).toBe("3 listed places are not in the pack on this device, so nothing about them is known.");
  });
  it("is French with typography", () => {
    expect(missingNotice(2, "fr")).toBe("2 lieux de la liste ne sont pas dans le pack sur cet appareil : on n’en sait rien.");
    expect(lintFrench(missingNotice(1, "fr"))).toEqual([]);
  });
});

describe("shortlistToText", () => {
  const items = [raw("a"), raw("b", { name: "" })];
  it("is a one-line note for an empty list", () => {
    expect(shortlistToText({ found: [], missing: [] }, "en", TODAY)).toBe("Shortlisted places\nNo places on the list.\n");
    expect(shortlistToText({ found: [], missing: [] }, "fr", TODAY)).toBe("Lieux de la liste\nAucun lieu dans la liste.\n");
  });
  it("has a block per place with its name, tag, source and credit", () => {
    const text = shortlistToText(resolve(items, ["a", "b"]), "en", TODAY);
    expect(text.startsWith("Shortlisted places\n==================\n\nPlace a\n")).toBe(true);
    expect(text).toContain("Wheelchair tag as reported: yes");
    expect(text).toContain("Name UNKNOWN");
    expect((text.match(/© OpenStreetMap contributors/g) ?? []).length).toBe(2);
  });
  it("ends with the missing notice and a final newline", () => {
    const text = shortlistToText(resolve(items, ["a", "gone"]), "en", TODAY);
    expect(text.trimEnd().endsWith("so nothing about it is known.")).toBe(true);
    expect(text.endsWith("\n")).toBe(true);
    expect(text).not.toMatch(/\n\n\n/);
  });
  it("is still a text when every listed place is missing", () => {
    expect(shortlistToText(resolve(items, ["x", "y"]), "en", TODAY)).toContain("2 listed places are not in the pack");
  });
  it("is French with French typography and UNKNOWN as the token", () => {
    const text = shortlistToText(resolve(items, ["a", "b"]), "fr", TODAY);
    expect(text).toContain("Lieux de la liste");
    for (const line of text.split("\n").filter((l) => !l.startsWith("http"))) expect(lintFrench(line), line).toEqual([]);
    expect(text).toContain("UNKNOWN");
  });
  it("never says a place is verified or accessible", () => {
    for (const locale of ["en", "fr"] as const) expect(shortlistToText(resolve(items, ["a", "b"]), locale, TODAY)).not.toMatch(/verified|vérifi|is accessible|est accessible/i);
  });
});

describe("differingColumns and differencesLine", () => {
  const items = [raw("a"), raw("b", { wheelchair: "no", address: "2 Side Street" }), raw("c")];
  it("lists the columns, by position, where any two places differ, never the name column", () => {
    const t = buildShortlistTable(resolve(items, ["a", "b"]), "en", TODAY);
    expect(differingColumns(t)).toEqual([1, 3]);
  });
  it("sees a difference only when two rows are not the same, so equal rows give none", () => {
    expect(differingColumns(buildShortlistTable(resolve(items, ["a", "c"]), "en", TODAY))).toEqual([]);
  });
  it("is empty for fewer than two places", () => {
    expect(differingColumns(buildShortlistTable(resolve(items, ["a"]), "en", TODAY))).toEqual([]);
    expect(differingColumns(buildShortlistTable({ found: [], missing: [] }, "en", TODAY))).toEqual([]);
  });
  it("counts a difference in the last row of three", () => {
    expect(differingColumns(buildShortlistTable(resolve([raw("a"), raw("c"), raw("b", { wheelchair: "no" })], ["a", "c", "b"]), "en", TODAY))).toEqual([1]);
  });
  it("names the differing columns in the sentence", () => {
    const t = buildShortlistTable(resolve(items, ["a", "b"]), "en", TODAY);
    expect(differencesLine(t, "en")).toBe("These columns differ between the places: Wheelchair tag, Address.");
  });
  it("says the places report the same when no column differs", () => {
    const t = buildShortlistTable(resolve(items, ["a", "c"]), "en", TODAY);
    expect(differencesLine(t, "en")).toBe("The places report the same in every column shown, apart from their names.");
  });
  it("is empty for one place", () => {
    expect(differencesLine(buildShortlistTable(resolve(items, ["a"]), "en", TODAY), "en")).toBe("");
  });
  it("is French with the colon spaced and clean typography", () => {
    const t = buildShortlistTable(resolve(items, ["a", "b"]), "fr", TODAY);
    expect(differencesLine(t, "fr")).toBe("Ces colonnes diffèrent d’un lieu à l’autre\u00a0: Indication pour fauteuil roulant, Adresse.");
    expect(lintFrench(differencesLine(t, "fr"))).toEqual([]);
    expect(lintFrench(differencesLine(buildShortlistTable(resolve(items, ["a", "c"]), "fr", TODAY), "fr"))).toEqual([]);
  });
  it("compares the text of a cell, so UNKNOWN in two places is the same", () => {
    const t = buildShortlistTable(resolve([raw("a", { address: "" }), raw("b", { address: "" })], ["a", "b"]), "en", TODAY);
    expect(differingColumns(t)).toEqual([]);
  });
});

describe("shortlistToCsv", () => {
  const items = [raw("a"), raw("b", { name: "=SUM(A1)" })];
  it("has the pack export header and one row per found place, in list order", () => {
    const rows = shortlistToCsv(resolve(items, ["b", "a"])).trimEnd().split("\r\n");
    expect(rows[0]!.startsWith("place_id,")).toBe(true);
    expect(rows).toHaveLength(3);
    expect(rows[1]!.startsWith("b,")).toBe(true);
    expect(rows[2]!.startsWith("a,")).toBe(true);
  });
  it("neutralises a name a spreadsheet could read as a formula", () => {
    expect(shortlistToCsv(resolve(items, ["b"]))).toContain(",'=SUM(A1),");
  });
  it("leaves out places the pack no longer holds", () => {
    expect(shortlistToCsv(resolve(items, ["a", "gone"])).trimEnd().split("\r\n")).toHaveLength(2);
  });
  it("is only the header for an empty list, and can carry a byte order mark", () => {
    expect(shortlistToCsv({ found: [], missing: [] }).trimEnd().split("\r\n")).toHaveLength(1);
    expect(shortlistToCsv({ found: [], missing: [] }, { bom: true }).charCodeAt(0)).toBe(0xfeff);
  });
  it("carries the tier as stated and UNKNOWN when none is", () => {
    const rows = shortlistToCsv(resolve([raw("a", { provenance: { ...OSM, tier: undefined } })], ["a"])).trimEnd().split("\r\n");
    expect(rows[1]).toContain("UNKNOWN");
  });
});

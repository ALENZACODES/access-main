import { describe, expect, it } from "vitest";
import { MAX_ORDER_ROWS, buildOrderTable, orderTableNote, sortKeyHeading, sortKeyText } from "./packSortKeys";
import { PACK_SORTS, sortPlaces } from "./packSort";
import { PROV, place, varied } from "./placeFixtures";

const on = (date: string) => ({ ...PROV, retrieved_at: date });
const full = place("f", { name: "Full", category: "fast_food", address: "20 Dundas St E", wheelchair: "limited", provenance: on("2026-03-01") });
const bare = place("b", { name: null, category: null, address: null, wheelchair: null, provenance: null });

describe("headings", () => {
  it("name the field the order used, in both languages", () => {
    expect(PACK_SORTS.map((s) => sortKeyHeading(s, "en"))).toEqual(["Name", "Name", "Name", "Kind", "Street and number", "Wheelchair tag", "Retrieved", "Retrieved"]);
    expect(PACK_SORTS.map((s) => sortKeyHeading(s, "fr"))).toEqual(["Nom", "Nom", "Nom", "Type", "Rue et numéro", "Étiquette fauteuil roulant", "Consulté", "Consulté"]);
  });
});

describe("the value of the field", () => {
  it("name", () => {
    expect(sortKeyText("name", full, "en")).toBe("Full");
    expect(sortKeyText("name-desc", full, "en")).toBe("Full");
    expect(sortKeyText("default", full, "en")).toBe("Full");
  });
  it("kind reads underscores as spaces and keeps the pack's own words", () => expect(sortKeyText("kind", full, "en")).toBe("fast food"));
  it("street gives the number and the street as written for a reader", () => expect(sortKeyText("street", full, "en")).toBe("20 Dundas Street East"));
  it("street without a number is just the street", () => expect(sortKeyText("street", place("s", { address: "Main Street" }), "en")).toBe("Main Street"));
  it("tag in each language", () => {
    expect(sortKeyText("tag", full, "en")).toBe("Limited");
    expect(sortKeyText("tag", full, "fr")).toBe("Limité");
  });
  it("date in each language", () => {
    expect(sortKeyText("oldest", full, "en")).toBe("1 March 2026");
    expect(sortKeyText("newest", full, "fr")).toBe("1er mars 2026");
  });
  it("says UNKNOWN for each field the pack does not state", () => {
    for (const s of PACK_SORTS) expect(sortKeyText(s, bare, "en"), s).toBe("UNKNOWN");
  });
  it("a PO box or an address with no street is UNKNOWN for street", () => expect(sortKeyText("street", place("p", { address: "PO Box 12" }), "en")).toBe("UNKNOWN"));
});

describe("the table", () => {
  const ps = [full, bare, place("c", { name: "Cee", category: "cafe", address: "7 Queen Street West", wheelchair: "yes", provenance: on("2026-01-01") })];
  it("has a row per place with a position from 1", () => {
    const t = buildOrderTable(sortPlaces(ps, "name"), "name", "en");
    expect(t.rows.map((r) => r.position)).toEqual([1, 2, 3]);
    expect(t.rows.map((r) => r.id)).toEqual(["c", "f", "b"]);
    expect(t.total).toBe(3);
    expect(t.truncated).toBe(false);
  });
  it("writes UNKNOWN for a missing name and the key", () => {
    const row = buildOrderTable([bare], "street", "en").rows[0]!;
    expect(row).toEqual({ position: 1, id: "b", name: "UNKNOWN", key: "UNKNOWN", thenKey: null });
  });
  it("follows the order given, not the order the places were written in", () => {
    const t = buildOrderTable(sortPlaces(ps, "oldest"), "oldest", "en");
    expect(t.rows.map((r) => r.key)).toEqual(["1 January 2026", "1 March 2026", "UNKNOWN"]);
  });
  it("cuts at the limit and says how many", () => {
    const big = varied(2, 30);
    const t = buildOrderTable(big, "name", "en", 10);
    expect(t.rows).toHaveLength(10);
    expect(t.total).toBe(30);
    expect(t.truncated).toBe(true);
    expect(orderTableNote(t, "en")).toBe("Showing the first 10 of 30 places. The saved files hold all of them.");
    expect(orderTableNote(t, "fr")).toBe("Affichage des 10 premiers lieux sur 30. Les fichiers enregistrés les contiennent tous.");
  });
  it("says nothing when nothing is cut", () => expect(orderTableNote(buildOrderTable(ps, "name", "en"), "en")).toBe(""));
  it("treats a limit equal to the count as not cut, and a limit of zero as all cut", () => {
    expect(buildOrderTable(ps, "name", "en", 3).truncated).toBe(false);
    const zero = buildOrderTable(ps, "name", "en", 0);
    expect(zero.rows).toEqual([]);
    expect(zero.truncated).toBe(true);
  });
  it("ignores a negative or fractional limit sensibly", () => {
    expect(buildOrderTable(varied(4, 10), "name", "en", -5).rows).toEqual([]);
    expect(buildOrderTable(ps, "name", "en", 1.9).rows).toHaveLength(1);
  });
  it("shows up to 200 rows by default", () => {
    expect(MAX_ORDER_ROWS).toBe(200);
    const t = buildOrderTable(varied(3, 250), "name", "en");
    expect(t.rows).toHaveLength(200);
    expect(t.truncated).toBe(true);
  });
  it("carries the column heading", () => expect(buildOrderTable(ps, "tag", "fr").keyHeading).toBe("Étiquette fauteuil roulant"));
});

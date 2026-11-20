import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { PROV, bare, place } from "./placeFixtures";
import { SHEET_FIELDS, UNKNOWN, buildPlaceSheet, positionText, sheetFieldLabel, sheetSummary, tagValue } from "./placeSheet";
import { lintFrench } from "./typography";

const TODAY = "2026-11-19";
const row = (sheet: ReturnType<typeof buildPlaceSheet>, field: string) => sheet.rows.find((r) => r.field === field)!;

describe("the fields", () => {
  it("are nine, in the order the table shows them", () => {
    expect([...SHEET_FIELDS]).toEqual(["name", "tag", "kind", "address", "position", "source", "licence", "retrieved", "tier"]);
  });
  it("have a different label each, in both languages", () => {
    for (const locale of ["en", "fr"] as const) expect(new Set([...SHEET_FIELDS, "note" as const].map((f) => sheetFieldLabel(f, locale))).size).toBe(10);
  });
  it("name the tag column as the rest of the App does", () => {
    expect(sheetFieldLabel("tag", "en")).toBe("Wheelchair tag");
    expect(sheetFieldLabel("tag", "fr")).toBe("Indication pour fauteuil roulant");
  });
});

describe("buildPlaceSheet for a place the pack describes fully", () => {
  const sheet = buildPlaceSheet(place("a", { tier: 0 }), "en", TODAY);
  it("has one row for each field, in order", () => {
    expect(sheet.rows.map((r) => r.field)).toEqual([...SHEET_FIELDS]);
  });
  it("gives each value as the pack states it", () => {
    expect(row(sheet, "name").value).toBe("Place a");
    expect(row(sheet, "tag").value).toBe("Yes");
    expect(row(sheet, "kind").value).toBe("cafe");
    expect(row(sheet, "address").value).toBe("1 Main Street");
    expect(row(sheet, "position").value).toBe("43.65000, -79.38000");
    expect(row(sheet, "source").value).toBe("OpenStreetMap, Geofabrik Ontario extract");
    expect(row(sheet, "licence").value).toBe("ODbL 1.0");
    expect(row(sheet, "retrieved").value).toBe("10 November 2026 (Retrieved 9 days ago)");
    expect(row(sheet, "tier").value).toBe("Tier 0");
  });
  it("marks every row known with no reason, and has no gaps", () => {
    expect(sheet.rows.every((r) => r.known && r.reason === null)).toBe(true);
    expect([sheet.recorded, sheet.total, sheet.gaps]).toEqual([9, 9, []]);
  });
  it("gives a map link for the person's own maps app", () => {
    expect(sheet.geoHref).toBe("geo:43.65000,-79.38000");
  });
  it("uses the place's name as its title, and its id", () => {
    expect([sheet.id, sheet.title]).toEqual(["a", "Place a"]);
  });
  it("has no stale notice for a recent retrieval", () => {
    expect(sheet.staleNotice).toBeNull();
  });
});

describe("buildPlaceSheet for a place the pack says little about", () => {
  const sheet = buildPlaceSheet(bare("z"), "en", TODAY);
  it("says UNKNOWN, with a reason, in every row", () => {
    for (const r of sheet.rows) {
      expect(r.value, r.field).toBe(UNKNOWN);
      expect(r.known).toBe(false);
      expect(r.reason, r.field).toMatch(/\S/);
    }
  });
  it("counts none recorded and lists all nine gaps in table order", () => {
    expect([sheet.recorded, sheet.total]).toEqual([0, 9]);
    expect(sheet.gaps).toEqual(["Name", "Wheelchair tag", "Kind", "Address", "Map point", "Source", "Licence", "Retrieved", "Tier"]);
  });
  it("has no map link and a title that says the name is UNKNOWN", () => {
    expect(sheet.geoHref).toBeNull();
    expect(sheet.title).toMatch(/UNKNOWN|unknown/i);
  });
  it("gives a plain reason for a missing field, and a specific one for the tag", () => {
    expect(row(sheet, "address").reason).toBe("The pack does not give an address for this place.");
    expect(row(sheet, "tag").reason).toBe("The pack gives no wheelchair tag for this place.");
  });
  it("makes no row from a tier the pack did not state", () => {
    expect(row(sheet, "tier").value).toBe("UNKNOWN");
  });
});

describe("the tag's reason", () => {
  it("says a value this App does not recognise is not recognised", () => {
    expect(row(buildPlaceSheet(place("a", { wheelchair: "weird" }), "en", TODAY), "tag").reason).toBe("The pack gives a tag value this App does not recognise.");
  });
  it("says a tag with no usable source is not shown as known", () => {
    const s = buildPlaceSheet(place("a", { provenance: null }), "en", TODAY);
    expect(row(s, "tag").value).toBe("UNKNOWN");
    expect(row(s, "tag").reason).toBe("The tag has no usable source, so it is not shown as known.");
  });
  it("is in French too", () => {
    expect(row(buildPlaceSheet(place("a", { wheelchair: "weird" }), "fr", TODAY), "tag").reason).toBe("Le pack donne une valeur d’indication que l’application ne reconnaît pas.");
    expect(row(buildPlaceSheet(place("a", { provenance: null }), "fr", TODAY), "tag").reason).toBe("L’indication n’a pas de source utilisable\u00a0: elle n’est donc pas présentée comme connue.");
  });
});

describe("single gaps", () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ["name", { name: null }, "Name"],
    ["kind", { category: null }, "Kind"],
    ["address", { address: null }, "Address"],
    ["position", { lat: null, lon: null }, "Map point"],
    ["position (only latitude)", { lon: null }, "Map point"],
  ];
  for (const [what, over, label] of cases) {
    it(`a place with no ${what} has that one gap and nothing else UNKNOWN`, () => {
      const s = buildPlaceSheet(place("a", { tier: 0, ...over }), "en", TODAY);
      expect(s.gaps).toEqual([label]);
      expect(s.recorded).toBe(8);
    });
  }
  it("a place with no tier states UNKNOWN for the tier only", () => {
    const s = buildPlaceSheet(place("a", { provenance: { ...PROV, tier: undefined } }), "en", TODAY);
    expect(s.gaps).toEqual(["Tier"]);
  });
  it("a place with no provenance is UNKNOWN for source, licence and retrieval, and for the tag", () => {
    const s = buildPlaceSheet(place("a", { provenance: null }), "en", TODAY);
    expect(s.gaps).toEqual(expect.arrayContaining(["Wheelchair tag", "Source", "Licence", "Retrieved"]));
  });
});

describe("the note", () => {
  it("is shown when the pack has one, and is not counted among the nine", () => {
    const s = buildPlaceSheet(place("a", { wheelchair_description: "Side door at the back" }), "en", TODAY);
    expect(s.rows.at(-1)).toMatchObject({ field: "note", value: "Side door at the back", known: true });
    expect(s.total).toBe(9);
    expect(s.rows).toHaveLength(10);
  });
  it("is left out, not shown as UNKNOWN, when the pack has none", () => {
    expect(buildPlaceSheet(place("a"), "en", TODAY).rows.some((r) => r.field === "note")).toBe(false);
  });
});

describe("age and stale", () => {
  it("flags details retrieved over a year ago", () => {
    const s = buildPlaceSheet(place("a", { provenance: { ...PROV, retrieved_at: "2025-01-01" } }), "en", TODAY);
    expect(s.staleNotice).toMatch(/\S/);
  });
  it("does not flag one retrieved exactly a year ago", () => {
    expect(buildPlaceSheet(place("a", { provenance: { ...PROV, retrieved_at: "2025-11-19" } }), "en", TODAY).staleNotice).toBeNull();
  });
  it("says today when retrieved today", () => {
    const s = buildPlaceSheet(place("a", { provenance: { ...PROV, retrieved_at: TODAY } }), "en", TODAY);
    expect(row(s, "retrieved").value).toContain("Retrieved today");
  });
});

describe("tagValue and positionText", () => {
  it("write the pack's words, and the token UNKNOWN in both languages", () => {
    expect((["yes", "limited", "no", "designated"] as const).map((t) => tagValue(t, "en"))).toEqual(["Yes", "Limited", "No", "Designated"]);
    expect((["yes", "limited", "no", "designated"] as const).map((t) => tagValue(t, "fr"))).toEqual(["Oui", "Limité", "Non", "Réservé"]);
    expect(tagValue("unknown", "en")).toBe("UNKNOWN");
    expect(tagValue("unknown", "fr")).toBe("UNKNOWN");
  });
  it("write five decimals with a point in both languages", () => {
    expect(positionText({ lat: 43.6532, lon: -79.3832 })).toBe("43.65320, -79.38320");
    expect(positionText({ lat: 0, lon: 0 })).toBe("0.00000, 0.00000");
  });
});

describe("sheetSummary", () => {
  it("counts what is recorded and names the gaps, and says it is not a rating", () => {
    const s = buildPlaceSheet(place("a", { address: null, lat: null, lon: null, tier: 0 }), "en", TODAY);
    expect(sheetSummary(s, "en")).toBe("The pack gives 7 of 9 details for this place. UNKNOWN: Address, Map point.");
    expect(sheetSummary(buildPlaceSheet(place("a", { address: null, lat: null, lon: null, tier: 0 }), "fr", TODAY), "fr")).toBe("Le pack donne 7 détails sur 9 pour ce lieu. UNKNOWN\u00a0: Adresse, Point de carte.");
  });
  it("has no gap list when nothing is missing", () => {
    expect(sheetSummary(buildPlaceSheet(place("a", { tier: 0 }), "en", TODAY), "en")).toBe("The pack gives 9 of 9 details for this place.");
  });
  it("makes no claim about the place being better, easier or safer, or the data being right", () => {
    for (const locale of ["en", "fr"] as const) {
      const s = sheetSummary(buildPlaceSheet(bare("z"), locale, TODAY), locale);
      expect(s).not.toMatch(/\b(better|easier|safer|score|rating|complete|accurate)\b|meilleur|plus facile|exact|complet/i);
    }
  });
});

describe("copy", () => {
  it("passes the copy check and the French typography check for every reason and the summary", () => {
    const places = [bare("z"), place("a", { wheelchair: "weird" }), place("b", { provenance: null }), place("c", { wheelchair_description: "Side door" })];
    for (const locale of ["en", "fr"] as const) {
      for (const p of places) {
        const s = buildPlaceSheet(p, locale, TODAY);
        const lines = [sheetSummary(s, locale), ...s.rows.flatMap((r) => [r.label, r.reason ?? ""]).filter(Boolean)];
        for (const line of lines) {
          expect(lintCopy(line, locale), line).toEqual([]);
          if (locale === "fr") expect(lintFrench(line), line).toEqual([]);
        }
      }
    }
  });
  it("never uses the French word for UNKNOWN", () => {
    const s = buildPlaceSheet(bare("z"), "fr", TODAY);
    expect(JSON.stringify(s)).not.toMatch(/INCONN/i);
  });
  it("does not change the place it is given", () => {
    const p = place("a", { wheelchair_description: "x" });
    const copy = JSON.stringify(p);
    buildPlaceSheet(p, "en", TODAY);
    expect(JSON.stringify(p)).toBe(copy);
  });
});

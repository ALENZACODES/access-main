import { describe, expect, it } from "vitest";
import { bare, place, varied } from "./placeFixtures";
import { buildPlaceSheet } from "./placeSheet";
import { TEXT_FILENAMES, placeSheetToText } from "./placeSheetText";
import { lintFrench } from "./typography";

const TODAY = "2026-11-19";
const text = (p = place("a"), locale: "en" | "fr" = "en") => placeSheetToText(buildPlaceSheet(p, locale, TODAY), locale);

describe("placeSheetToText", () => {
  it("starts with the title and the count sentence", () => {
    const l = text().split("\n");
    expect(l[0]).toBe("Place a");
    expect(l[1]).toBe("The pack gives 9 of 9 details for this place.");
  });
  it("has one line per detail, label then value", () => {
    const t = text();
    expect(t).toContain("\nName: Place a\n");
    expect(t).toContain("\nMap point: 43.65000, -79.38000\n");
    expect(t).toContain("\nLicence: ODbL 1.0\n");
  });
  it("puts UNKNOWN and its reason on the line of each gap", () => {
    const t = text(bare("z"));
    expect(t).toContain("\nAddress: UNKNOWN. The pack does not give an address for this place.\n");
    expect(t.match(/: UNKNOWN\./g)).toHaveLength(9);
  });
  it("includes the stale notice only when there is one", () => {
    const old = place("a", { provenance: { source_name: "S", licence: "ODbL-1.0", retrieved_at: "2024-01-01", tier: 0 } });
    expect(text(old).split("\n")[2]).toMatch(/\S/);
    expect(text().split("\n")[2]).toBe("");
  });
  it("includes the note when the pack has one", () => {
    expect(text(place("a", { wheelchair_description: "Side door" }))).toContain("\nNote: Side door\n");
  });
  it("ends with the line that it is not a check of the place, then one LF", () => {
    expect(text().endsWith("This is what the pack reports and not a check of the place.\n")).toBe(true);
  });
  it("uses LF only", () => {
    expect(text(bare("z"))).not.toContain("\r");
  });
  it("spaces the colon before it in French and never uses the French word for UNKNOWN", () => {
    const t = text(bare("z"), "fr");
    expect(t).toContain("\nAdresse\u00a0: UNKNOWN. Le pack ne donne aucune adresse pour ce lieu.\n");
    expect(t).not.toMatch(/INCONN/i);
    for (const line of t.split("\n")) expect(lintFrench(line), line).toEqual([]);
  });
  it("is the same for the same input and changes nothing it is given", () => {
    const p = place("a");
    const s = buildPlaceSheet(p, "en", TODAY);
    const before = JSON.stringify(s);
    expect(placeSheetToText(s, "en")).toBe(placeSheetToText(s, "en"));
    expect(JSON.stringify(s)).toBe(before);
  });
  it("makes a line for every row of every generated place", () => {
    for (const p of varied(17, 30)) {
      const s = buildPlaceSheet(p, "en", TODAY);
      const lines = placeSheetToText(s, "en").split("\n");
      for (const row of s.rows) expect(lines.some((l) => l.startsWith(`${row.label}: `))).toBe(true);
    }
  });
  it("has file names in both languages", () => {
    expect(TEXT_FILENAMES).toEqual({ en: "place-details.txt", fr: "details-du-lieu.txt" });
  });
});

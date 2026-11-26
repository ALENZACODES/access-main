import { describe, expect, it } from "vitest";
import { SAME_NAME_FILTERS, SAME_NAME_ORDERS, SAME_NAME_SIZES, buildSameName, listSameName } from "./sameName";
import { SAME_NAME_CSV_FILENAMES, SAME_NAME_FILENAMES, placesCount, sameNameCaveat, sameNameEmptyText, sameNameFilterLabel, sameNameHeading, sameNameMemberText, sameNameOrderHelp, sameNameOrderLabel, sameNameSizeLabel, sameNameSummary, sameNameTagMix, sameNameTagsLine, sameNameToCsv, sameNameToText } from "./sameNameCopy";
import { bare, place } from "./placeFixtures";
import { lintFrench } from "./typography";

const FROM = { lat: 43.65, lon: -79.4 };
const at = (id: string, name: string | null, lon: number, over: Record<string, unknown> = {}) => place(id, { name, lat: 43.65, lon, ...over });
const ps = [at("t1", "Tim Hortons", -79.399, { wheelchair: "yes", address: "1 King St" }), at("t2", "Tim Hortons #2", -79.3, { wheelchair: "no", address: null }), at("t3", "TIM HORTONS", -79.2, { wheelchair: "no" }), at("l1", "Café, Léa", -79.41), at("l2", "Cafe Lea", -79.0), at("solo", "Solo", -79.1), bare("x")];
const r = buildSameName(ps, FROM);
const listed = listSameName(r, "count", 2, "all", "en");
const LOCALES = ["en", "fr"] as const;

describe("counts", () => {
  it("English is singular only for one; French for zero and one", () => {
    expect(placesCount(1, "en")).toBe("1 place");
    expect(placesCount(0, "en")).toBe("0 places");
    expect(placesCount(2, "en")).toBe("2 places");
    expect(placesCount(0, "fr")).toBe("0 lieu");
    expect(placesCount(1, "fr")).toBe("1 lieu");
    expect(placesCount(3, "fr")).toBe("3 lieux");
  });
});

describe("labels", () => {
  it("every choice has a distinct label in each language, and French differs from English", () => {
    for (const l of LOCALES) {
      expect(new Set(SAME_NAME_ORDERS.map((o) => sameNameOrderLabel(o, l))).size).toBe(3);
      expect(new Set(SAME_NAME_SIZES.map((n) => sameNameSizeLabel(n, l))).size).toBe(3);
      expect(new Set(SAME_NAME_FILTERS.map((f) => sameNameFilterLabel(f, l))).size).toBe(2);
    }
    for (const o of SAME_NAME_ORDERS) expect(sameNameOrderLabel(o, "fr")).not.toBe(sameNameOrderLabel(o, "en"));
  });
  it("the nearest help says what to do without a point", () => {
    expect(sameNameOrderHelp("nearest", false, "en")).toMatch(/Type a point above/);
    expect(sameNameOrderHelp("nearest", true, "en")).toMatch(/closest place/);
    expect(sameNameOrderHelp("count", false, "en")).toMatch(/most places/);
    expect(sameNameOrderHelp("name", true, "fr")).toMatch(/alphabétique/);
  });
  it("the caveat says unrelated and nothing better", () => {
    expect(sameNameCaveat("en")).toMatch(/may be unrelated/);
    expect(sameNameCaveat("en")).toMatch(/nothing here says one is better/);
    expect(sameNameCaveat("fr")).toMatch(/aucun lien/);
  });
});

describe("sentences", () => {
  it("summarises shared names, names of their own and unusable names", () => {
    expect(sameNameSummary(r, 2, "en")).toBe("2 names are shared by the places on screen. 1 place with a name of their own. 1 place with no usable name: UNKNOWN.");
    expect(sameNameSummary({ groups: [], alone: 3, unnamed: 0 }, 1, "en")).toBe("1 name is shared by the places on screen. 3 places with a name of their own.");
    expect(sameNameSummary(r, 2, "fr")).toContain("2 noms sont partagés");
    expect(sameNameSummary(r, 2, "fr")).toContain("sans nom utilisable\u00a0: UNKNOWN");
  });
  it("says why a list is empty", () => {
    expect(sameNameEmptyText({ groups: [], alone: 2, unnamed: 0 }, "en")).toBe("No two places on screen share a name.");
    expect(sameNameEmptyText(r, "en")).toBe("No shared name matches these choices.");
    expect(sameNameEmptyText(r, "fr")).toContain("ne correspond");
  });
  it("counts the tags in a fixed order", () => {
    const tim = listed.find((g) => g.key === "tim hortons")!;
    expect(sameNameTagMix(tim, "en")).toBe("Yes 1, No 2");
    expect(sameNameTagsLine(tim, "en")).toBe("The wheelchair tags differ: Yes 1, No 2.");
    const lea = listed.find((g) => g.key === "cafe lea")!;
    expect(sameNameTagsLine(lea, "en")).toMatch(/^All carry the same wheelchair tag: Yes 2\.$/);
  });
  it("heads a group with its label and size", () => {
    expect(sameNameHeading(listed[0]!, "en")).toBe(`${listed[0]!.label}: 3 places`);
    expect(sameNameHeading(listed[0]!, "fr")).toBe(`${listed[0]!.label}\u00a0: 3 lieux`);
  });
  it("writes a member with UNKNOWN for no address, and a distance only on request", () => {
    const m = listed[0]!.members.find((x) => x.id === "t2")!;
    expect(sameNameMemberText(m, "en", false)).toBe("UNKNOWN; wheelchair tag No");
    expect(sameNameMemberText(m, "en", true)).toMatch(/^UNKNOWN; wheelchair tag No, .* from the point typed$/);
    expect(sameNameMemberText({ ...m, metres: null }, "en", true)).toBe("UNKNOWN; wheelchair tag No");
    expect(sameNameMemberText(m, "fr", true)).toMatch(/à .* du point saisi/);
  });
});

describe("text file", () => {
  for (const l of LOCALES) {
    it(`${l}: has the caveat, a heading and a line for each member, and ends with one newline`, () => {
      const txt = sameNameToText(r, listed, l);
      expect(txt.endsWith("\n")).toBe(true);
      expect(txt.endsWith("\n\n")).toBe(false);
      expect(txt).toContain(sameNameCaveat(l));
      for (const g of listed) {
        expect(txt).toContain(sameNameHeading(g, l));
        for (const m of g.members) expect(txt).toContain(`(${m.id})`);
      }
    });
  }
  it("never carries a distance from the point typed", () => {
    expect(sameNameToText(r, listed, "en")).not.toMatch(/from the point typed|\d\s*(m|km)\b/);
    expect(sameNameToText(r, listed, "fr")).not.toMatch(/du point saisi/);
  });
  it("says so when nothing is listed", () => {
    expect(sameNameToText(r, [], "en")).toContain("No shared name matches these choices.");
  });
});

describe("csv file", () => {
  it("has a BOM, CRLF lines and seven columns", () => {
    const csv = sameNameToCsv(listed, "en");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const lines = csv.slice(1).split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(1 + 5);
    expect(lines[0]).toBe("Name,Places with this name,Tags differ,Place,Id,Address,Wheelchair tag");
    for (const l of lines) expect(l.replace(/"(?:[^"]|"")*"/g, "x").split(",")).toHaveLength(7);
  });
  it("has no distance column and no number from the point typed", () => {
    expect(sameNameToCsv(listed, "en").toLowerCase()).not.toMatch(/metre|distance|from the point/);
  });
  it("quotes a name with a comma and defuses a formula", () => {
    const g = buildSameName([at("a", "=SUM(1+1)", 1), at("b", "=SUM(1+1)", 2), at("c", "A, B", 3), at("d", "A, B", 4)], null);
    const csv = sameNameToCsv(g.groups, "en");
    expect(csv).toContain("'=SUM(1+1)");
    expect(csv).toContain('"A, B"');
  });
  it("says yes or no for differing tags, and UNKNOWN for a missing address or tag", () => {
    const csv = sameNameToCsv(listed, "en");
    expect(csv).toMatch(/Tim Hortons,3,yes,/);
    expect(csv).toMatch(/,t2,UNKNOWN,No\r\n/);
    expect(sameNameToCsv(listed, "fr")).toMatch(/,oui,/);
  });
  it("names four different files", () => {
    expect(new Set([...Object.values(SAME_NAME_FILENAMES), ...Object.values(SAME_NAME_CSV_FILENAMES)]).size).toBe(4);
  });
});

describe("French typography", () => {
  it("every French string passes lintFrench", () => {
    const out = [sameNameCaveat("fr"), sameNameSummary(r, 2, "fr"), sameNameEmptyText(r, "fr"), sameNameEmptyText({ groups: [], alone: 0, unnamed: 0 }, "fr")];
    for (const o of SAME_NAME_ORDERS) out.push(sameNameOrderLabel(o, "fr"), sameNameOrderHelp(o, true, "fr"), sameNameOrderHelp(o, false, "fr"));
    for (const n of SAME_NAME_SIZES) out.push(sameNameSizeLabel(n, "fr"));
    for (const f of SAME_NAME_FILTERS) out.push(sameNameFilterLabel(f, "fr"));
    for (const g of listed) {
      out.push(sameNameHeading(g, "fr"), sameNameTagsLine(g, "fr"));
      for (const m of g.members) out.push(sameNameMemberText(m, "fr", true), sameNameMemberText(m, "fr", false));
    }
    out.push(...sameNameToText(r, listed, "fr").split("\n"));
    for (const s of out) expect(lintFrench(s), s).toEqual([]);
  });
});

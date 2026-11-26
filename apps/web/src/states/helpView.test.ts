import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { help } from "./helpFixtures";
import { pickText } from "./helpText";
import { EMPTY_HELP_QUERY, HELP_SORTS, announceHelp, foldHelpText, isHelpSort, matchesHelp, rowFor, viewHelp, type HelpQuery } from "./helpView";
import { parseHelpNumbers } from "./packHelp";

const shipped = parseHelpNumbers((JSON.parse(contentText) as { help_numbers: unknown[] }).help_numbers).items;
const q = (over: Partial<HelpQuery> = {}): HelpQuery => ({ ...EMPTY_HELP_QUERY, ...over });
const ids = (v: ReturnType<typeof viewHelp>) => v.rows.map((r) => r.item.id);

describe("pickText", () => {
  it("gives the page's language when it is there", () => {
    expect(pickText({ en: "Hello", fr: "Bonjour" }, "fr")).toEqual({ text: "Bonjour", lang: "fr", fallback: false });
    expect(pickText({ en: "Hello", fr: "Bonjour" }, "en")).toEqual({ text: "Hello", lang: "en", fallback: false });
  });
  it("falls back to the other language and says so", () => {
    expect(pickText({ en: "Hello", fr: null }, "fr")).toEqual({ text: "Hello", lang: "en", fallback: true });
    expect(pickText({ en: null, fr: "Bonjour" }, "en")).toEqual({ text: "Bonjour", lang: "fr", fallback: true });
  });
  it("gives nothing when neither is there", () => {
    expect(pickText({ en: null, fr: null }, "en")).toBeNull();
  });
});

describe("foldHelpText and matchesHelp", () => {
  it("folds case, accents and spaces", () => {
    expect(foldHelpText("  Santé   811 ")).toBe("sante 811");
  });
  const row = rowFor(help({ id: "x", name: { en: "Poison Centre", fr: "Centre antipoison" }, how: { en: "For suspected poisoning.", fr: "En cas d’empoisonnement." }, contact: "1-800-268-9017" }), "en");
  it("matches blank text", () => {
    expect(matchesHelp(row, "")).toBe(true);
    expect(matchesHelp(row, "  ")).toBe(true);
  });
  it("finds a name in either language, from either page language", () => {
    expect(matchesHelp(row, "poison")).toBe(true);
    expect(matchesHelp(row, "antipoison")).toBe(true);
    expect(matchesHelp(rowFor(row.item, "fr"), "poison centre")).toBe(true);
  });
  it("finds a word of the description without its accent", () => {
    expect(matchesHelp(row, "empoisonnement")).toBe(true);
    expect(matchesHelp(row, "EMPOISONNEMENT")).toBe(true);
  });
  it("finds digits of the number, with or without the pack's separators", () => {
    expect(matchesHelp(row, "268")).toBe(true);
    expect(matchesHelp(row, "1-800")).toBe(true);
    expect(matchesHelp(row, "18002689017")).toBe(true);
    expect(matchesHelp(row, "999")).toBe(false);
  });
  it("needs every word", () => {
    expect(matchesHelp(row, "poison 268")).toBe(true);
    expect(matchesHelp(row, "poison zzz")).toBe(false);
  });
  it("finds the id", () => {
    expect(matchesHelp(row, "x")).toBe(true);
  });
  it("does not search the source or licence", () => {
    expect(matchesHelp(row, "desk check")).toBe(false);
  });
});

describe("viewHelp on the shipped pack", () => {
  it("keeps the pack's order by default, so the emergency number stays first", () => {
    const v = viewHelp(shipped, EMPTY_HELP_QUERY, "en");
    expect(ids(v)).toEqual(["emergency-911", "suicide-crisis-988", "health811", "connexontario", "poison-centre", "two-one-one"]);
    expect(v.shown).toBe(6);
    expect(v.total).toBe(6);
    expect(v.announcement).toBe("6 help numbers shown.");
  });
  it("keeps the pack's order whatever the search, so no result is moved above 911", () => {
    const found = ids(viewHelp(shipped, q({ text: "24 hours" }), "en"));
    expect(found.length).toBeGreaterThan(1);
    expect(found).toEqual(shipped.map((x) => x.id).filter((id) => found.includes(id)));
  });
  it("sorts by name in the page's language, with digits in order", () => {
    expect(ids(viewHelp(shipped, q({ sort: "name" }), "en"))).toEqual(["suicide-crisis-988", "two-one-one", "connexontario", "emergency-911", "health811", "poison-centre"]);
  });
  it("sorts the French names by French rules", () => {
    const v = viewHelp(shipped, q({ sort: "name" }), "fr");
    const names = v.rows.map((r) => r.name?.text);
    expect([...names].sort((a, b) => new Intl.Collator("fr-CA", { numeric: true, sensitivity: "base" }).compare(a!, b!))).toEqual(names);
  });
  it("finds 911 from digits and a French word", () => {
    expect(ids(viewHelp(shipped, q({ text: "911" }), "en"))).toEqual(["emergency-911"]);
    expect(ids(viewHelp(shipped, q({ text: "urgence" }), "en"))).toEqual(["emergency-911"]);
    expect(ids(viewHelp(shipped, q({ text: "9-8-8" }), "en"))).toEqual(["suicide-crisis-988"]);
  });
  it("says how many match, in both languages", () => {
    expect(viewHelp(shipped, q({ text: "911" }), "en").announcement).toBe("1 of 6 help numbers shown.");
    expect(viewHelp(shipped, q({ text: "zzz" }), "fr").announcement).toBe("Aucun numéro d’aide ne correspond. 6 enregistrés.");
  });
});

describe("rows", () => {
  it("carry the picked name and description and the reading of the number", () => {
    const r = rowFor(help({ contact: "9-8-8" }), "en");
    expect(r.name?.text).toBe("Health811");
    expect(r.how?.fallback).toBe(false);
    expect(r.reading?.kind).toBe("short");
  });
  it("have no reading when there is no number", () => {
    expect(rowFor(help({ contact: null }), "en").reading).toBeNull();
  });
  it("have no name or description when none is saved", () => {
    const r = rowFor(help({ name: { en: null, fr: null }, how: { en: null, fr: null } }), "en");
    expect(r.name).toBeNull();
    expect(r.how).toBeNull();
  });
});

describe("sorting by name", () => {
  it("puts entries with no name last, then by id", () => {
    const v = viewHelp([help({ id: "b", name: { en: null, fr: null } }), help({ id: "a", name: { en: null, fr: null } }), help({ id: "z", name: { en: "Zed", fr: null } })], q({ sort: "name" }), "en");
    expect(ids(v)).toEqual(["z", "a", "b"]);
  });
  it("sorts Line 2 before Line 10", () => {
    const v = viewHelp([help({ id: "a", name: { en: "Line 10", fr: null } }), help({ id: "b", name: { en: "Line 2", fr: null } })], q({ sort: "name" }), "en");
    expect(ids(v)).toEqual(["b", "a"]);
  });
  it("ignores accents when sorting French names", () => {
    const v = viewHelp([help({ id: "a", name: { en: null, fr: "Zoo" } }), help({ id: "b", name: { en: null, fr: "École" } }), help({ id: "c", name: { en: null, fr: "Aide" } })], q({ sort: "name" }), "fr");
    expect(ids(v)).toEqual(["c", "b", "a"]);
  });
  it("knows its sort names", () => {
    for (const s of HELP_SORTS) expect(isHelpSort(s)).toBe(true);
    for (const s of ["", "number", null, 1]) expect(isHelpSort(s)).toBe(false);
  });
});

describe("announceHelp", () => {
  it("covers none, none matching, all and some", () => {
    expect(announceHelp(0, 0, "en")).toBe("No help numbers are saved.");
    expect(announceHelp(0, 3, "en")).toBe("No help numbers match. 3 saved.");
    expect(announceHelp(1, 1, "en")).toBe("1 help number shown.");
    expect(announceHelp(3, 3, "en")).toBe("3 help numbers shown.");
    expect(announceHelp(2, 3, "en")).toBe("2 of 3 help numbers shown.");
  });
  it("covers them in French with the right plural", () => {
    expect(announceHelp(0, 0, "fr")).toBe("Aucun numéro d’aide n’est enregistré.");
    expect(announceHelp(0, 1, "fr")).toBe("Aucun numéro d’aide ne correspond. 1 enregistré.");
    expect(announceHelp(1, 1, "fr")).toBe("1 numéro d’aide affiché.");
    expect(announceHelp(3, 3, "fr")).toBe("3 numéros d’aide affichés.");
    expect(announceHelp(2, 3, "fr")).toBe("2 numéros d’aide affichés sur 3.");
  });
});

describe("the view does not change what it is given", () => {
  it("leaves the input array and its order alone", () => {
    const items = [help({ id: "b", name: { en: "B", fr: null } }), help({ id: "a", name: { en: "A", fr: null } })];
    const copy = JSON.stringify(items);
    viewHelp(items, q({ sort: "name" }), "en");
    expect(JSON.stringify(items)).toBe(copy);
  });
});

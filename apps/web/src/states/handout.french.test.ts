/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { DEFAULT_HANDOUT, buildHandout, handoutToText } from "./handout";
import { handoutToHtml } from "./handoutHtml";
import { importSummary, parseListCode, planImport } from "./listTransfer";
import { bare, place, varied } from "./placeFixtures";
import { lintFrench } from "./typography";

const TODAY = "2026-11-19";
const ON = { ...DEFAULT_HANDOUT, questions: true };

/** The sentences the App wrote on a page: title, intro, labels, question text, footer. The pack's own names and notes are left out. */
function ownText(locale: "en" | "fr", places = [place("a", { wheelchair_description: "Porte latérale" }), bare("z")]): string[] {
  const h = buildHandout(places, locale, TODAY, ON);
  return [h.title, h.intro, ...h.footer, ...h.entries.flatMap((e) => [...e.lines.map((l) => l.label), ...e.questions])];
}

describe("French copy on the page", () => {
  it("passes the French typography check for everything the App wrote", () => {
    for (const s of ownText("fr")) expect(lintFrench(s), s).toEqual([]);
  });
  it("uses the typographic apostrophe, never the straight one, in what the App wrote", () => {
    for (const s of ownText("fr")) expect(s, s).not.toContain("'");
  });
  it("puts a no-break space before a colon and a narrow one before ? ! ; in the App's text", () => {
    const all = ownText("fr", varied(3, 10)).join("\n");
    expect(all).not.toMatch(/[^\u00a0\u202f\s]:/);
    expect(all).not.toMatch(/[^\u202f\s][?!;]/);
  });
  it("keeps the token UNKNOWN and never writes INCONNU in text, page or code messages", () => {
    const h = buildHandout([bare("z")], "fr", TODAY, ON);
    expect(handoutToText(h)).not.toMatch(/INCONN/i);
    expect(handoutToHtml(h)).not.toMatch(/INCONN/i);
    const plan = planImport(["a"], [], new Set<string>());
    expect(importSummary(plan, parseListCode("- a | A"), "fr")).not.toMatch(/INCONN/i);
  });
  it("is in French in the page's language attribute, title and footer", () => {
    const d = new DOMParser().parseFromString(handoutToHtml(buildHandout([place("a")], "fr", TODAY)), "text/html");
    expect(d.documentElement.lang).toBe("fr");
    expect(d.title).toBe("Mon lieu");
    expect(d.querySelector("footer")!.textContent).toContain("pas un contrôle du lieu");
  });
  it("gives the French date in the footer", () => {
    expect(buildHandout([place("a")], "fr", TODAY).footer[0]).toBe("Créé le 19 novembre 2026 à partir du pack hors ligne sur cet appareil.");
  });
  it("says the stale count in French when places are old", () => {
    const old = place("o", { provenance: { source_name: "S", licence: "ODbL-1.0", retrieved_at: "2024-02-02", tier: 0 } });
    expect(buildHandout([old], "fr", TODAY).footer).toContain("1 de ces lieux ont des détails récupérés il y a plus d’un an.");
  });
});

describe("English and French carry the same structure", () => {
  it("has the same number of entries, lines, questions and footer paragraphs", () => {
    const ps = varied(9, 14);
    const en = buildHandout(ps, "en", TODAY, ON);
    const fr = buildHandout(ps, "fr", TODAY, ON);
    expect(fr.entries.map((e) => [e.lines.length, e.questions.length, e.note === null])).toEqual(en.entries.map((e) => [e.lines.length, e.questions.length, e.note === null]));
    expect(fr.footer).toHaveLength(en.footer.length);
  });
  it("has the same known flags in both languages", () => {
    const ps = varied(10, 14);
    const flags = (l: "en" | "fr") => buildHandout(ps, l, TODAY).entries.map((e) => e.lines.map((x) => x.known));
    expect(flags("fr")).toEqual(flags("en"));
  });
  it("has the same map point text in both languages: a point, not a comma", () => {
    const en = buildHandout([place("a")], "en", TODAY).entries[0]!.lines.find((l) => l.label === "Map point")!.value;
    const fr = buildHandout([place("a")], "fr", TODAY).entries[0]!.lines.find((l) => l.label === "Point de carte")!.value;
    expect(fr).toBe(en);
  });
});

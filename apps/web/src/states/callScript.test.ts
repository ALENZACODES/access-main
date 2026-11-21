import { describe, expect, it } from "vitest";
import { DEFAULT_SCRIPT_OPTIONS, buildCallScript, questionCount, spokenAddress, spokenNumber } from "./callScript";
import { lintCopy } from "./copyLint";
import { bare, place, varied } from "./placeFixtures";
import { parseAddress } from "./streetAddress";
import { lintFrench } from "./typography";

const TODAY = "2026-11-21";
const sec = (s: ReturnType<typeof buildCallScript>, id: string) => s.sections.find((x) => x.id === id)!;

describe("spokenNumber", () => {
  it.each([
    ["2650", "en", "two thousand six hundred fifty"], ["2650", "fr", "deux mille six cent cinquante"], ["1", "en", "one"], ["12A", "en", "twelve A"], ["12a", "fr", "douze A"],
    ["100-104", "en", "one hundred to one hundred four"], ["100-104", "fr", "cent à cent quatre"], ["100A-104B", "en", "one hundred A to one hundred four B"],
  ])("%s in %s", (raw, locale, expected) => {
    expect(spokenNumber(raw, locale as "en" | "fr")).toBe(expected);
  });
  it("reads a number with a leading zero digit by digit", () => {
    expect(spokenNumber("007", "en")).toBe("zero zero seven");
  });
  it("reads a number too big for words digit by digit", () => {
    expect(spokenNumber("123456", "en")).toBe("one two three four five six");
  });
  it("gives null for no number", () => {
    expect(spokenNumber(null, "en")).toBeNull();
  });
  it("falls back to the digits for an odd shape", () => {
    expect(spokenNumber("12 1/2", "en")).toBe("one two one two");
    expect(spokenNumber("abc", "en")).toBeNull();
  });
});

describe("spokenAddress", () => {
  it("reads a plain street address", () => {
    expect(spokenAddress(parseAddress("100 King St E"), "en")).toBe("one hundred King Street East");
  });
  it("reads a French address with its direction", () => {
    expect(spokenAddress(parseAddress("100 rue Sainte-Catherine Ouest"), "fr")).toContain("cent");
    expect(spokenAddress(parseAddress("100 rue Sainte-Catherine Ouest"), "fr")).toMatch(/Ouest$/);
  });
  it("adds the unit after a comma", () => {
    const a = spokenAddress(parseAddress("200 Bay Street, Unit 5"), "en");
    expect(a).toMatch(/two hundred/);
    expect(a).toMatch(/, Unit 5$/);
  });
  it.each([null, "", "unknown", "PO Box 12", "Main St & King St"])("says nothing for %s", (raw) => {
    expect(spokenAddress(parseAddress(raw), "en")).toBeNull();
  });
});

describe("buildCallScript structure", () => {
  const script = buildCallScript(place("p1", { name: "Café Étoile", address: "2650 Quesnel Road" }), "en", TODAY);
  it("has the five sections in order", () => {
    expect(script.sections.map((s) => s.id)).toEqual(["opening", "place", "address", "questions", "closing"]);
  });
  it("titles the script with the name", () => {
    expect(script.title).toBe("Call script: Café Étoile");
    expect(script.placeId).toBe("p1");
  });
  it("names the place and spells the hard words", () => {
    const lines = sec(script, "place").lines;
    expect(lines[0]!.text).toBe("I am calling about Café Étoile.");
    expect(lines[1]!.text).toContain("E with an acute accent as in Echo");
  });
  it("reads the address in words and asks about it", () => {
    const lines = sec(script, "address").lines;
    expect(lines[0]!.text).toBe("The address I have is two thousand six hundred fifty Quesnel Road.");
    expect(lines[1]!.kind).toBe("ask");
  });
  it("asks the visit questions with a reason and room to write", () => {
    const qs = sec(script, "questions").lines;
    expect(qs.length).toBeGreaterThan(0);
    for (const q of qs) {
      expect(q.kind).toBe("ask");
      expect(q.basis).toBeTruthy();
      expect(q.writeLines).toBe(2);
    }
    expect(questionCount(script)).toBe(qs.length);
  });
  it("ends with fields to fill in", () => {
    const fields = sec(script, "closing").lines.filter((l) => l.kind === "field");
    expect(fields).toHaveLength(4);
    expect(fields.every((f) => f.writeLines === 1)).toBe(true);
  });
  it("lists what is said and asked, in order, in spoken", () => {
    expect(script.spoken[0]).toContain("Hello");
    expect(script.spoken.at(-1)).toContain("Thank you");
    expect(script.spoken).not.toContain("");
  });
  it("says where it came from and what it is not", () => {
    expect(script.footer).toContain(TODAY);
    expect(script.footer).toContain("Not checked with the place");
  });
});

describe("buildCallScript options", () => {
  const p = place("p2", { name: "Quesnel Library", address: "10 Main Street" });
  it("leaves out spelling when turned off", () => {
    const s = buildCallScript(p, "en", TODAY, { ...DEFAULT_SCRIPT_OPTIONS, spellName: false });
    expect(sec(s, "place").lines).toHaveLength(1);
  });
  it("spells only the words worth spelling", () => {
    const s = buildCallScript(p, "en", TODAY);
    const spell = sec(s, "place").lines[1]!.text;
    expect(spell).toContain("Q as in Quebec");
    expect(spell).not.toContain("as in Mike");
  });
  it("gives no spelling line when no word needs it", () => {
    const s = buildCallScript(place("p3", { name: "Main Bar" }), "en", TODAY);
    expect(sec(s, "place").lines).toHaveLength(1);
  });
  it("shows the address as written when reading it out is off", () => {
    const s = buildCallScript(p, "en", TODAY, { ...DEFAULT_SCRIPT_OPTIONS, readAddress: false });
    expect(sec(s, "address").lines[0]!.text).toBe("10 Main Street");
  });
  it("drops the questions section when turned off", () => {
    const s = buildCallScript(p, "en", TODAY, { ...DEFAULT_SCRIPT_OPTIONS, includeQuestions: false });
    expect(s.sections.map((x) => x.id)).toEqual(["opening", "place", "address", "closing"]);
    expect(questionCount(s)).toBe(0);
  });
});

describe("buildCallScript with gaps in the pack", () => {
  it("says so when there is no name", () => {
    const s = buildCallScript(bare("b1"), "en", TODAY);
    expect(s.title).toBe("Call script");
    expect(sec(s, "place").lines[0]!.kind).toBe("note");
    expect(sec(s, "place").lines[0]!.text).toContain("no name");
  });
  it("tells the caller to ask when there is no address", () => {
    const s = buildCallScript(bare("b2"), "en", TODAY);
    expect(sec(s, "address").lines[0]!.text).toContain("no street address");
  });
  it("tells the caller to ask where visitors go in for a box", () => {
    const s = buildCallScript(place("b3", { address: "PO Box 12" }), "en", TODAY);
    expect(sec(s, "address").lines[0]!.text).toContain("post-office box");
  });
  it("tells the caller to ask for a number at a corner", () => {
    const s = buildCallScript(place("b4", { address: "Main St & King St" }), "en", TODAY);
    expect(sec(s, "address").lines[0]!.text).toContain("corner");
  });
  it("still builds a full script for a place the pack knows nothing about", () => {
    const s = buildCallScript(bare("b5"), "fr", TODAY);
    expect(s.sections).toHaveLength(5);
    expect(s.spoken.length).toBeGreaterThan(2);
  });
});

describe("buildCallScript in French", () => {
  const s = buildCallScript(place("f1", { name: "Café Étoile", address: "80 rue Principale" }), "fr", TODAY);
  it("reads the number and spells in French", () => {
    expect(sec(s, "address").lines[0]!.text).toBe("L’adresse indiquée est quatre-vingts Rue Principale.");
    expect(sec(s, "place").lines[1]!.text).toContain("comme Célestin");
  });
  it("titles in French", () => {
    expect(s.title).toBe("Script d’appel : Café Étoile");
  });
});

describe("script copy discipline", () => {
  const places = [place("c1", { name: "Alpha Hall", address: "5 Elm Street" }), bare("c2"), place("c3", { wheelchair: "no", name: "Zed Café" }), place("c4", { wheelchair: "limited", name: null }), ...varied(5, 6)];
  for (const locale of ["en", "fr"] as const) {
    it(`passes the copy lint in ${locale} for every line it writes itself`, () => {
      for (const p of places) {
        const s = buildCallScript(p, locale, TODAY, { ...DEFAULT_SCRIPT_OPTIONS, spellName: false });
        for (const section of s.sections) {
          for (const line of section.lines) {
            // Skip lines that carry the pack's own place names.
            if (p.name && line.text.includes(p.name)) continue;
            expect(lintCopy(line.text, locale), line.text).toEqual([]);
            if (locale === "fr") expect(lintFrench(line.text), line.text).toEqual([]);
          }
        }
      }
    });
  }
  it("never offers a phone link or a way to dial", () => {
    for (const p of places) {
      const s = buildCallScript(p, "en", TODAY);
      expect(JSON.stringify(s)).not.toMatch(/tel:|mailto:|geo:|http:\/\//);
    }
  });
  it("is the same every time for the same input", () => {
    for (const p of places) expect(buildCallScript(p, "en", TODAY)).toEqual(buildCallScript(p, "en", TODAY));
  });
});

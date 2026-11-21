import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { describeSearchProblem, describeSearchTerm, explainPackSearch, explainSearchClauses, searchQuoted } from "./packSearchExplain";
import { searchEchoHeading, searchExampleCount, searchExamples, searchHelpHeading, searchHelpIntro, searchHelpToggle, searchProblemsHeading, searchTryLabel } from "./packSearchHelp";
import { filterBySearch } from "./packSearchMatch";
import { type SearchProblemKind, parsePackSearch } from "./packSearchParse";
import { searchPlaces } from "./packSearchFixtures";
import type { Locale } from "./stateCopy";
import { lintFrench } from "./typography";

const lines = (q: string, l: Locale = "en") => explainSearchClauses(parsePackSearch(q), l);
const plain = (s: string) => s.split("\u00a0").join(" ").split("\u202f").join(" ");
const LOCALES: readonly Locale[] = ["en", "fr"];
/** What the person typed is shown as typed, so it is masked before the French typography check. */
const masked = (s: string) => s.replace(/«\u202f.*?\u202f»/g, "«\u202fx\u202f»");

describe("explainSearchClauses in English", () => {
  it("says where each plain word is looked for", () => {
    expect(lines("cafe main")).toEqual(["Name, address or kind contains “cafe”", "Name, address or kind contains “main”"]);
  });
  it("says phrase, leaving out, fields and tags", () => {
    expect(lines('"main street"')).toEqual(["Name, address or kind contains “main street”"]);
    expect(lines("-bar")).toEqual(["Name, address or kind does not contain “bar”"]);
    expect(lines("kind:cafe address:main name:x note:ramp")).toEqual(["Kind contains “cafe”", "Address contains “main”", "Name contains “x”", "Note contains “ramp”"]);
    expect(lines("tag:yes -tag:no")).toEqual(["Wheelchair tag is Yes", "Wheelchair tag is not No"]);
    expect(lines("tag:unknown")).toEqual(["Wheelchair tag is UNKNOWN"]);
  });
  it("says has and no", () => {
    expect(lines("has:note no:address has:tag has:location has:source")).toEqual([
      "Has a note", "Has no address", "Has a wheelchair tag other than UNKNOWN", "Has a map point", "Has a source",
    ]);
  });
  it("joins alternatives with ', or '", () => {
    expect(lines("cafe OR bar")).toEqual(["Name, address or kind contains “cafe”, or name, address or kind contains “bar”"]);
  });
  it("gives nothing for no clauses", () => {
    expect(lines("")).toEqual([]);
    expect(lines("tag:yess")).toEqual([]);
  });
});

describe("explainSearchClauses in French", () => {
  it("uses French wording and the quotation marks of French, with thin spaces inside", () => {
    expect(lines("kind:cafe", "fr")).toEqual(["Le genre contient «\u202fcafe\u202f»"]);
    expect(lines("tag:oui", "fr")).toEqual(["L’indication pour fauteuil roulant est Oui"]);
    expect(lines("sans:note", "fr")).toEqual(["N’a pas une note"]);
    expect(lines("cafe OU bar", "fr")[0]).toContain(", ou ");
  });
  it("writes UNKNOWN, never INCONNU", () => {
    expect(lines("tag:unknown", "fr")).toEqual(["L’indication pour fauteuil roulant est UNKNOWN"]);
  });
});

describe("describeSearchTerm", () => {
  it("names the subject of a plain word differently from a name-only search", () => {
    expect(describeSearchTerm({ type: "text", field: "any", value: "x", phrase: false, negated: false }, "en")).toBe("name, address or kind contains “x”");
    expect(describeSearchTerm({ type: "text", field: "name", value: "x", phrase: false, negated: true }, "en")).toBe("name does not contain “x”");
  });
});

describe("describeSearchProblem", () => {
  const kinds: SearchProblemKind[] = ["unknown-field", "bad-tag-value", "bad-has-value", "empty-value", "open-quote", "dangling-or", "too-many-terms", "too-long"];
  it("says something for every kind of mistake, in both languages, never the same in both", () => {
    for (const kind of kinds) {
      const en = describeSearchProblem({ kind, text: "x:", suggestion: null }, "en");
      const fr = describeSearchProblem({ kind, text: "x:", suggestion: null }, "fr");
      expect(en.length, kind).toBeGreaterThan(10);
      expect(fr, kind).not.toBe(en);
    }
  });
  it("names what was typed and says what was done with it", () => {
    const p = parsePackSearch("tag:yess").problems[0]!;
    expect(describeSearchProblem(p, "en")).toBe("“tag:yess” was left out: that is not a wheelchair tag. Use yes, limited, no, designated or unknown. Did you mean “yes”?");
  });
  it("says an unknown field was searched as plain text, and lists the real fields", () => {
    const text = describeSearchProblem(parsePackSearch("adress:main").problems[0]!, "en");
    expect(text).toContain("searched for as plain text");
    expect(text).toContain("Did you mean “address”?");
    expect(text).toContain("name, address, street, kind, tag, note, has, no");
  });
  it("leaves out the question when there is nothing to suggest", () => {
    expect(describeSearchProblem(parsePackSearch("tag:purple").problems[0]!, "en")).not.toContain("Did you mean");
  });
  it("asks in French with a thin space before the question mark", () => {
    expect(describeSearchProblem(parsePackSearch("tag:yess").problems[0]!, "fr")).toContain("Vouliez-vous dire «\u202fyes\u202f»\u202f?");
  });
});

describe("explainPackSearch", () => {
  it("has nothing to say for an empty search or plain words", () => {
    for (const q of ["", "cafe", "cafe main street"]) expect(explainPackSearch(parsePackSearch(q), "en"), q).toBeNull();
  });
  it("has lines and problems for an operator search", () => {
    const e = explainPackSearch(parsePackSearch("cafe tag:yess"), "en")!;
    expect(e.lines).toEqual(["Name, address or kind contains “cafe”"]);
    expect(e.problems).toHaveLength(1);
  });
  it("speaks for an OR on its own and for a search that is only mistakes", () => {
    expect(explainPackSearch(parsePackSearch("a OR b"), "en")!.lines).toHaveLength(1);
    expect(explainPackSearch(parsePackSearch("tag:yess"), "en")).toEqual({ lines: [], problems: [expect.any(String)] });
  });
});

describe("what was typed is shown exactly as typed, even in French", () => {
  it("keeps a colon, an apostrophe, a semicolon and a question mark inside a value", () => {
    const e = explainPackSearch(parsePackSearch("note:\"o'neil; ok? a:b\" tag:yess"), "fr")!;
    expect(e.lines[0]).toBe("La note contient «\u202fo'neil; ok? a:b\u202f»");
    expect(e.problems[0]).toContain("«\u202ftag:yess\u202f» a été ignoré");
    expect(e.problems[0]).not.toContain("tag\u00a0:yess");
  });
  it("keeps a typed field word and its colon in the unknown-field line", () => {
    expect(describeSearchProblem(parsePackSearch("colour:red").problems[0]!, "fr")).toMatch(/^«\u202fcolour:\u202f» n’est pas un mot de recherche ici\u00a0: /);
  });
  it("puts the French question mark after a suggestion with a thin space, outside the typed text", () => {
    expect(describeSearchProblem(parsePackSearch("tag:yess").problems[0]!, "fr")).toMatch(/Vouliez-vous dire «\u202fyes\u202f»\u202f\?$/);
  });
  it("does the same in English: nothing typed is changed", () => {
    expect(explainPackSearch(parsePackSearch("note:\"o'neil; ok? a:b\""), "en")!.lines[0]).toBe("Note contains “o'neil; ok? a:b”");
  });
});

describe("copy rules", () => {
  const samples = ['cafe OR bar', '"main street" -bar', "kind:cafe tag:yes has:note no:address note:ramp street:main name:x", "tag:yess has:foo colour:red tag: OR a OR", 'a "open'];
  it("every line passes the App's copy rules and French typography, in both languages", () => {
    for (const l of LOCALES) for (const q of samples) {
      const e = explainPackSearch(parsePackSearch(q), l)!;
      for (const s of [...e.lines, ...e.problems]) {
        expect(lintCopy(masked(s), l), s).toEqual([]);
        if (l === "fr") expect(lintFrench(masked(s)), s).toEqual([]);
        expect(s, s).not.toMatch(/inconnu/i);
      }
    }
  });
  it("never says a place is right, checked or suitable: it describes the search only", () => {
    const claims = /\b(correct|accurate|confirmed|best|recommend\w*|suitable|safe|usable|real-time|guarantee)\b/i;
    for (const q of samples) {
      const e = explainPackSearch(parsePackSearch(q), "en")!;
      for (const s of [...e.lines, ...e.problems]) expect(s, s).not.toMatch(claims);
    }
  });
  it("quotes with the marks of each language", () => {
    expect(searchQuoted("x", "en")).toBe("“x”");
    expect(searchQuoted("x", "fr")).toBe("«\u202fx\u202f»");
  });
});

describe("the search tips", () => {
  it("gives the same number of examples in both languages, each a search that parses without a mistake", () => {
    expect(searchExamples("en")).toHaveLength(searchExamples("fr").length);
    for (const l of LOCALES) for (const e of searchExamples(l)) {
      const p = parsePackSearch(e.text);
      expect(p.problems, e.text).toEqual([]);
      expect(p.clauses.length, e.text).toBeGreaterThan(0);
      expect(e.meaning.length).toBeGreaterThan(10);
    }
  });
  it("has examples that find something in the test places, so each one teaches something", () => {
    const places = searchPlaces();
    for (const l of LOCALES) for (const e of searchExamples(l)) expect(filterBySearch(places, parsePackSearch(e.text)).length, e.text).toBeGreaterThan(0);
  });
  it("has examples whose explanation matches what they are said to mean", () => {
    expect(lines(searchExamples("en")[0]!.text)).toHaveLength(1);
    expect(lines("kind:restaurant -fast")).toEqual(["Kind contains “restaurant”", "Name, address or kind does not contain “fast”"]);
  });
  it("counts places with the right singular and plural", () => {
    expect(searchExampleCount(1, "en")).toBe("1 place in the pack");
    expect(searchExampleCount(0, "en")).toBe("0 places in the pack");
    expect(plain(searchExampleCount(1, "fr"))).toBe("1 lieu dans le pack");
    expect(plain(searchExampleCount(3, "fr"))).toBe("3 lieux dans le pack");
  });
  it("has headings and labels in both languages that pass the copy rules", () => {
    for (const l of LOCALES) {
      for (const s of [searchHelpHeading(l), searchHelpToggle(true, l), searchHelpToggle(false, l), searchHelpIntro(l), searchTryLabel(l), searchEchoHeading(l), searchProblemsHeading(l)]) {
        expect(lintCopy(s, l), s).toEqual([]);
        expect(s).not.toMatch(/inconnu/i);
      }
      expect(lintFrench(searchHelpIntro("fr"))).toEqual([]);
    }
  });
  it("says in the introduction that plain words work as before", () => {
    expect(searchHelpIntro("en")).toContain("Words work as before");
    expect(plain(searchHelpIntro("fr"))).toContain("fonctionnent comme avant");
  });
});

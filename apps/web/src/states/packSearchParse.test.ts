import { describe, expect, it } from "vitest";
import { lcg } from "./placeFixtures";
import {
  EMPTY_PARSED_SEARCH, SEARCH_FIELD_WORDS, SEARCH_HAS_KEYS, SEARCH_HAS_WORDS, SEARCH_MAX_CHARS, SEARCH_MAX_TERMS, SEARCH_TAG_WORDS, type SearchTerm, parsePackSearch, plainWordsOf,
} from "./packSearchParse";
import { normalizeText } from "./filters";

const terms = (q: string): SearchTerm[][] => parsePackSearch(q).clauses.map((c) => [...c.alternatives]);
const text = (value: string, over: Partial<Extract<SearchTerm, { type: "text" }>> = {}): SearchTerm => ({ type: "text", field: "any", value, phrase: false, negated: false, ...over });
const kinds = (q: string) => parsePackSearch(q).problems.map((p) => p.kind);

describe("plain words", () => {
  it("gives nothing for an empty search or spaces", () => {
    for (const q of ["", "   ", "\t\n"]) expect(parsePackSearch(q)).toEqual(EMPTY_PARSED_SEARCH);
  });
  it("makes each word its own required clause, folded", () => {
    expect(terms("Café  MAIN")).toEqual([[text("cafe")], [text("main")]]);
  });
  it("is not an operator search", () => {
    for (const q of ["cafe", "cafe main", "  wi-fi ", "10 Dundas", "o'neil"]) expect(parsePackSearch(q).usesOperators, q).toBe(false);
  });
  it("keeps a hyphen inside a word, and a lone hyphen as text", () => {
    expect(terms("wi-fi")).toEqual([[text("wi-fi")]]);
    expect(terms("- cafe")).toEqual([[text("-")], [text("cafe")]]);
  });
  it("lists the plain words", () => {
    expect(plainWordsOf(parsePackSearch("cafe -bar \"main street\" kind:x main"))).toEqual(["cafe", "main"]);
  });
});

describe("phrases", () => {
  it("reads a quoted run of words as one phrase", () => {
    expect(terms('"Main  Street"')).toEqual([[text("main street", { phrase: true })]]);
  });
  it("reads a quoted single word as an ordinary word, still marked as an operator use", () => {
    expect(terms('"cafe"')).toEqual([[text("cafe")]]);
    expect(parsePackSearch('"cafe"').usesOperators).toBe(true);
  });
  it("reads curly and French quotation marks too", () => {
    expect(terms("“main street”")).toEqual(terms('"main street"'));
    expect(terms("«main street»")).toEqual(terms('"main street"'));
  });
  it("closes an open quotation mark at the end and says so", () => {
    expect(terms('cafe "main str')).toEqual([[text("cafe")], [text("main str", { phrase: true })]]);
    expect(kinds('cafe "main str')).toEqual(["open-quote"]);
  });
  it("skips an empty pair of quotation marks without a problem", () => {
    expect(terms('cafe ""')).toEqual([[text("cafe")]]);
    expect(kinds('cafe ""')).toEqual([]);
  });
});

describe("leaving out", () => {
  it("reads a leading minus as leaving a word out", () => {
    expect(terms("cafe -bar")).toEqual([[text("cafe")], [text("bar", { negated: true })]]);
  });
  it("leaves out a phrase and a field value", () => {
    expect(terms('-"main street"')).toEqual([[text("main street", { phrase: true, negated: true })]]);
    expect(terms("-kind:bar")).toEqual([[text("bar", { field: "kind", negated: true })]]);
    expect(terms("-tag:no")).toEqual([[{ type: "tag", value: "no", negated: true }]]);
  });
  it("does not read a minus inside a word", () => {
    expect(terms("a-b")).toEqual([[text("a-b")]]);
  });
});

describe("OR", () => {
  it("joins the words on either side into one clause", () => {
    expect(terms("cafe OR bar")).toEqual([[text("cafe"), text("bar")]]);
    expect(terms("a OR b OR c d")).toEqual([[text("a"), text("b"), text("c")], [text("d")]]);
  });
  it("reads OU in French and only in capitals", () => {
    expect(terms("cafe OU bar")).toEqual([[text("cafe"), text("bar")]]);
    expect(terms("cafe or bar")).toEqual([[text("cafe")], [text("or")], [text("bar")]]);
    expect(terms("cafe ou bar")).toEqual([[text("cafe")], [text("ou")], [text("bar")]]);
  });
  it("joins fields and leaving out", () => {
    expect(terms("kind:cafe OR -tag:no")).toEqual([[text("cafe", { field: "kind" }), { type: "tag", value: "no", negated: true }]]);
  });
  it("leaves out an OR at the start or the end and says so", () => {
    expect(terms("OR cafe")).toEqual([[text("cafe")]]);
    expect(terms("cafe OR")).toEqual([[text("cafe")]]);
    expect(kinds("OR cafe")).toEqual(["dangling-or"]);
    expect(kinds("cafe OR")).toEqual(["dangling-or"]);
  });
  it("is not an OR when quoted, or when it has a field or a minus", () => {
    expect(terms('cafe "OR" bar')).toEqual([[text("cafe")], [text("or")], [text("bar")]]);
    expect(terms("cafe -OR bar")).toEqual([[text("cafe")], [text("or", { negated: true })], [text("bar")]]);
  });
  it("counts OR as an operator use", () => {
    expect(parsePackSearch("a OR b").usesOperators).toBe(true);
  });
});

describe("fields", () => {
  it("reads each text field, in English and in French", () => {
    for (const [word, field] of [["name", "name"], ["nom", "name"], ["address", "address"], ["adresse", "address"], ["street", "address"], ["rue", "address"], ["kind", "kind"], ["genre", "kind"], ["type", "kind"], ["note", "note"]] as const) {
      expect(terms(`${word}:x`), word).toEqual([[text("x", { field })]]);
    }
  });
  it("is blind to case and accents in the field word and the value", () => {
    expect(terms("KIND:Café")).toEqual([[text("cafe", { field: "kind" })]]);
    expect(terms("Rue:Élisabeth")).toEqual([[text("elisabeth", { field: "address" })]]);
  });
  it("reads a quoted value with spaces", () => {
    expect(terms('address:"main street"')).toEqual([[text("main street", { field: "address", phrase: true })]]);
  });
  it("reads tag values in English and French, with UNKNOWN only as unknown", () => {
    for (const [w, v] of Object.entries(SEARCH_TAG_WORDS)) expect(terms(`tag:${w}`), w).toEqual([[{ type: "tag", value: v, negated: false }]]);
    expect(terms("indication:Oui")).toEqual([[{ type: "tag", value: "yes", negated: false }]]);
    expect(terms("tag:UNKNOWN")).toEqual([[{ type: "tag", value: "unknown", negated: false }]]);
    expect(Object.keys(SEARCH_TAG_WORDS)).not.toContain("inconnu");
  });
  it("reads has and no, and no is has turned round", () => {
    expect(terms("has:note")).toEqual([[{ type: "has", key: "note", negated: false }]]);
    expect(terms("no:note")).toEqual([[{ type: "has", key: "note", negated: true }]]);
    expect(terms("-no:note")).toEqual([[{ type: "has", key: "note", negated: false }]]);
    expect(terms("-has:note")).toEqual([[{ type: "has", key: "note", negated: true }]]);
    expect(terms("avec:adresse")).toEqual([[{ type: "has", key: "address", negated: false }]]);
    expect(terms("sans:position")).toEqual([[{ type: "has", key: "location", negated: true }]]);
  });
  it("knows every detail key in English", () => {
    for (const k of SEARCH_HAS_KEYS) expect(SEARCH_HAS_WORDS[k], k).toBe(k);
  });
  it("keeps every word of the three tables folded", () => {
    for (const table of [SEARCH_FIELD_WORDS, SEARCH_TAG_WORDS, SEARCH_HAS_WORDS]) for (const w of Object.keys(table)) expect(normalizeText(w)).toBe(w);
  });
});

describe("mistakes", () => {
  it("searches an unknown field as plain text and says so, with a likely word", () => {
    const p = parsePackSearch("colour:red");
    expect(p.clauses).toEqual([{ alternatives: [text("colour:red")], typed: "colour:red" }]);
    expect(p.problems).toEqual([{ kind: "unknown-field", text: "colour:", suggestion: null }]);
    expect(parsePackSearch("adress:main").problems[0]).toEqual({ kind: "unknown-field", text: "adress:", suggestion: "address" });
    expect(parsePackSearch("tga:yes").problems[0]!.suggestion).toBe("tag");
  });
  it("does not guess for a very short unknown field", () => {
    expect(parsePackSearch("ab:cd").problems[0]!.suggestion).toBeNull();
  });
  it("leaves out a tag value it does not know, and offers the nearest", () => {
    const p = parsePackSearch("tag:yess");
    expect(p.clauses).toEqual([]);
    expect(p.problems).toEqual([{ kind: "bad-tag-value", text: "tag:yess", suggestion: "yes" }]);
    expect(parsePackSearch("tag:purple").problems[0]!.suggestion).toBeNull();
  });
  it("leaves out a detail it does not know", () => {
    const p = parsePackSearch("has:notes");
    expect(p.clauses).toEqual([]);
    expect(p.problems).toEqual([{ kind: "bad-has-value", text: "has:notes", suggestion: "note" }]);
  });
  it("leaves out a field with nothing after it", () => {
    for (const q of ["tag:", "kind:", "has:", 'kind:""']) {
      expect(parsePackSearch(q).clauses, q).toEqual([]);
      expect(kinds(q), q).toEqual(["empty-value"]);
    }
  });
  it("keeps the rest of the search when one part is left out", () => {
    expect(terms("cafe tag:yess main")).toEqual([[text("cafe")], [text("main")]]);
  });
  it("counts a mistake as an operator use, so the page says how it read the search", () => {
    for (const q of ["tag:yess", "colour:red", "kind:", "OR x"]) expect(parsePackSearch(q).usesOperators, q).toBe(true);
  });
  it("never treats a URL or a time as a field when it has digits first, and reads the rest as text", () => {
    expect(terms("10:30")).toEqual([[text("10:30")]]);
    expect(parsePackSearch("10:30").problems).toEqual([]);
  });
});

describe("what was typed, clause by clause", () => {
  const typed = (q: string) => parsePackSearch(q).clauses.map((c) => c.typed);
  it("keeps each clause as it was typed, with its minus sign, field and quotation marks", () => {
    expect(typed('Cafe -Bar kind:Café "Main  Street" tag:yes')).toEqual(["Cafe", "-Bar", "kind:Café", '"Main  Street"', "tag:yes"]);
  });
  it("joins the alternatives of a clause with OR, whichever OR was typed", () => {
    expect(typed("cafe OR bar main")).toEqual(["cafe OR bar", "main"]);
    expect(typed("cafe OU bar")).toEqual(["cafe OR bar"]);
  });
  it("leaves out the parts that were left out", () => {
    expect(typed("cafe tag:yess main")).toEqual(["cafe", "main"]);
  });
  it("gives text that parses back to the same clauses", () => {
    for (const q of ['cafe OR bar -main', 'kind:cafe "main street" tag:yes has:note', "no:address -tag:no"]) {
      const first = parsePackSearch(q);
      const again = parsePackSearch(first.clauses.map((c) => c.typed).join(" "));
      expect(again.clauses.map((c) => c.alternatives), q).toEqual(first.clauses.map((c) => c.alternatives));
    }
  });
});

describe("limits", () => {
  it("cuts a search that is too long and says so", () => {
    const p = parsePackSearch("a ".repeat(SEARCH_MAX_CHARS));
    expect(p.problems.map((x) => x.kind)).toContain("too-long");
    expect(p.clauses.length).toBeLessThanOrEqual(SEARCH_MAX_TERMS);
  });
  it("keeps the first terms of a search with too many and says so", () => {
    const q = Array.from({ length: SEARCH_MAX_TERMS + 6 }, (_, i) => `w${i}`).join(" ");
    const p = parsePackSearch(q);
    expect(p.clauses).toHaveLength(SEARCH_MAX_TERMS);
    expect(p.clauses[0]).toEqual({ alternatives: [text("w0")], typed: "w0" });
    expect(p.problems.map((x) => x.kind)).toEqual(["too-many-terms"]);
  });
  it("accepts a search of exactly the most terms and the most characters", () => {
    const q = Array.from({ length: SEARCH_MAX_TERMS }, (_, i) => `w${i}`).join(" ");
    expect(q.length).toBeLessThanOrEqual(SEARCH_MAX_CHARS);
    expect(parsePackSearch(q).problems).toEqual([]);
    expect(parsePackSearch("x".repeat(SEARCH_MAX_CHARS)).problems).toEqual([]);
    expect(parsePackSearch("x".repeat(SEARCH_MAX_CHARS + 1)).problems.map((p) => p.kind)).toEqual(["too-long"]);
  });
});

describe("any text at all", () => {
  const PIECES = ["cafe", "-bar", "OR", "OU", '"', "“", "”", "tag:", "tag:yes", "kind:cafe", "has:note", "no:", ":", "-", "--", "x:y", "é", "東京", "\n", "  ", "'", "(", ")", "10:30", "-\"a b\""];
  it("never throws, always gives clauses with at least one term and terms with a value", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const next = lcg(seed);
      const q = Array.from({ length: 1 + Math.floor(next() * 14) }, () => PIECES[Math.floor(next() * PIECES.length)]!).join(next() < 0.7 ? " " : "");
      const p = parsePackSearch(q);
      for (const c of p.clauses) {
        expect(c.alternatives.length, q).toBeGreaterThan(0);
        for (const t of c.alternatives) if (t.type === "text") expect(t.value, q).not.toBe("");
      }
      expect(p.clauses.length).toBeLessThanOrEqual(SEARCH_MAX_TERMS);
      expect(parsePackSearch(q)).toEqual(p);
    }
  });
});

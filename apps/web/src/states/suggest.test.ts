import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIMIT, MAX_CANDIDATES, MAX_LABEL_CHARS, MAX_QUERY_CHARS,
  allowedEdits, boundedDistance, foldText, scoreCandidate, suggest, tokens, type Candidate,
} from "./suggest";

const c = (label: string, key = label): Candidate => ({ key, label, value: label });
const labels = (query: string, names: string[], options = {}) => suggest(query, names.map((n) => c(n)), options).map((s) => s.label);

describe("foldText", () => {
  it.each([
    ["Café", "cafe"],
    ["ÉCOLE", "ecole"],
    ["L’Île-d’Or", "l ile d or"],
    ["L'Île-d'Or", "l ile d or"],
    ["  Tim   Hortons  ", "tim hortons"],
    ["Œuvre", "oeuvre"],
    ["Straße", "strasse"],
    ["Saint-Jean–Baptiste", "saint jean baptiste"],
    ["", ""],
    ["   ", ""],
    ["!!!", ""],
    ["№ 5 (rear)", "5 rear"],
  ])("%s → %s", (input, folded) => {
    expect(foldText(input)).toBe(folded);
  });
  it("is idempotent", () => {
    for (const text of ["Café du Coin", "L’Île", "A  B", "ÀÉÎÕÜ", "x"]) {
      expect(foldText(foldText(text))).toBe(foldText(text));
    }
  });
  it("folds composed and decomposed accents to the same text", () => {
    expect(foldText("é")).toBe(foldText("é"));
  });
  it("keeps letters of other scripts and digits", () => {
    expect(foldText("Ελλάδα 12")).toBe("ελλαδα 12");
  });
});

describe("tokens", () => {
  it("splits folded text and gives nothing for empty text", () => {
    expect(tokens("a bc d")).toEqual(["a", "bc", "d"]);
    expect(tokens("")).toEqual([]);
  });
});

describe("boundedDistance", () => {
  it.each([
    ["cafe", "cafe", 0],
    ["cafe", "cafes", 1],
    ["cafe", "caffe", 1],
    ["cafe", "cfae", 1],
    ["kitten", "sitting", 3],
    ["", "abc", 3],
    ["abc", "", 3],
    ["", "", 0],
  ])("%s ↔ %s = %i", (a, b, d) => {
    expect(boundedDistance(a, b, 5)).toBe(d);
    expect(boundedDistance(b, a, 5)).toBe(d);
  });
  it("returns max + 1 once the distance exceeds max", () => {
    expect(boundedDistance("abcdef", "uvwxyz", 2)).toBe(3);
    expect(boundedDistance("a", "abcdefgh", 2)).toBe(3);
    expect(boundedDistance("", "abcd", 2)).toBe(3);
  });
  it("agrees with the unbounded value whenever it is within max (seeded random strings)", () => {
    let seed = 7;
    const next = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; };
    const word = () => Array.from({ length: 1 + (next() % 7) }, () => "abc"[next() % 3]).join("");
    for (let i = 0; i < 300; i += 1) {
      const a = word();
      const b = word();
      const exact = boundedDistance(a, b, 20);
      expect(exact).toBeLessThanOrEqual(Math.max(a.length, b.length));
      expect(boundedDistance(a, b, 20)).toBe(boundedDistance(b, a, 20));
      for (const max of [0, 1, 2, 3]) {
        expect(boundedDistance(a, b, max)).toBe(exact <= max ? exact : max + 1);
      }
    }
  });
  it("satisfies the triangle inequality on a sample", () => {
    const words = ["cafe", "cafes", "safe", "sage", "page", "pages", "cage"];
    for (const x of words) for (const y of words) for (const z of words) {
      expect(boundedDistance(x, z, 20)).toBeLessThanOrEqual(boundedDistance(x, y, 20) + boundedDistance(y, z, 20));
    }
  });
});

describe("allowedEdits", () => {
  it("allows none for short words, one for medium, two for long", () => {
    expect([1, 2, 3].map(allowedEdits)).toEqual([0, 0, 0]);
    expect([4, 5, 6].map(allowedEdits)).toEqual([1, 1, 1]);
    expect([7, 8, 20].map(allowedEdits)).toEqual([2, 2, 2]);
  });
});

describe("scoreCandidate", () => {
  it("orders identical, prefix, whole word, inside text, then close words", () => {
    const q = "union";
    const scores = [
      scoreCandidate(q, "union"),
      scoreCandidate(q, "union station"),
      scoreCandidate(q, "north union"),
      scoreCandidate(q, "reunion hall"),
      scoreCandidate(q, "unoin square"),
    ];
    expect(scores.every((s) => s !== null)).toBe(true);
    expect([...scores].sort((a, b) => a! - b!)).toEqual(scores);
    expect(new Set(scores).size).toBe(scores.length);
  });
  it("is null for blank text, and for words that are not close", () => {
    expect(scoreCandidate("", "x")).toBeNull();
    expect(scoreCandidate("x", "")).toBeNull();
    expect(scoreCandidate("library", "pharmacy")).toBeNull();
  });
  it("never turns a three-letter word into a different word", () => {
    expect(scoreCandidate("bar", "car")).toBeNull();
    expect(scoreCandidate("bar", "bank")).toBeNull();
  });
  it("needs every query word to match some word of the label", () => {
    expect(scoreCandidate("city hal", "city hall annex")).not.toBeNull();
    expect(scoreCandidate("city zoo", "city hall annex")).toBeNull();
  });
});

describe("suggest", () => {
  const names = ["Café du Coin", "Union Station", "Union Square Park", "Reunion Hall", "Bay Street Library", "École Saint-Jean"];
  it("finds a misspelled name", () => {
    expect(labels("unoin station", names)).toEqual(["Union Station"]);
    expect(labels("libary", names)).toEqual(["Bay Street Library"]);
  });
  it("ignores accents in the query and in the candidates", () => {
    expect(labels("cafe du coin", names, { includeExact: true })).toEqual(["Café du Coin"]);
    expect(labels("ecole st jean", names)).toEqual([]);
    expect(labels("ecole saint jean", names, { includeExact: true })).toEqual(["École Saint-Jean"]);
  });
  it("leaves out a candidate identical to the query unless asked", () => {
    expect(labels("Union Station", names)).not.toContain("Union Station");
    expect(labels("Union Station", names, { includeExact: true })[0]).toBe("Union Station");
  });
  it("ranks closer names first and the same way every time", () => {
    const a = labels("union", names);
    expect(a).toEqual(["Union Station", "Union Square Park", "Reunion Hall"]);
    for (let i = 0; i < 5; i += 1) expect(labels("union", [...names].reverse())).toEqual(a);
  });
  it("breaks a score tie by shorter label, then text, then key", () => {
    const tie = suggest("zz", [c("zz b", "2"), c("zz a", "1"), c("zz ab", "0")], { limit: 5 });
    expect(tie.map((s) => s.label)).toEqual(["zz a", "zz b", "zz ab"]);
    const sameText = suggest("zz", [{ key: "b", label: "ZZ A", value: 1 }, { key: "a", label: "zz a", value: 2 }]);
    expect(sameText).toHaveLength(1);
  });
  it("returns nothing for a blank query, a zero limit, or no candidates", () => {
    expect(labels("", names)).toEqual([]);
    expect(labels("   ", names)).toEqual([]);
    expect(labels("union", names, { limit: 0 })).toEqual([]);
    expect(labels("union", [])).toEqual([]);
  });
  it("uses the default limit and never more than 20", () => {
    const many = Array.from({ length: 40 }, (_, i) => `Union ${i}`);
    expect(labels("union", many)).toHaveLength(DEFAULT_LIMIT);
    expect(labels("union", many, { limit: 99 })).toHaveLength(20);
  });
  it("skips blank labels and shows each distinct text once", () => {
    const out = suggest("union", [c("  "), c("Union Hall", "1"), c("UNION  HALL", "2"), c("Union Hall", "3")]);
    expect(out.map((s) => s.label)).toEqual(["Union Hall"]);
  });
  it("cuts a very long query and very long labels instead of failing", () => {
    const long = "union ".repeat(200);
    expect(() => suggest(long, names.map((n) => c(n)))).not.toThrow();
    const out = suggest("union", [c(`Union ${"x".repeat(500)}`)]);
    expect(out[0]!.label.length).toBeLessThanOrEqual(MAX_LABEL_CHARS);
    expect(MAX_QUERY_CHARS).toBe(80);
  });
  it("scans at most MAX_CANDIDATES candidates", () => {
    const many: Candidate[] = Array.from({ length: MAX_CANDIDATES + 10 }, (_, i) => c(`filler ${i}`));
    many.push(c("Union Hall"));
    expect(suggest("unoin hall", many)).toEqual([]);
    const early = [c("Union Hall"), ...many.slice(0, MAX_CANDIDATES + 5)];
    expect(suggest("unoin hall", early).map((s) => s.label)).toEqual(["Union Hall"]);
  });
  it("carries the candidate's value and key through", () => {
    const out = suggest("union", [{ key: "k1", label: "Union Hall", value: { id: 7 } }]);
    expect(out[0]).toMatchObject({ key: "k1", value: { id: 7 } });
  });
  it("does not change its input", () => {
    const input = names.map((n) => c(n));
    const copy = JSON.stringify(input);
    suggest("union", input);
    expect(JSON.stringify(input)).toBe(copy);
  });
  it("handles French names with apostrophes and ligatures", () => {
    expect(labels("oeuvre dart", ["Œuvre d’Art"], { includeExact: true })).toEqual(["Œuvre d’Art"]);
    expect(labels("hotel de vile", ["Hôtel de Ville"])).toEqual(["Hôtel de Ville"]);
  });
});

describe("short queries", () => {
  it("does not match a one- or two-letter query inside the middle of a word", () => {
    expect(suggest("ab", [c("Cabin")])).toEqual([]);
    expect(suggest("ab", [c("Cabin")], { includeExact: true })).toEqual([]);
  });
  it("still matches a three-letter query inside a word", () => {
    expect(suggest("abi", [c("Cabin")], { includeExact: true }).map((s) => s.label)).toEqual(["Cabin"]);
  });
});

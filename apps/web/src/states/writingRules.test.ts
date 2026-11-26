import { describe, expect, it } from "vitest";
import { WRITING_RULES, addressHits, looksLikeStreetAddress, caseShape, edgePunctuation, fieldOfRule, findContact, isWritingRule, nameHits, repeatedWord } from "./writingRules";

const rules = (hits: { rule: string }[]) => hits.map((h) => h.rule);

describe("caseShape", () => {
  it("counts letters, upper and lower case", () => expect(caseShape("Ab1 Cd!")).toEqual({ letters: 4, upper: 2, lower: 2 }));
  it("counts letters of any alphabet and gives no case to scripts without one", () => {
    expect(caseShape("東京カフェ")).toEqual({ letters: 5, upper: 0, lower: 0 });
    expect(caseShape("Café É")).toEqual({ letters: 5, upper: 2, lower: 3 });
  });
});

describe("findContact", () => {
  it.each([
    ["Visit www.example.ca today", "www.example.ca"],
    ["see example.com", "example.com"],
    ["mail me@place.org", "me@place.org"],
    ["call 416-555-0123", "416-555-0123"],
    ["call (416) 555 0123", "(416) 555 0123"],
    ["call 1-416-555-0123", "1-416-555-0123"],
    ["go to ftp://host/x", "ftp://host/x"],
  ])("finds the contact in %j", (text, piece) => expect(findContact(text)).toContain(piece));
  it.each(["Main Street", "Café Un", "12 King St W", "Unit 4", "Ca", "Rue Saint-Denis 555", "Room 101"])("finds none in %j", (text) => expect(findContact(text)).toBeNull());
  it("finds an e-mail before a web address inside it", () => expect(findContact("x@site.com")).toBe("x@site.com"));
});

describe("edgePunctuation", () => {
  it.each([["- Cafe", "-"], ["Cafe,", ","], ["| Cafe |", "|"], ["Cafe /", "/"], ["***Cafe", "***"]])("finds the edge of %j", (n, e) => expect(edgePunctuation(n)).toBe(e));
  it.each(["Cafe", "St. Mary’s", "Tom & Jerry's", "Cafe (Main)", "Cafe!", "A.B.C."])("finds none in %j", (n) => expect(edgePunctuation(n)).toBeNull());
});

describe("looksLikeStreetAddress", () => {
  it.each(["100 King Street West", "12 rue Saint-Denis", "5A Oak Ave", "100-104 Main St", "7 Maple Crescent"])("takes %j for an address", (t) => expect(looksLikeStreetAddress(t)).toBe(true));
  it.each(["7 Eleven", "Studio 54", "1000 Islands Cruises", "King Street West", "99 Bottles", ""])("does not take %j for one", (t) => expect(looksLikeStreetAddress(t)).toBe(false));
});

describe("repeatedWord", () => {
  it("finds a word written twice in a row without regard to case or accents", () => {
    expect(repeatedWord("Cafe cafe Un")).toBe("cafe");
    expect(repeatedWord("Café Cafe")).toBe("cafe");
  });
  it("ignores numbers and one-letter words", () => {
    expect(repeatedWord("Studio 54 54")).toBeNull();
    expect(repeatedWord("A A Place")).toBeNull();
  });
  it("ignores a word repeated with something between", () => expect(repeatedWord("Cafe Un Cafe")).toBeNull());
  it("is null for nothing", () => expect(repeatedWord("")).toBeNull());
});

describe("nameHits", () => {
  it("has no hits for no name or an ordinary name", () => {
    expect(nameHits(null, "1 Main St")).toEqual([]);
    expect(nameHits("Alpha Hall", "1 Main St")).toEqual([]);
    expect(nameHits("McDonald's", null)).toEqual([]);
  });
  it("flags a name in capitals, with at least five capital letters", () => {
    expect(rules(nameHits("CITY LIBRARY", null))).toContain("name-all-capitals");
    expect(rules(nameHits("YMCA", null))).not.toContain("name-all-capitals");
    expect(rules(nameHits("TD BANK", null))).toContain("name-all-capitals");
  });
  it("flags a name in lower case", () => {
    expect(rules(nameHits("city library", null))).toContain("name-all-lower");
    expect(rules(nameHits("cafe", null))).toContain("name-all-lower");
    expect(rules(nameHits("a b", null))).not.toContain("name-all-lower");
  });
  it("does not flag a name in a script with no case", () => expect(nameHits("東京カフェ", null)).toEqual([]));
  it("flags a contact in the name and says what it saw", () => {
    expect(nameHits("Alpha 416-555-0123", null)).toEqual([{ rule: "name-contact", seen: "416-555-0123" }]);
  });
  it("flags an address in the name field", () => expect(rules(nameHits("100 King Street West", null))).toContain("name-is-address"));
  it("does not flag a name that only has a number in it", () => {
    expect(rules(nameHits("Studio 54", null))).not.toContain("name-is-address");
    expect(rules(nameHits("7 Eleven", null))).not.toContain("name-is-address");
  });
  it("flags edge punctuation and a repeated word", () => {
    expect(nameHits("- Alpha", null)).toEqual([{ rule: "name-edge-punctuation", seen: "-" }]);
    expect(nameHits("Alpha Alpha Hall", null)).toEqual([{ rule: "name-repeated-word", seen: "alpha" }]);
  });
  it("flags a name that is the address, apart from case, dots and accents", () => {
    expect(rules(nameHits("1 main st.", "1 Main St"))).toContain("name-same-as-address");
    expect(rules(nameHits("Alpha", "1 Main St"))).not.toContain("name-same-as-address");
  });
  it("can give several hits for one name, in a fixed order", () => {
    expect(rules(nameHits("- CITY CITY LIBRARY", null))).toEqual(["name-all-capitals", "name-edge-punctuation", "name-repeated-word"]);
  });
});

describe("addressHits", () => {
  it("has no hits for no address or an ordinary address", () => {
    expect(addressHits(null)).toEqual([]);
    expect(addressHits("100 King Street West")).toEqual([]);
    expect(addressHits("12 Rue Saint-Denis")).toEqual([]);
  });
  it("flags an address in capitals or in lower case", () => {
    expect(rules(addressHits("100 KING STREET WEST"))).toContain("address-all-capitals");
    expect(rules(addressHits("100 king street west"))).toContain("address-all-lower");
  });
  it.each([["100 King St W, Toronto M5H 2N2", "M5H 2N2"], ["100 King St W m5h2n2", "m5h2n2"], ["5 Oak Ave, K1A-0B1", "K1A-0B1"]])("finds the postal code in %j", (a, seen) => {
    expect(addressHits(a)).toContainEqual({ rule: "address-postal-code", seen });
  });
  it("does not take a letter-digit mix that cannot be a postal code for one", () => {
    expect(rules(addressHits("12 D1D 1D1"))).not.toContain("address-postal-code");
    expect(rules(addressHits("Unit A1B 2C3 Main"))).toContain("address-postal-code");
  });
  it.each([["100 King St W, Toronto, ON", "ON"], ["100 King St W, Ontario", "Ontario"], ["1 Rue X, Québec", "Québec"], ["1 Main St, Canada.", "Canada"]])("finds the province in %j", (a, seen) => {
    expect(addressHits(a)).toContainEqual({ rule: "address-province", seen });
  });
  it("does not take the word on inside a street name for a province", () => expect(rules(addressHits("12 Lake on the Hill Road"))).not.toContain("address-province"));
  it("flags a street with no number, but not a P.O. box", () => {
    expect(rules(addressHits("King Street West"))).toContain("address-no-number");
    expect(rules(addressHits("PO Box 12"))).not.toContain("address-no-number");
  });
  it("flags a contact in the address", () => expect(rules(addressHits("1 Main St, www.example.ca"))).toContain("address-contact"));
});

describe("rule list", () => {
  it("names every rule once, with its field", () => {
    expect(new Set(WRITING_RULES).size).toBe(WRITING_RULES.length);
    for (const r of WRITING_RULES) expect(["name", "address"]).toContain(fieldOfRule(r));
    expect(fieldOfRule("name-contact")).toBe("name");
    expect(fieldOfRule("address-province")).toBe("address");
  });
  it("tells a rule from other values", () => {
    expect(isWritingRule("name-contact")).toBe(true);
    expect(isWritingRule("x")).toBe(false);
    expect(isWritingRule(null)).toBe(false);
  });
});

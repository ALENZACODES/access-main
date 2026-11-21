import { describe, expect, it } from "vitest";
import { lintCopy, type Locale } from "./copyLint";
import { MAX_ADDRESS_READ, addressFindingText, addressParams, addressSummary, checkAddress, kindWord, type AddressFinding } from "./queryLive";
import { QUERY_KINDS, QUERY_REGISTER } from "./queryRegister";

const LOCALES: readonly Locale[] = ["en", "fr"];
const check = (search: string) => checkAddress(QUERY_REGISTER, search);
const codes = (search: string): string[] => check(search).findings.map((f) => `${f.code} ${f.name}`);

describe("addressParams", () => {
  it("reads names and values, with or without the question mark", () => {
    expect(addressParams("?a=1&b=2")).toEqual([["a", "1"], ["b", "2"]]);
    expect(addressParams("a=1&b=2")).toEqual([["a", "1"], ["b", "2"]]);
  });
  it("is empty for an empty string or a lone question mark", () => {
    expect(addressParams("")).toEqual([]);
    expect(addressParams("?")).toEqual([]);
  });
  it("decodes percent codes and plus signs as the browser does", () => {
    expect(addressParams("?q=a%20b+c&n%61me=%C3%A9")).toEqual([["q", "a b c"], ["name", "é"]]);
  });
  it("keeps a name with no value, an empty value, and a repeated name", () => {
    expect(addressParams("?a&b=&a=2")).toEqual([["a", ""], ["b", ""], ["a", "2"]]);
  });
  it("leaves out everything from a hash on", () => {
    expect(addressParams("?a=1#b=2")).toEqual([["a", "1"]]);
    expect(addressParams("#a=1")).toEqual([]);
  });
  it("does not throw on a bad percent code or a lone surrogate", () => {
    expect(() => addressParams("?a=%E0%A4%A&b=\ud800")).not.toThrow();
    expect(addressParams("?a=%zz")).toEqual([["a", "%zz"]]);
  });
  it("reads no more than the limit", () => {
    const long = `?a=${"x".repeat(MAX_ADDRESS_READ * 2)}`;
    expect(addressParams(long)[0]?.[1].length).toBe(MAX_ADDRESS_READ - 3);
  });
  it("skips empty pieces between ampersands", () => {
    expect(addressParams("?&&a=1&&")).toEqual([["a", "1"]]);
  });
});

describe("checkAddress", () => {
  it("finds nothing in an address with no parameters, and counts none", () => {
    expect(check("")).toEqual({ params: 0, findings: [] });
  });
  it("finds nothing in an address with only choices and layout", () => {
    expect(check("?need=wheelchair&unk=1&sort=retrieved&dir=desc&page=2&lang=fr")).toEqual({ params: 6, findings: [] });
  });
  it("says a place on the map is carried, and which parameter", () => {
    expect(check("?near=43.65,-79.38").findings).toEqual([{ code: "carries-personal", name: "near", kind: "place", detail: {} }]);
  });
  it("says it for latitude and longitude one at a time", () => {
    expect(codes("?lat=43.6&lon=-79.3")).toEqual(["carries-personal lat", "carries-personal lon"]);
  });
  it("says typed words are carried", () => {
    expect(check("?q=library").findings[0]).toMatchObject({ code: "carries-personal", name: "q", kind: "typed" });
  });
  it("says picked places are carried", () => {
    expect(check("?ids=a,b").findings[0]).toMatchObject({ kind: "ids" });
    expect(check("?place=abc").findings[0]).toMatchObject({ kind: "ids" });
  });
  it("does not report a personal name with an empty value", () => {
    expect(codes("?near=&q=")).toEqual([]);
  });
  it("reports a personal name once however many times it appears", () => {
    expect(codes("?q=a&q=b&q=c")).toEqual(["carries-personal q"]);
  });
  it("reports an unlisted name once, in the order they first appear", () => {
    expect(codes("?zeta=1&alpha=2&zeta=3")).toEqual(["unlisted zeta", "unlisted alpha"]);
  });
  it("reports an unlisted name even with no value", () => {
    expect(codes("?utm")).toEqual(["unlisted utm"]);
  });
  it("finds a facet name and a prefixed name through the run-time rows", () => {
    expect(codes("?licence=ODbL-1.0&tier=0&stale_places=30")).toEqual([]);
    expect(codes("?stale_other=1")).toEqual(["unlisted stale_other"]);
  });
  it("says a value is longer than the code reads, with both numbers", () => {
    const f = check(`?q=${"x".repeat(150)}`).findings;
    expect(f.map((x) => x.code)).toEqual(["carries-personal", "over-length"]);
    expect(f[1]?.detail).toEqual({ allowed: 100, found: 150 });
  });
  it("does not say it for a value exactly at the limit", () => {
    expect(codes(`?q=${"x".repeat(100)}`)).toEqual(["carries-personal q"]);
  });
  it("says it for each long value of a repeated name", () => {
    expect(codes(`?q=${"x".repeat(101)}&q=${"y".repeat(102)}`)).toEqual(["carries-personal q", "over-length q", "over-length q"]);
  });
  it("counts a repeated name each time", () => {
    expect(check("?a=1&a=2").params).toBe(2);
  });
  it("never repeats a value in what it says", () => {
    const secret = "43.123456,-79.654321";
    for (const l of LOCALES) for (const f of check(`?near=${secret}`).findings) expect(addressFindingText(l, f)).not.toContain("43.12");
  });
  it("reads a name that has to be decoded", () => {
    expect(codes("?n%65ar=1,2")).toEqual(["carries-personal near"]);
  });
  it("does not look inside a hash", () => {
    expect(codes("?lang=fr#near=1,2")).toEqual([]);
  });
  it("gives the same answer for the same address", () => {
    expect(check("?q=a&near=1,2&x=1")).toEqual(check("?q=a&near=1,2&x=1"));
  });
});

describe("the sentences", () => {
  const finding = (code: AddressFinding["code"], over: Partial<AddressFinding> = {}): AddressFinding => ({ code, name: "near", kind: "place", detail: { allowed: 100, found: 150 }, ...over });
  it("names the parameter and says what it holds, in English", () => {
    expect(addressFindingText("en", finding("carries-personal"))).toBe("The address of this page carries “near”, which holds a place on the map. Anyone who is given this address can see it.");
  });
  it("names the parameter and says what it holds, in French, with the narrow spaces", () => {
    expect(addressFindingText("fr", finding("carries-personal"))).toBe("L’adresse de cette page contient « near », qui transmet un lieu sur la carte. Toute personne qui reçoit cette adresse peut le voir.");
  });
  it("says an unlisted name is not known here", () => {
    expect(addressFindingText("en", finding("unlisted"))).toContain("not known here");
    expect(addressFindingText("fr", finding("unlisted"))).toContain("n’est pas connu ici");
  });
  it("gives both numbers for a long value", () => {
    expect(addressFindingText("en", finding("over-length"))).toBe("The value of “near” is 150 characters long, and the code reads at most 100 of them.");
    expect(addressFindingText("fr", finding("over-length"))).toContain("compte 150 caractères");
  });
  it("has a word for every kind in both languages", () => {
    for (const k of QUERY_KINDS) for (const l of LOCALES) expect(kindWord(l, k).length, `${k} ${l}`).toBeGreaterThan(3);
  });
  it("passes the copy lint in both languages for every code and kind", () => {
    for (const l of LOCALES) {
      for (const code of ["carries-personal", "unlisted", "over-length"] as const) {
        for (const k of QUERY_KINDS) expect(lintCopy(l, addressFindingText(l, finding(code, { kind: k }))), `${l} ${code} ${k}`).toEqual([]);
      }
    }
  });
  it("says how many parameters were read and how many things were found", () => {
    expect(addressSummary("en", 0, 0)).toBe("The address of this page has no parameters.");
    expect(addressSummary("en", 1, 0)).toBe("Read 1 parameter from the address of this page. Nothing to report.");
    expect(addressSummary("en", 3, 1)).toBe("Read 3 parameters from the address of this page. 1 thing to report.");
    expect(addressSummary("en", 3, 2)).toContain("2 things to report");
    expect(addressSummary("fr", 0, 0)).toBe("L’adresse de cette page ne contient aucun paramètre.");
    expect(addressSummary("fr", 1, 0)).toBe("1 paramètre lu dans l’adresse de cette page. Rien à signaler.");
    expect(addressSummary("fr", 3, 2)).toBe("3 paramètres lus dans l’adresse de cette page. 2 points à signaler.");
  });
  it("passes the copy lint for every summary", () => {
    for (const l of LOCALES) for (const [p, f] of [[0, 0], [1, 0], [1, 1], [5, 3]] as const) expect(lintCopy(l, addressSummary(l, p, f)), `${l} ${p} ${f}`).toEqual([]);
  });
});

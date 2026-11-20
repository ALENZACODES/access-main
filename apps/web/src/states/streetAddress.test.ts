import { describe, expect, it } from "vitest";
import { foldAddressText, parityOf, parseAddress } from "./streetAddress";

type Want = Partial<ReturnType<typeof parseAddress>>;
const cases: ReadonlyArray<readonly [string, string, Want]> = [
  ["a plain English address", "279 Yonge Street", { kind: "street", number: "279", numberValue: 279, street: "Yonge Street", key: "yonge street", direction: null, unit: null }],
  ["a short street type", "279 Yonge St", { street: "Yonge Street", key: "yonge street" }],
  ["a short type with a dot", "279 Yonge St.", { street: "Yonge Street", key: "yonge street" }],
  ["upper case", "279 YONGE STREET", { street: "Yonge Street", key: "yonge street" }],
  ["extra spaces", "  279   Yonge   Street  ", { number: "279", street: "Yonge Street" }],
  ["avenue", "12 Elm Ave", { street: "Elm Avenue", key: "elm avenue" }],
  ["boulevard", "12 Lake Shore Blvd", { street: "Lake Shore Boulevard", key: "lake shore boulevard" }],
  ["road", "12 Finch Rd", { street: "Finch Road", key: "finch road" }],
  ["drive", "12 Park Dr", { street: "Park Drive", key: "park drive" }],
  ["crescent", "12 Oak Cres", { street: "Oak Crescent", key: "oak crescent" }],
  ["parkway", "12 Don Valley Pkwy", { street: "Don Valley Parkway", key: "don valley parkway" }],
  ["a street with a type and no number", "Dundas Street East", { kind: "street", number: null, numberValue: null, street: "Dundas Street East", key: "dundas street E", direction: "E" }],
  ["a square", "20 Dundas Square", { street: "Dundas Square", key: "dundas square", direction: null }],
  ["a trailing east", "1 Dundas Street East", { direction: "E", key: "dundas street E", street: "Dundas Street East" }],
  ["a trailing short east", "1 Dundas St E", { direction: "E", key: "dundas street E", street: "Dundas Street East" }],
  ["a trailing west", "100 King St W", { direction: "W", street: "King Street West" }],
  ["a trailing north", "100 Bathurst Street North", { direction: "N", street: "Bathurst Street North" }],
  ["a trailing south", "100 Bathurst St S", { direction: "S", street: "Bathurst Street South" }],
  ["a direction with a dot", "100 King St. W.", { direction: "W", key: "king street W" }],
  ["a street with two words and a trailing direction word that is part of the name", "5 Dundas East", { direction: null, key: "dundas east", street: "Dundas East" }],
  ["a type followed by a direction word is a name, not a direction", "1 Avenue Est", { direction: null, key: "avenue est", street: "Avenue Est" }],
  ["a highway number with a direction", "Highway 7 East", { direction: "E", key: "highway 7 E", street: "Highway 7 East" }],
  ["a number with a letter", "12A Elm Ave", { number: "12A", numberValue: 12 }],
  ["a number range", "100-104 King St", { number: "100-104", numberValue: 100 }],
  ["a number range with spaces and an en dash", "100 – 104 King St", { number: "100-104", numberValue: 100 }],
  ["a unit then a number", "5-100 King St", { number: "5-100", numberValue: 5, street: "King Street" }],
  ["a unit as the first part", "Unit 5, 100 King St W", { number: "100", unit: "Unit 5", key: "king street W" }],
  ["a suite as the first part", "Suite 200; 100 King St", { number: "100", unit: "Suite 200" }],
  ["a unit as a later part", "100 King St, Unit 4", { number: "100", unit: "Unit 4", street: "King Street" }],
  ["a unit at the end", "100 King St Unit 5", { unit: "Unit 5", street: "King Street" }],
  ["a hash unit at the end", "12A Elm Ave #3", { unit: "#3", street: "Elm Avenue" }],
  ["an apartment at the end", "12 Elm Ave Apt 3B", { unit: "Apt 3B", street: "Elm Avenue" }],
  ["a rear note after a semicolon", "1 Main Street, Unit 2; rear", { number: "1", unit: "Unit 2", street: "Main Street" }],
  ["a city after a comma", "1 Main Street, Toronto, ON", { number: "1", street: "Main Street", key: "main street" }],
  ["a French street", "123 rue Principale", { street: "Rue Principale", key: "rue principale" }],
  ["a French street with an accent", "45 rue de la Gauchetière", { street: "Rue de la Gauchetière", key: "rue de la gauchetiere" }],
  ["a French street typed without the accent", "45 rue de la Gauchetiere", { key: "rue de la gauchetiere" }],
  ["a French direction", "123 rue Sainte-Catherine Ouest", { direction: "W", street: "Rue Sainte-Catherine Ouest", key: "rue sainte-catherine W" }],
  ["a one-letter French direction", "45 Rue de la Gauchetière O", { direction: "W", street: "Rue de la Gauchetière Ouest" }],
  ["a French east", "10 boulevard Saint-Laurent Est", { direction: "E", street: "Boulevard Saint-Laurent Est" }],
  ["a French north", "10 chemin Sainte-Foy Nord", { direction: "N", street: "Chemin Sainte-Foy Nord" }],
  ["a French short type", "10 boul. Saint-Laurent", { street: "Boulevard Saint-Laurent", key: "boulevard saint-laurent" }],
  ["a French apostrophe", "12 rue de l’Église", { street: "Rue de l'Église", key: "rue de l' eglise" }],
  ["a straight apostrophe matches the curly one", "12 rue de l'Eglise", { key: "rue de l' eglise" }],
  ["a French avenue", "8 avenue du Parc", { street: "Avenue du Parc", key: "avenue du parc" }],
  ["a French impasse", "3 impasse des Lilas", { street: "Impasse des Lilas" }],
  ["a street with no type", "12 Yonge", { kind: "street", street: "Yonge", key: "yonge" }],
];

describe("parseAddress: what it reads", () => {
  it.each(cases)("%s", (_label, input, want) => {
    expect(parseAddress(input)).toMatchObject(want);
  });
});

describe("parseAddress: lines that are not one street", () => {
  const none = { kind: "none", number: null, numberValue: null, street: null, key: null, direction: null, unit: null };
  it.each([[null], [undefined], [""], ["   "], ["UNKNOWN"], ["unknown"], ["INCONNU"], ["n/a"], ["N/A"], ["-"], ["--"], ["?"], ["TBD"], ["100"], ["12A"], ["100-104"]])("reads %j as no address", (input) => {
    expect(parseAddress(input as string | null | undefined)).toEqual(none);
  });
  it.each([["PO Box 12"], ["P.O. Box 12"], ["po box 99, Toronto"], ["Case postale 45"], ["C.P. 12"]])("reads %j as a post office box", (input) => {
    expect(parseAddress(input)).toMatchObject({ kind: "po-box", street: null, key: null });
  });
  it.each([["King & Bay"], ["King St and Bay St"], ["King St at Bay St"], ["corner of King and Bay"], ["King @ Bay"], ["coin Sainte-Catherine et Peel"], ["rue Peel et rue Sainte-Catherine"], ["Intersection of King and Bay"]])("reads %j as a corner", (input) => {
    expect(parseAddress(input)).toMatchObject({ kind: "intersection", street: null, key: null });
  });
  it("does not call a name with an 'and' a corner when the parts are not both streets", () => {
    expect(parseAddress("12 Rock and Roll Way")).toMatchObject({ kind: "street", key: "rock and roll way" });
  });
  it("gives no number to a line with no street", () => {
    expect(parseAddress("100").number).toBeNull();
  });
  it("never invents a street for a unit alone", () => {
    expect(parseAddress("Unit 5").street).toBe("Unit 5");
  });
});

describe("parseAddress: matching the same street", () => {
  const same = (a: string, b: string) => expect(parseAddress(a).key).toBe(parseAddress(b).key);
  it("St, St. and Street are one street", () => {
    same("1 Yonge St", "2 Yonge Street");
    same("1 Yonge St.", "2 YONGE STREET");
  });
  it("Ave, Av and Avenue are one street", () => {
    same("1 Elm Ave", "1 Elm Avenue");
    same("1 Elm Av", "1 Elm Avenue");
  });
  it("accents and case do not split a street", () => {
    same("1 rue Québec", "1 RUE QUEBEC");
    same("1 Rue Sainte-Thérèse", "1 rue sainte-therese");
  });
  it("the two sides of a divided street are different streets", () => {
    expect(parseAddress("1 King St E").key).not.toBe(parseAddress("1 King St W").key);
  });
  it("a street with a direction is not the street without one", () => {
    expect(parseAddress("1 King St E").key).not.toBe(parseAddress("1 King St").key);
  });
  it("different streets stay different", () => {
    expect(parseAddress("1 King St").key).not.toBe(parseAddress("1 Queen St").key);
    expect(parseAddress("1 King St").key).not.toBe(parseAddress("1 King Rd").key);
  });
  it("a unit or number does not change the street", () => {
    same("1 King St", "Unit 4, 99 King St");
    same("1 King St", "5-99 King St");
  });
  it("French and English types stay separate: Rue and Street are not joined", () => {
    expect(parseAddress("1 rue King").key).not.toBe(parseAddress("1 King Street").key);
  });
});

describe("parseAddress: repeated units", () => {
  it("keeps the first unit and still finds the street when several units come first", () => {
    expect(parseAddress("Unit 5, Suite 6, 100 King St")).toMatchObject({ unit: "Unit 5", number: "100", key: "king street" });
  });
  it("keeps the first unit when units are written both before and after", () => {
    expect(parseAddress("Unit 5, 100 King St Unit 6").unit).toBe("Unit 5");
  });
  it("strips several units at the end of the street part", () => {
    expect(parseAddress("100 King St Unit 5 #6")).toMatchObject({ key: "king street", unit: "#6" });
  });
});

describe("parseAddress: other details", () => {
  it("does not change the text it is given and returns a fresh object each time", () => {
    const text = "100 King St W";
    const a = parseAddress(text);
    const b = parseAddress(text);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(text).toBe("100 King St W");
  });
  it("turns line breaks and tabs into spaces", () => {
    expect(parseAddress("100\tKing\nSt")).toMatchObject({ number: "100", street: "King Street" });
  });
  it("ignores a control character", () => {
    expect(parseAddress("100 King\u0007 St").street).toBe("King Street");
  });
  it("keeps a long line readable without failing", () => {
    expect(parseAddress(`1 ${"A".repeat(500)} St`).kind).toBe("street");
  });
  it("reads digits that are far larger than a safe integer without a wrong value", () => {
    const a = parseAddress("99999999999999999999 King St");
    expect(a.number).toBe("99999999999999999999");
    expect(Number.isFinite(a.numberValue ?? 0)).toBe(true);
  });
  it("keeps the number text as written, with its letter", () => {
    expect(parseAddress("100b King St").number).toBe("100b");
  });
  it("keeps a French hyphen in a saint name capitalised on both sides", () => {
    expect(parseAddress("1 rue saint-jean-baptiste").street).toBe("Rue Saint-Jean-Baptiste");
  });
  it("writes the French direction word for a French street and the English one for an English street", () => {
    expect(parseAddress("1 rue Peel E").street).toBe("Rue Peel Est");
    expect(parseAddress("1 Peel Street E").street).toBe("Peel Street East");
  });
  it("does not read a single trailing O as a direction on an English street", () => {
    expect(parseAddress("1 Peel Street O").direction).toBeNull();
  });
});

describe("parityOf", () => {
  it("is odd or even for a number", () => {
    expect(parityOf(1)).toBe("odd");
    expect(parityOf(2)).toBe("even");
    expect(parityOf(0)).toBe("even");
    expect(parityOf(279)).toBe("odd");
    expect(parityOf(1000)).toBe("even");
  });
  it("is null when there is no number", () => {
    expect(parityOf(null)).toBeNull();
  });
});

describe("foldAddressText", () => {
  it("lowers case, drops accents and dots, and tidies spaces", () => {
    expect(foldAddressText("  Rue  Sainte-Thérèse. ")).toBe("rue sainte-therese");
  });
  it("turns the curly apostrophe into a straight one", () => {
    expect(foldAddressText("L’Église")).toBe("l'eglise");
  });
  it("is stable when applied twice", () => {
    const once = foldAddressText("Élan, St. ");
    expect(foldAddressText(once)).toBe(once);
  });
});

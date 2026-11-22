import { describe, expect, it } from "vitest";
import { findCoordinates, hasPointNear, maxDigits, resolutionMetres, tallyDigits } from "./lcText";

describe("findCoordinates", () => {
  it("reads a GPX point", () => expect(findCoordinates('<wpt lat="43.12346" lon="-79.98765">')[0]).toMatchObject({ form: "gpx", first: 43.12346, second: -79.98765, digits: 5 }));
  it("reads a geo link and a vCard line", () => {
    expect(findCoordinates("geo:43.12346,-79.98765")[0]).toMatchObject({ form: "geo-uri", digits: 5 });
    expect(findCoordinates("GEO:43.12346;-79.98765")[0]).toMatchObject({ form: "vcard", digits: 5 });
  });
  it("reads a pair with a comma and a space, as written for a person", () => expect(findCoordinates("Position: 43.1235, -79.9877")[0]).toMatchObject({ form: "pair", digits: 4, first: 43.1235, second: -79.9877 }));
  it("reads the French form, with a decimal comma and a semicolon", () => {
    const m = findCoordinates("43,12346 ; -79,98765")[0];
    expect(m).toMatchObject({ form: "pair", digits: 5, first: 43.12346, second: -79.98765 });
  });
  it("reads two numbers in a CSV row, after other cells", () => {
    expect(findCoordinates("1,a,Place a,yes,cafe,1 Main Street,43.65,-79.39,75897,75897,yes")[0]).toMatchObject({ first: 43.65, second: -79.39, digits: 2 });
  });
  it("reads a pair after a cell that is a number", () => expect(findCoordinates("1,43.65,-79.39")[0]).toMatchObject({ first: 43.65, second: -79.39 }));
  it("reads GeoJSON coordinates on two lines, longitude first", () => {
    const m = findCoordinates('"coordinates": [\n  -79.39,\n  43.65\n]')[0];
    expect(m).toMatchObject({ first: -79.39, second: 43.65 });
  });
  it("counts the decimals of the longer number", () => expect(findCoordinates("43.12, -79.123456")[0]?.digits).toBe(6));
  it("needs two decimals in each number of a generic pair", () => {
    expect(findCoordinates("3, 4")).toEqual([]);
    expect(findCoordinates("43.6, -79")).toEqual([]);
    expect(findCoordinates("43.65, -79.38")).toHaveLength(1);
  });
  it("does not read a pair that cannot be a place", () => {
    expect(findCoordinates("123.45, 234.56")).toEqual([]);
    expect(findCoordinates("85.12, 95.12")).toHaveLength(1);
    expect(findCoordinates("95.12, 95.12")).toEqual([]);
    expect(findCoordinates("95.12, 195.12")).toEqual([]);
  });
  it("does not read a version, a date or a price", () => {
    expect(findCoordinates("version 1.2.3, 4.5.6 and 2026-11-21 $10.99, $20.00")).toEqual([]);
  });
  it("finds each coordinate once and in order", () => {
    const t = 'a 43.65, -79.38 b lat="44.12" lon="-80.01" c geo:45.12,-81.34';
    expect(findCoordinates(t).map((m) => m.form)).toEqual(["pair", "gpx", "geo-uri"]);
  });
  it("gives nothing for no coordinates and for an empty text", () => {
    expect(findCoordinates("no numbers here")).toEqual([]);
    expect(findCoordinates("")).toEqual([]);
  });
  it("reads a long run of decimals as one coordinate with all its digits", () => expect(findCoordinates("43.123456789012, -79.987654321098")[0]?.digits).toBe(12));
});

describe("what is said of a set of coordinates", () => {
  const set = findCoordinates('lat="43.12346" lon="-79.98765" and 43.65, -79.38 and 44.1234, -80.1234');
  it("resolutionMetres is about 1.1 m at five decimals, 11 m at four, 111 km at none", () => {
    expect(resolutionMetres(5)).toBeCloseTo(1.1132, 3);
    expect(resolutionMetres(4)).toBeCloseTo(11.132, 2);
    expect(resolutionMetres(0)).toBe(111_320);
  });
  it("maxDigits is the largest, or 0", () => {
    expect(maxDigits(set)).toBe(5);
    expect(maxDigits([])).toBe(0);
  });
  it("tallyDigits counts per number of decimals, in order", () => expect([...tallyDigits(set)]).toEqual([[2, 1], [4, 1], [5, 1]]));
  it("hasPointNear checks the distance in both orders for a pair", () => {
    expect(hasPointNear(findCoordinates("43.65000, -79.38000"), 43.65, -79.38, 2)).toBe(true);
    expect(hasPointNear(findCoordinates("-79.38000, 43.65000"), 43.65, -79.38, 2)).toBe(true);
    expect(hasPointNear(findCoordinates("43.66000, -79.38000"), 43.65, -79.38, 100)).toBe(false);
  });
  it("hasPointNear does not swap the order of a GPX point", () => expect(hasPointNear(findCoordinates('lat="-79.38" lon="43.65"'), 43.65, -79.38, 100)).toBe(false));
});

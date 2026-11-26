import { describe, expect, it } from "vitest";
import { ADDRESS_READINGS, ENGLISH_STREET_WORDS, FRENCH_STREET_WORDS, NAME_ADDRESS_MATCHES, compareNameAndAddress, readAddressLanguage } from "./addressLanguage";
import { ENGLISH_NAME_WORDS, FRENCH_NAME_WORDS } from "./nameLexicon";
import { NAME_READINGS } from "./nameLanguage";

const reading = (a: string | null) => readAddressLanguage(a).reading;

describe("readAddressLanguage", () => {
  it.each([
    ["123 Rue Principale", "french"],
    ["45 Chemin du Lac", "french"],
    ["9 Boul. Laurier", "french"],
    ["12 Rue Saint-Jean Ouest", "french"],
    ["7 Impasse des Pins", "french"],
    ["15 Montée Paiement", "french"],
    ["100 Main Street", "english"],
    ["100 Main St", "english"],
    ["100 Main St.", "english"],
    ["22 Oak Road", "english"],
    ["22 Oak Rd. N", "english"],
    ["5 Maple Drive West", "english"],
    ["5 Maple Dr", "english"],
    ["31 Pine Crescent", "english"],
    ["31 Lakeshore Trail", "english"],
    ["Concession 4", "neither"],
    ["8 Elm Lane", "english"],
    ["1 Queen Street West, Toronto, ON", "english"],
    ["1 Rue Principale, Ottawa, ON", "french"],
    ["St. Clair Avenue", "neither"],
    ["20 St. Clair Avenue West", "english"],
    ["77 Bloor Avenue", "neither"],
    ["2 Bayview Boulevard", "neither"],
    ["10 King", "neither"],
    ["Rue Principale Street", "both"],
    ["11 Rue Main Street", "both"],
    ["", "no-address"],
    ["   ", "no-address"],
  ])("reads %j as %s", (address, want) => expect(reading(address)).toBe(want));

  it("is no-address for no address", () => expect(reading(null)).toBe("no-address"));
  it("reads only the street part, before the first comma", () => {
    expect(reading("1 Oak Avenue, Rue Principale")).toBe("neither");
    expect(reading("1 Oak Street, Rue Principale")).toBe("english");
  });
  it("does not read St as English unless it ends the street part, ignoring a direction after it", () => {
    expect(reading("St-Jean Boulevard")).toBe("neither");
    expect(reading("5 St John Street")).toBe("english");
    expect(reading("5 Oak St W")).toBe("english");
  });
  it("lists the words it found, once each", () => {
    expect(readAddressLanguage("12 Rue Saint-Jean Ouest").french).toEqual(["rue", "ouest"]);
    expect(readAddressLanguage("5 Maple Drive West")).toMatchObject({ english: ["drive", "west"], french: [] });
    expect(readAddressLanguage("Rue Rue").french).toEqual(["rue"]);
  });
  it("reads a direction only after a street type", () => {
    expect(reading("North Bay")).toBe("neither");
    expect(reading("1 Main Street North")).toBe("english");
    expect(readAddressLanguage("1 Main Street North").english).toEqual(["street", "north"]);
  });
  it("has no word in both street lists, and none that the name lists would read the other way", () => {
    for (const w of FRENCH_STREET_WORDS) expect(ENGLISH_STREET_WORDS.has(w), w).toBe(false);
    for (const w of ["avenue", "est", "boulevard", "place", "court", "route", "centre"]) {
      expect(FRENCH_STREET_WORDS.has(w) && ENGLISH_STREET_WORDS.has(w), w).toBe(false);
    }
    expect(FRENCH_STREET_WORDS.has("avenue")).toBe(false);
    expect(ENGLISH_STREET_WORDS.has("avenue")).toBe(false);
    expect([...FRENCH_NAME_WORDS].filter((w) => ENGLISH_STREET_WORDS.has(w))).toEqual([]);
    expect([...ENGLISH_NAME_WORDS].filter((w) => FRENCH_STREET_WORDS.has(w) && w !== "")).toEqual([]);
  });
  it("lists the readings, with no-address last", () => {
    expect(ADDRESS_READINGS.at(-1)).toBe("no-address");
    expect(new Set(ADDRESS_READINGS).size).toBe(ADDRESS_READINGS.length);
  });
});

describe("compareNameAndAddress", () => {
  it.each([
    ["french", "french", "same"],
    ["english", "english", "same"],
    ["french", "english", "differs"],
    ["english", "french", "differs"],
    ["both", "french", "same"],
    ["both", "english", "same"],
    ["french", "both", "same"],
    ["both", "both", "same"],
    ["french", "neither", "one-side"],
    ["neither", "english", "one-side"],
    ["both", "neither", "one-side"],
    ["neither", "both", "one-side"],
    ["neither", "neither", "neither"],
    ["other-script", "english", "one-side"],
    ["other-script", "neither", "neither"],
    ["no-name", "english", "missing"],
    ["french", "no-address", "missing"],
    ["no-name", "no-address", "missing"],
  ])("compares a %s name with a %s address as %s", (name, address, want) => expect(compareNameAndAddress(name as never, address as never)).toBe(want));
  it("has a distinct set of matches", () => expect(new Set(NAME_ADDRESS_MATCHES).size).toBe(5));
  it("answers for every pair of readings", () => {
    for (const n of NAME_READINGS) for (const a of ADDRESS_READINGS) expect(NAME_ADDRESS_MATCHES).toContain(compareNameAndAddress(n, a));
  });
  it("is symmetric for the two languages", () => {
    for (const n of ["french", "english", "both", "neither"] as const) for (const a of ["french", "english", "both", "neither"] as const) {
      const flip = (r: string) => (r === "french" ? "english" : r === "english" ? "french" : r);
      expect(compareNameAndAddress(n, a)).toBe(compareNameAndAddress(flip(n) as never, flip(a) as never));
    }
  });
});

import { describe, expect, it } from "vitest";
import { ENGLISH_NAME_WORDS, FRENCH_ACCENT_LETTERS, FRENCH_NAME_WORDS, SHARED_NAME_WORDS } from "./nameLexicon";

describe("the name lexicon", () => {
  it("has no word in both lists", () => expect(SHARED_NAME_WORDS).toEqual([]));
  it("has words that are folded: lower case, no accents, no dots, no spaces", () => {
    for (const w of [...FRENCH_NAME_WORDS, ...ENGLISH_NAME_WORDS]) {
      expect(w, w).toBe(w.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase());
      expect(w, w).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });
  it("has a useful number of words in each language", () => {
    expect(FRENCH_NAME_WORDS.size).toBeGreaterThan(80);
    expect(ENGLISH_NAME_WORDS.size).toBeGreaterThan(80);
  });
  it("leaves out words that both languages use", () => {
    for (const w of ["centre", "place", "hotel", "restaurant", "theatre", "cinema", "pizza", "cafe", "bar", "club", "garage", "station", "village", "college", "avenue", "arena", "residence", "association", "services", "police", "court"]) {
      expect(FRENCH_NAME_WORDS.has(w) && ENGLISH_NAME_WORDS.has(w), w).toBe(false);
      expect(FRENCH_NAME_WORDS.has(w), w).toBe(false);
    }
  });
  it("has the everyday words for each language", () => {
    for (const w of ["rue", "ecole", "bibliotheque", "eglise", "musee", "parc", "hopital", "la", "les", "du"]) expect(FRENCH_NAME_WORDS.has(w), w).toBe(true);
    for (const w of ["street", "school", "library", "church", "park", "hospital", "the", "of", "and"]) expect(ENGLISH_NAME_WORDS.has(w), w).toBe(true);
  });
  it("lists only letters that English does not use as French accents", () => {
    expect(FRENCH_ACCENT_LETTERS).toContain("é");
    expect(FRENCH_ACCENT_LETTERS).toContain("ç");
    expect(FRENCH_ACCENT_LETTERS).not.toMatch(/[a-z]/);
  });
  it("has no name of a person, a brand or a town", () => {
    for (const w of ["tim", "hortons", "smith", "toronto", "ottawa", "mcdonalds", "walmart", "jean", "marie"]) {
      expect(FRENCH_NAME_WORDS.has(w) || ENGLISH_NAME_WORDS.has(w), w).toBe(false);
    }
  });
});

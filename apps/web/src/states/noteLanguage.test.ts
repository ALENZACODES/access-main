import { describe, expect, it } from "vitest";
import { guessNoteLanguage, noteLocale } from "./noteLanguage";

describe("guessNoteLanguage", () => {
  it("knows plain English notes", () => {
    expect(guessNoteLanguage("Ramp at the side entrance. Ring the bell for staff to help.").language).toBe("en");
    expect(guessNoteLanguage("Two steps at the front door; no ramp.").language).toBe("en");
  });
  it("knows plain French notes", () => {
    expect(guessNoteLanguage("Entrée par le côté, sonnez la sonnette. Pas d’escalier.").language).toBe("fr");
    expect(guessNoteLanguage("Salle de bain au sous-sol, ascenseur disponible").language).toBe("fr");
  });
  it("ignores accents and case", () => {
    expect(guessNoteLanguage("ENTRÉE PAR LE CÔTÉ").language).toBe("fr");
  });
  it("is unsure with too little to go on", () => {
    expect(guessNoteLanguage("").language).toBe("unsure");
    expect(guessNoteLanguage("Open daily").language).toBe("unsure");
    expect(guessNoteLanguage("Café").language).toBe("unsure");
  });
  it("is unsure on a tie", () => {
    expect(guessNoteLanguage("the porte").language).toBe("unsure");
  });
  it("reports the counts", () => {
    const g = guessNoteLanguage("the door and the ramp");
    expect(g.en).toBeGreaterThanOrEqual(4);
    expect(g.fr).toBe(0);
  });
  it("is not fooled by one shared word", () => {
    expect(guessNoteLanguage("Elevator no").language).toBe("unsure");
  });
});

describe("noteLocale", () => {
  it("follows the note when it is clear", () => {
    expect(noteLocale("Ring the bell at the side door.", "fr")).toBe("en");
    expect(noteLocale("Sonnez la sonnette par le côté.", "en")).toBe("fr");
  });
  it("falls back to the page language when unsure", () => {
    expect(noteLocale("Open daily", "fr")).toBe("fr");
    expect(noteLocale("", "en")).toBe("en");
  });
});

import { describe, expect, it } from "vitest";
import {
  charsPhrase, colonFor, coverageSentence, duplicatesHeading, lengthLabel, lengthWord, noMatchSentence, noNotesAtAll, noteAsWritten, noteHeading, noteIntro, noteNoName, noteNoun, noteToggle,
  orderLabelFor, placesNoun, repeatedLabel, repeatedOnlyLabel, searchHelp, searchLabel, shownSentence, showLess, showWhole, tagCountsLine, tagLine, withoutSentence,
} from "./packNoteCopy";
import { lintCopy } from "./copyLint";
import type { Locale } from "./stateCopy";

const NBSP = "\u00a0";
const LOCALES: Locale[] = ["en", "fr"];

describe("nouns", () => {
  it("agree with the number in both languages", () => {
    expect([0, 1, 2].map((n) => placesNoun(n, "en"))).toEqual(["places", "place", "places"]);
    expect([0, 1, 2].map((n) => placesNoun(n, "fr"))).toEqual(["lieux", "lieu", "lieux"]);
    expect([1, 2].map((n) => noteNoun(n, "en"))).toEqual(["note", "notes"]);
    expect([1, 2].map((n) => noteNoun(n, "fr"))).toEqual(["note", "notes"]);
  });
  it("spaces a colon the French way only in French", () => {
    expect(colonFor("en")).toBe(": ");
    expect(colonFor("fr")).toBe(`${NBSP}: `);
  });
  it("counts characters with the singular for one", () => {
    expect(charsPhrase(1, "en")).toBe("1 character");
    expect(charsPhrase(16, "en")).toBe("16 characters");
    expect(charsPhrase(1, "fr")).toBe("1 caractère");
    expect(charsPhrase(2, "fr")).toBe("2 caractères");
  });
});

describe("coverage", () => {
  it("says how many places have a note", () => {
    expect(coverageSentence(3, 10, "en")).toBe("3 of 10 places have a note.");
    expect(coverageSentence(1, 10, "en")).toBe("1 of 10 places has a note.");
    expect(coverageSentence(1, 1, "en")).toBe("1 of 1 place has a note.");
  });
  it("says it in French with the verb agreeing with the number that have a note", () => {
    expect(coverageSentence(3, 10, "fr")).toBe("3 lieux sur 10 ont une note.");
    expect(coverageSentence(1, 10, "fr")).toBe("1 lieu sur 10 a une note.");
    expect(coverageSentence(1, 1, "fr")).toBe("1 lieu sur 1 a une note.");
  });
  it("says a missing note is not a reason to think there is nothing to know", () => {
    expect(withoutSentence(0, "en")).toBe("");
    expect(withoutSentence(1, "en")).toBe("1 place has no note. That does not mean there is nothing to know about it.");
    expect(withoutSentence(2, "en")).toContain("2 places have no note");
    expect(withoutSentence(2, "fr")).toBe("2 lieux n’ont pas de note. Cela ne veut pas dire qu’il n’y a rien à savoir sur ces lieux.");
    expect(withoutSentence(1, "fr")).toContain("1 lieu n’a pas de note");
  });
});

describe("tag counts", () => {
  it("lists only tags that have a place, in the page's order, with UNKNOWN as a token", () => {
    expect(tagCountsLine({ yes: 2, limited: 0, no: 1, designated: 0, unknown: 1 }, "en")).toBe(`2${NBSP}Yes, 1${NBSP}No, 1${NBSP}UNKNOWN`);
    expect(tagCountsLine({ yes: 1, limited: 1, no: 0, designated: 1, unknown: 0 }, "fr")).toBe(`1${NBSP}Oui, 1${NBSP}Limité, 1${NBSP}Réservé`);
    expect(tagCountsLine({ yes: 0, limited: 0, no: 0, designated: 0, unknown: 0 }, "en")).toBe("");
  });
  it("writes the tag line with French spacing", () => {
    expect(tagLine("no", "en")).toBe("Wheelchair tag: No");
    expect(tagLine("unknown", "fr")).toBe(`Indication pour fauteuil roulant${NBSP}: UNKNOWN`);
  });
});

describe("lengths and orders", () => {
  it("names each length with its limits", () => {
    expect(lengthLabel("short", "en")).toBe("Short (up to 60 characters)");
    expect(lengthLabel("medium", "en")).toBe("Medium (61 to 200 characters)");
    expect(lengthLabel("long", "en")).toBe("Long (over 200 characters)");
    expect(lengthLabel("long", "fr")).toBe("Longue (plus de 200 caractères)");
  });
  it("names each length as a word, feminine in French", () => {
    expect((["short", "medium", "long"] as const).map((l) => lengthWord(l, "fr"))).toEqual(["courte", "moyenne", "longue"]);
    expect((["short", "medium", "long"] as const).map((l) => lengthWord(l, "en"))).toEqual(["short", "medium", "long"]);
  });
  it("labels the four orders, and reads any other as the tag order", () => {
    expect(["name", "longest", "shortest", "tag"].map((o) => orderLabelFor(o, "en"))).toEqual(["By place name", "Longest note first", "Shortest note first", "By wheelchair tag"]);
    expect(orderLabelFor("anything", "en")).toBe("By wheelchair tag");
  });
});

describe("summaries", () => {
  it("says how many notes are listed, and how many match once narrowed", () => {
    expect(shownSentence(6, 6, false, "en")).toBe("6 notes listed.");
    expect(shownSentence(1, 1, false, "en")).toBe("1 note listed.");
    expect(shownSentence(2, 6, true, "en")).toBe("2 of 6 notes match your search and filters.");
    expect(shownSentence(6, 6, false, "fr")).toBe("6 notes listées.");
    expect(shownSentence(1, 1, false, "fr")).toBe("1 note listée.");
    expect(shownSentence(1, 6, true, "fr")).toBe("1 note sur 6 correspondent à votre recherche et à vos filtres.");
  });
  it("says when nothing matches, and when there are no notes at all", () => {
    expect(noMatchSentence("en")).toBe("No note matches your search and filters.");
    expect(noNotesAtAll("fr")).toContain("Aucun des lieux affichés");
  });
  it("says a note appears on several places", () => {
    expect(repeatedLabel(3, "en")).toBe("The same note is on 3 places.");
    expect(repeatedLabel(2, "fr")).toBe("La même note figure sur 2 lieux.");
    expect(duplicatesHeading(1, "en")).toBe("1 note appears on more than one place");
    expect(duplicatesHeading(4, "en")).toBe("4 notes appear on more than one place");
    expect(duplicatesHeading(1, "fr")).toBe("1 note figure sur plusieurs lieux");
    expect(duplicatesHeading(4, "fr")).toBe("4 notes figurent sur plusieurs lieux");
  });
  it("shows a missing name as a words-and-token label", () => {
    expect(noteNoName("en")).toBe("Place with no name (UNKNOWN)");
    expect(noteNoName("fr")).toBe("Lieu sans nom (UNKNOWN)");
  });
});

describe("every sentence is clean copy in both languages", () => {
  const strings = (l: Locale): string[] => [
    noteHeading(l), noteIntro(l), noteToggle(true, l), noteToggle(false, l), noNotesAtAll(l), coverageSentence(2, 5, l), withoutSentence(3, l), searchLabel(l), searchHelp(l), noMatchSentence(l),
    shownSentence(2, 6, true, l), shownSentence(6, 6, false, l), repeatedLabel(3, l), repeatedOnlyLabel(l), duplicatesHeading(2, l), showWhole(l), showLess(l), noteNoName(l), noteAsWritten(l),
    tagLine("unknown", l), lengthLabel("short", l), lengthLabel("medium", l), lengthLabel("long", l), charsPhrase(10, l), ...["name", "longest", "shortest", "tag"].map((o) => orderLabelFor(o, l)),
  ];
  for (const l of LOCALES) {
    it(`passes the copy rules in ${l}`, () => {
      for (const s of strings(l)) expect(lintCopy(s, l), s).toEqual([]);
    });
  }
  it("never calls a note right, confirmed, accurate or enough", () => {
    const bad = /\b(correct|accurate|reliable|confirmed|checked|trusted|enough|complete|up to date|best)\b|exact(e)?\b.*vérit|fiable|confirmé|vérifié|exacte?s?\b|à jour|suffisant|complet/i;
    for (const l of LOCALES) for (const s of strings(l)) expect(s, s).not.toMatch(bad);
  });
  it("never writes INCONNU", () => {
    for (const s of strings("fr")) expect(s).not.toMatch(/inconnu/i);
  });
  it("says in both languages that a note is the pack's wording", () => {
    expect(noteIntro("en")).toContain("exactly as written");
    expect(noteIntro("fr")).toContain("telles qu’elles ont été écrites");
    expect(noteIntro("en")).toMatch(/pack's wording/);
    expect(noteIntro("fr")).toContain("les mots du pack");
  });
});

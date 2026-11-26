import { describe, expect, it } from "vitest";
import {
  tagNoteAllLabel, tagNoteCountLine, tagNoteKindChoice, tagNoteKindGroupLabel, tagNoteKindLabel, tagNoteNoneShownLine, tagNoteNoteAsWritten, tagNoteOrderGroupLabel, tagNoteOrderLabel, tagNoteRuleLine,
  tagNoteRulesExtra, tagNoteRulesHeading, tagNoteSaveCsvLabel, tagNoteSaveTextLabel, tagNoteWhyLine, tagNotesHeading, tagNotesIntro, tagNotesToggle,
} from "./tagNoteCopy";
import { TAG_NOTE_KINDS } from "./tagNoteRules";
import type { Locale } from "./stateCopy";

const LOCALES: Locale[] = ["en", "fr"];
function everything(locale: Locale): string[] {
  const out = [tagNotesHeading(locale), tagNotesToggle(true, locale), tagNotesToggle(false, locale), tagNotesIntro(locale), tagNoteRulesHeading(locale), tagNoteRulesExtra(locale), tagNoteKindGroupLabel(locale), tagNoteOrderGroupLabel(locale), tagNoteNoneShownLine(locale), tagNoteNoteAsWritten(locale), tagNoteSaveTextLabel(locale), tagNoteSaveCsvLabel(locale), tagNoteAllLabel(3, locale), tagNoteOrderLabel("name", locale), tagNoteOrderLabel("kind", locale), tagNoteCountLine(0, 0, locale), tagNoteCountLine(0, 4, locale), tagNoteCountLine(2, 4, locale)];
  for (const k of TAG_NOTE_KINDS) out.push(tagNoteKindLabel(k, locale), tagNoteRuleLine(k, locale), tagNoteKindChoice(k, 2, locale));
  out.push(tagNoteWhyLine({ tag: "yes", topics: ["steps"] }, locale), tagNoteWhyLine({ tag: "unknown", topics: ["steps", "ramp", "lift"] }, locale));
  return out;
}

describe("the tags and notes copy", () => {
  it("has English and French for every line, none empty, and none the same in both", () => {
    const en = everything("en");
    const fr = everything("fr");
    expect(en).toHaveLength(fr.length);
    en.forEach((line, i) => {
      expect(line.trim(), line).not.toBe("");
      expect(fr[i]!.trim(), fr[i]).not.toBe("");
      expect(line, line).not.toBe(fr[i]);
    });
  });
  it("follows the French typography", () => {
    for (const line of everything("fr")) {
      expect(line, line).not.toMatch(/\w'\w/);
      expect(line, line).not.toMatch(/\S [:;!?](?!\w)/);
      expect(line, line).not.toMatch(/\S[;!?](?=\s|$)/);
      expect(line, line).not.toMatch(/«(?!\u202f)|(?<!\u202f)»/);
    }
  });
  it("never uses the French word for UNKNOWN, or claims the App does not make", () => {
    const claims = new RegExp(["inconn", "real[- ]time", ["partner", "ship"].join(""), "guarantee", ["veri", "fied"].join(""), ["veri", "fy"].join(""), ["vé", "rifi"].join(""), "correct", "wrong", "inaccurate", "best", "recommend", "suitable", "safe", "eligible"].join("|"), "i");
    for (const l of LOCALES) for (const line of everything(l)) expect(line, line).not.toMatch(claims);
  });
  it("writes each reading in a sentence that names the tags and the words", () => {
    expect(tagNoteRuleLine("yes-steps", "en")).toBe("Tag Yes or Designated, and the note uses: Steps and stairs");
    expect(tagNoteRuleLine("no-ramp-lift", "en")).toBe("Tag No, and the note uses: Ramps and slopes; Lifts and elevators");
    expect(tagNoteRuleLine("unknown-words", "en")).toBe("Tag UNKNOWN, and the note uses: Steps and stairs; Ramps and slopes; Lifts and elevators");
    expect(tagNoteRuleLine("yes-steps", "fr")).toBe("Indication Oui ou Réservé, et la note emploie\u00a0: Marches et escaliers");
    expect(tagNoteRuleLine("unknown-words", "fr")).toContain("Indication UNKNOWN");
  });
  it("says why a place is on the list from the tag and the word groups only", () => {
    expect(tagNoteWhyLine({ tag: "yes", topics: ["steps"] }, "en")).toBe("Tag: Yes; the note uses: Steps and stairs");
    expect(tagNoteWhyLine({ tag: "unknown", topics: ["ramp", "lift"] }, "fr")).toBe("Indication\u00a0: UNKNOWN\u202f; la note emploie\u00a0: Rampes et pentes\u202f; Ascenseurs");
  });
  it("counts notes, and says so when none is on the list or there is no note", () => {
    expect(tagNoteCountLine(2, 4, "en")).toBe("2 of 4 notes are on the list.");
    expect(tagNoteCountLine(0, 4, "en")).toContain("None of the 4 notes");
    expect(tagNoteCountLine(0, 0, "en")).toBe("No place in this list has a note.");
    expect(tagNoteCountLine(1, 1, "en")).toBe("1 of 1 note is on the list.");
    expect(tagNoteCountLine(1, 3, "en")).toBe("1 of 3 notes is on the list.");
    expect(tagNoteCountLine(0, 1, "en")).toBe("The note is not read in a different direction from its tag by these three readings.");
    expect(tagNoteCountLine(1, 1, "fr")).toBe("1 note sur 1 figure dans la liste.");
    expect(tagNoteCountLine(2, 4, "fr")).toBe("2 notes sur 4 figurent dans la liste.");
  });
  it("says the list is places to read, not mistakes", () => {
    expect(tagNotesIntro("en")).toContain("not a list of mistakes");
    expect(tagNotesIntro("fr")).toContain("pas une liste d’erreurs");
import { lintCopy } from "./copyLint";
import { DISAGREEMENT_FILTERS, DISAGREEMENT_KINDS, DISAGREEMENT_ORDERS } from "./tagNoteCheck";
import * as c from "./tagNoteCopy";
import { lintFrench } from "./typography";

function lines(l: Locale): string[] {
  return [
    c.tnHeading(l), c.tnToggle(true, l), c.tnToggle(false, l), c.tnIntro(l), c.tnCoverage(1, l), c.tnCoverage(4, l), c.tnSummary(0, l), c.tnSummary(1, l), c.tnSummary(3, l), c.tnLeftOut(1, 0, l), c.tnLeftOut(2, 3, l), c.tnLeftOut(0, 1, l),
    c.tnNone(l), c.tnNoMatch(l), c.tnFilterGroup(l), c.tnOrderGroup(l), c.tnNoName(l), c.tnTagLine("yes", l), c.tnLegend(l), c.tnCaveat(l), c.tnDirectionLabel("access", l), c.tnDirectionLabel("barrier", l),
    c.tnWeightLine("one-sided", l), c.tnWeightLine("mixed", l), c.tnSaveText(l), c.tnSaveCsv(l), c.tnSavedLine("x.csv", l), c.tnCannotSave(l),
    ...DISAGREEMENT_FILTERS.map((f) => c.tnFilterLabel(f, l)), ...DISAGREEMENT_KINDS.map((k) => c.tnKindLine(k, l)), ...DISAGREEMENT_ORDERS.map((o) => c.tnOrderLabel(o, l)),
  ].filter((x) => x !== "");
}

describe("tag and note copy", () => {
  for (const l of ["en", "fr"] as const) {
    it(`passes the copy lint in ${l}`, () => {
      for (const line of lines(l)) expect(lintCopy(line, l), line).toEqual([]);
    });
  }
  it("has French typography in French", () => {
    for (const line of lines("fr")) expect(lintFrench(line), line).toEqual([]);
  });
  it("labels every filter and order differently", () => {
    for (const l of ["en", "fr"] as const) {
      expect(new Set(DISAGREEMENT_FILTERS.map((f) => c.tnFilterLabel(f, l))).size).toBe(DISAGREEMENT_FILTERS.length);
      expect(new Set(DISAGREEMENT_ORDERS.map((o) => c.tnOrderLabel(o, l))).size).toBe(DISAGREEMENT_ORDERS.length);
    }
  });
  it("never says which of the tag and the note is right, and says it cannot", () => {
    for (const l of ["en", "fr"] as const) expect(c.tnIntro(l)).not.toMatch(/verif|vérif|confirmed|confirmé|incorrect|wrong\b|erreur/i);
    expect(c.tnIntro("en")).toContain("does not say which one is right");
    expect(c.tnCaveat("fr")).toContain("ne dit pas laquelle");
  });
  it("agrees in number", () => {
    expect(c.tnCoverage(1, "en")).toBe("1 place has a yes or no tag and a note to compare.");
    expect(c.tnCoverage(2, "en")).toContain("2 places have");
    expect(c.tnSummary(1, "en")).toBe("1 place points different ways.");
    expect(c.tnSummary(2, "en")).toBe("2 places point different ways.");
    expect(c.tnSummary(0, "en")).toBe("None of them point different ways.");
    expect(c.tnLeftOut(1, 0, "en")).toBe("1 place has no note.");
    expect(c.tnLeftOut(0, 0, "en")).toBe("");
  });
  it("writes UNKNOWN, not the French word, for an unknown tag", () => {
    expect(c.tnLeftOut(0, 2, "fr")).toContain("UNKNOWN");
    expect(c.tnLeftOut(0, 2, "fr")).not.toMatch(/inconnu/i);
  });
  it("has a CSV header of fixed English names", () => {
    expect(c.TN_CSV_HEADER).toEqual(["place_id", "place_name", "wheelchair_tag", "kind", "weight", "words_against_tag", "words_with_tag", "note"]);
  });
});

import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { differencesNote } from "./spotReport";
import type { ResultRow } from "./spotResults";
import { summariseResults } from "./spotSummary";
import type { Locale } from "./stateCopy";
import { lintFrench } from "./typography";

const mk = (id: string, tag: string, answers: ResultRow["answers"], extra: Partial<ResultRow> = {}): ResultRow => ({
  n: id, id, name: `Café ${id}`, tag, source: "OpenStreetMap", retrievedOn: "2026-11-10", answers, dateLooked: "2026-11-22", notes: "", problems: [], ...extra,
});
const rows = [
  mk("1", "yes", { step: "no", door: "yes", match: "same" }),
  mk("2", "limited", { step: "yes", ramp: "no", match: "different" }, { notes: "Two steps, no ramp" }),
  mk("3", "UNKNOWN", { match: "different" }, { source: "UNKNOWN", retrievedOn: "UNKNOWN", dateLooked: null }),
];
const note = (l: Locale = "en", r = rows) => differencesNote(summariseResults(r), l, "2026-11-23");

describe("differencesNote", () => {
  it("has a title, the date and the summary", () => {
    const text = note();
    expect(text).toContain("Spot-check differences");
    expect(text).toContain("Made on 2026-11-23");
    expect(text).toContain("Of 3 places on the sheet: 1 matched the tag, 2 differed from the tag.");
  });
  it("lists only the places where a difference was seen, with the pack's tag and source", () => {
    const text = note();
    expect(text).toContain("Differences you saw (2)");
    expect(text).toContain("2. Café 2 (Place id: 2)");
    expect(text).toContain("The pack reports: Limited (OpenStreetMap, retrieved 10 November 2026)");
    expect(text).toContain("3. Café 3 (Place id: 3)");
    expect(text).not.toContain("Café 1");
  });
  it("gives the answers the person typed, the date and the notes", () => {
    const text = note();
    expect(text).toContain("Is there a step at the main entrance? Yes");
    expect(text).toContain("Is there a ramp or a lift where there is a step? No");
    expect(text).toContain("Date you looked: 2026-11-22");
    expect(text).toContain("Your notes: Two steps, no ramp");
  });
  it("writes UNKNOWN where the sheet had no source or tag", () => {
    const text = note();
    expect(text).toContain("The pack reports: UNKNOWN (UNKNOWN)");
  });
  it("leaves out questions that were not answered and notes that are blank", () => {
    const text = note();
    expect(text).not.toContain("Is the way from the door to the main area level?");
    expect(text.split("Your notes:").length - 1).toBe(1);
  });
  it("says there were no differences when there were none", () => {
    const text = note("en", [rows[0]!]);
    expect(text).toContain("Differences you saw (0)");
    expect(text).toContain("You did not record any difference.");
  });
  it("says it is one person's view and not a correction, and that the numbers are not a rate", () => {
    const text = note();
    expect(text).toContain("one person’s view on the day they looked. It is not a correction to the pack.");
    expect(text).toContain("They are not a rate");
  });
  it("uses Windows line ends and ends with one", () => {
    const text = note();
    expect(text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    expect(text.endsWith("\r\n")).toBe(true);
  });
  it("is in French when asked, with French punctuation in the words it wrote", () => {
    const text = note("fr");
    expect(text).toContain("Différences relevées sur place");
    expect(text).toContain("Produite le 2026-11-23");
    expect(text).toContain("consulté le 10 novembre 2026");
    for (const l of text.split("\r\n")) if (/^(Spot|Diff|Sur |C’est|Ce sont)/.test(l)) expect(lintFrench(l), l).toEqual([]);
  });
  it("passes the copy rules on the sentences it wrote, in both languages", () => {
    for (const l of ["en", "fr"] as const) {
      for (const line of note(l).split("\r\n")) if (/^(Spot|Diff|Of |Sur |C’est|Ce sont|This |These |You |Vous)/.test(line)) expect(lintCopy(line, l), line).toEqual([]);
    }
  });
  it("never calls the pack wrong or the place accessible", () => {
    for (const l of ["en", "fr"] as const) expect(note(l)).not.toMatch(/\b(wrong|incorrect|error|accessible|verified)\b|erroné|vérifi/i);
  });
  it("does not carry the sheet's own tag word when the tag is a token it does not know", () => {
    const odd = note("en", [mk("9", "weird", { match: "different" })]);
    expect(odd).toContain("The pack reports: UNKNOWN");
  });
});

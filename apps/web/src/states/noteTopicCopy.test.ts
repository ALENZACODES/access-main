import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import * as copy from "./noteTopicCopy";
import { TOPIC_MODES, TOPIC_ORDERS } from "./noteTopicFilter";
import { TOPIC_IDS, TOPICS } from "./noteTopicLexicon";
import type { Locale } from "./stateCopy";
import { lintFrench } from "./typography";

const NBSP = "\u00a0";
const plain = (s: string) => s.split(NBSP).join(" ");
const LOCALES: readonly Locale[] = ["en", "fr"];

/** Every sentence the copy can give, in both languages, for the checks that apply to all of them. */
function everything(locale: Locale): string[] {
  const out: string[] = [
    copy.topicsHeading(locale), copy.topicsToggle(true, locale), copy.topicsToggle(false, locale), copy.topicsIntro(locale), copy.topicSkipNegatedLabel(locale), copy.topicModeGroupLabel(locale),
    copy.topicNoMatchLine(locale), copy.topicNoWordsLine(locale), copy.topicNoteAsWritten(locale), copy.topicNoName(locale), copy.topicTableCaption(locale), copy.topicTableWordHeader(locale),
    copy.topicTableTotalHeader(locale), copy.topicPairsHeading(locale), copy.topicWordsListHeading(locale), copy.topicCoverageLine(0, 0, locale), copy.topicCoverageLine(1, 1, locale),
    copy.topicCoverageLine(3, 5, locale), copy.topicWithoutTopicLine(1, locale), copy.topicWithoutTopicLine(2, locale), copy.topicShownLine(2, 5, true, locale), copy.topicShownLine(5, 5, false, locale),
    copy.topicShownLine(1, 1, false, locale), copy.topicMentionsLine(1, 1, locale), copy.topicMentionsLine(3, 7, locale), copy.topicPairsLine("steps", "ramp", 1, locale), copy.topicPairsLine("steps", "ramp", 2, locale),
    copy.topicWordsUsedLine(["steps", "ramp"], locale), copy.topicNegatedLine(["lift"], locale),
  ];
  for (const m of TOPIC_MODES) out.push(copy.topicModeLabel(m, locale));
  for (const o of TOPIC_ORDERS) out.push(copy.topicOrderLabel(o, locale));
  for (const id of TOPIC_IDS) out.push(copy.topicCheckLabel(id, 1, locale), copy.topicCheckLabel(id, 4, locale));
  for (const tag of ["yes", "limited", "no", "designated", "unknown"] as const) out.push(copy.topicTagFilterLabel(tag, locale), copy.topicTagLine(tag, locale), copy.topicTableTagHeader(tag, locale));
  return out;
}

describe("the words reader copy", () => {
  it("never writes the French word for UNKNOWN, in either language", () => {
    for (const l of LOCALES) for (const s of everything(l)) expect(s, s).not.toMatch(/inconnu/i);
  });
  it("passes the App's copy rules in both languages", () => {
    for (const l of LOCALES) for (const s of everything(l)) expect(lintCopy(s, l), s).toEqual([]);
  });
  it("has French with the right spacing and apostrophes", () => {
    for (const s of everything("fr")) expect(lintFrench(s), s).toEqual([]);
  });
  it("never says a note, a word or a feature is checked, correct, complete or enough", () => {
    const claims = /\b(correct|accurate|confirmed|checked|up to date|complete|reliable|trusted|best|recommend\w*|suitable|near enough|enough|safe|usable)\b/i;
    for (const s of everything("en")) expect(s, s).not.toMatch(claims);
    const frClaims = /\b(exact\w*|fiable|confirm\w*|à jour|complet\w*|suffisant\w*|sûr|recommand\w*)\b/i;
    for (const s of everything("fr")) expect(s, s).not.toMatch(frClaims);
  });
  it("says in the introduction that a note only uses a word, and that the note is what to read", () => {
    expect(copy.topicsIntro("en")).toMatch(/only shows that a note uses a word/);
    expect(copy.topicsIntro("en")).toMatch(/does not say whether the feature is there/);
    expect(plain(copy.topicsIntro("fr"))).toMatch(/emploie un mot/);
    expect(plain(copy.topicsIntro("fr"))).toMatch(/ne dit pas si/);
  });
  it("says in the introduction that a note that says no steps still counts under steps", () => {
    expect(copy.topicsIntro("en")).toContain("“no steps”");
    expect(copy.topicsIntro("fr")).toContain("pas de marches");
  });
  it("counts with the right singular and plural, in both languages", () => {
    expect(copy.topicCoverageLine(1, 1, "en")).toBe("At least one of these words appears in 1 of 1 note.");
    expect(copy.topicCoverageLine(3, 5, "en")).toBe("At least one of these words appears in 3 of 5 notes.");
    expect(plain(copy.topicCoverageLine(1, 1, "fr"))).toBe("1 note sur 1 emploie au moins un de ces mots.");
    expect(plain(copy.topicCoverageLine(3, 5, "fr"))).toBe("3 notes sur 5 emploient au moins un de ces mots.");
    expect(copy.topicCoverageLine(0, 0, "en")).toBe("No place in the pack has a note.");
  });
  it("says nothing for no note without a word, and counts the rest", () => {
    expect(copy.topicWithoutTopicLine(0, "en")).toBe("");
    expect(copy.topicWithoutTopicLine(1, "en")).toBe("None of them appears in 1 note.");
    expect(plain(copy.topicWithoutTopicLine(2, "fr"))).toBe("2 notes n’emploient aucun de ces mots.");
  });
  it("says how many are shown, with and without a filter", () => {
    expect(copy.topicShownLine(5, 5, false, "en")).toBe("Showing all 5 notes.");
    expect(copy.topicShownLine(2, 5, true, "en")).toBe("Showing 2 of 5 notes.");
    expect(plain(copy.topicShownLine(2, 5, true, "fr"))).toBe("2 notes affichées sur 5.");
    expect(plain(copy.topicShownLine(1, 1, false, "fr"))).toBe("1 note affichée.");
  });
  it("labels each topic with its count of places", () => {
    expect(copy.topicCheckLabel("steps", 1, "en")).toBe("Steps and stairs (1 place)");
    expect(copy.topicCheckLabel("steps", 4, "en")).toBe("Steps and stairs (4 places)");
    expect(plain(copy.topicCheckLabel("lift", 2, "fr"))).toBe("Ascenseurs (2 lieux)");
  });
  it("joins a list with a thin space before the French semicolon", () => {
    expect(copy.topicWordsUsedLine(["steps", "ramp"], "en")).toBe("Words used: Steps and stairs; Ramps and slopes");
    expect(copy.topicWordsUsedLine(["steps", "ramp"], "fr")).toBe("Mots employés\u00a0: Marches et escaliers\u202f; Rampes et pentes");
    expect(copy.topicColon("fr")).toBe("\u00a0: ");
    expect(copy.topicSemicolon("fr")).toBe("\u202f; ");
    expect(copy.topicColon("en")).toBe(": ");
  });
  it("writes a missing tag as UNKNOWN in both languages and a nameless place as UNKNOWN too", () => {
    for (const l of LOCALES) {
      expect(copy.topicTagLine("unknown", l)).toContain("UNKNOWN");
      expect(copy.topicNoName(l)).toContain("UNKNOWN");
      expect(copy.topicTableTagHeader("unknown", l)).toBe("UNKNOWN");
    }
  });
  it("lists the words looked for in each topic", () => {
    for (const d of TOPICS) expect(copy.topicCuesOf(d.id)).toBe(d.cues.join(", "));
  });
  it("gives a different label to every mode and order", () => {
    for (const l of LOCALES) {
      expect(new Set(TOPIC_MODES.map((m) => copy.topicModeLabel(m, l))).size).toBe(TOPIC_MODES.length);
      expect(new Set(TOPIC_ORDERS.map((o) => copy.topicOrderLabel(o, l))).size).toBe(TOPIC_ORDERS.length);
    }
  });
});

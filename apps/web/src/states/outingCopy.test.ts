import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import { onLine, START_WEST } from "./outingFixtures";
import { UNKNOWN, cannotMoveLine, legText, legTimeText, modeHint, modeLabel, movedLine, paceNote, planTitle, startLine, straightLineNote, summaryLine, tagText } from "./outingCopy";
import { OUTING_MODES, buildOuting } from "./outingPlan";
import { lintFrench } from "./typography";

const BANNED = [["real", "time"].join("[- ]"), ["partner", "ship"].join(""), "guarantee", ["veri", "fied"].join(""), ["veri", "fy"].join(""), ["vé", "rifi"].join(""), "official", "safe route", "accessible route", "best route", "recommended"];
const bannedRe = new RegExp(`\\b(${BANNED.join("|")})`, "i");

const whole = buildOuting([onLine("a", 1), onLine("b", 3), onLine("c", 4)], ["a", "b", "c"], START_WEST);
const partial = buildOuting([onLine("a", 1), onLine("x", null), onLine("b", 3)], ["a", "x", "b"], START_WEST);
const single = buildOuting([onLine("a", 1)], ["a"], null);

const everyLine = (locale: "en" | "fr"): string[] => [
  planTitle(locale),
  straightLineNote(locale),
  paceNote(locale),
  startLine(true, locale),
  startLine(false, locale),
  ...OUTING_MODES.flatMap((m) => [modeLabel(m, locale), modeHint(m, locale)]),
  summaryLine(whole, locale, null),
  summaryLine(whole, locale, 3.5),
  summaryLine(partial, locale, null),
  summaryLine(partial, locale, 3),
  summaryLine(single, locale, null),
  movedLine("Café Un", 2, 5, locale),
  cannotMoveLine("Café Un", 1, -1, locale),
  cannotMoveLine("Café Un", 5, 1, locale),
  ...(["yes", "limited", "no", "designated", "unknown"] as const).map((t) => tagText(t, locale)),
];

describe("tagText", () => {
  it("uses the pack's words for the four reported tags", () => {
    expect((["yes", "limited", "no", "designated"] as const).map((t) => tagText(t, "en"))).toEqual(["Yes", "Limited", "No", "Designated"]);
    expect((["yes", "limited", "no", "designated"] as const).map((t) => tagText(t, "fr"))).toEqual(["Oui", "Limité", "Non", "Réservé"]);
  });
  it("keeps the token UNKNOWN in both languages", () => {
    expect(UNKNOWN).toBe("UNKNOWN");
    expect(tagText("unknown", "en")).toBe("UNKNOWN");
    expect(tagText("unknown", "fr")).toBe("UNKNOWN");
  });
});

describe("the modes", () => {
  it("have a different label and hint each, in both languages", () => {
    for (const locale of ["en", "fr"] as const) {
      expect(new Set(OUTING_MODES.map((m) => modeLabel(m, locale))).size).toBe(3);
      expect(new Set(OUTING_MODES.map((m) => modeHint(m, locale))).size).toBe(3);
    }
  });
  it("say the nearest rule is simple and not the shortest tour", () => {
    expect(modeHint("nearest", "en")).toMatch(/not the shortest possible tour/);
    expect(modeHint("nearest", "fr")).toMatch(/pas le trajet le plus court possible/);
  });
});

describe("straightLineNote and paceNote", () => {
  it("say a distance is a straight line and a real route is longer", () => {
    expect(straightLineNote("en")).toMatch(/straight lines between map points/);
    expect(straightLineNote("en")).toMatch(/a real route is longer/);
    expect(straightLineNote("fr")).toMatch(/lignes droites entre des points de carte/);
    expect(straightLineNote("fr")).toMatch(/un vrai itinéraire est plus long/);
  });
  it("say the time is a minimum and the pace is not saved", () => {
    expect(paceNote("en")).toMatch(/minimum/);
    expect(paceNote("en")).toMatch(/not saved/);
    expect(paceNote("fr")).toMatch(/minimum/);
    expect(paceNote("fr")).toMatch(/pas enregistré/);
  });
});

describe("summaryLine", () => {
  it("gives the stop count and the whole straight-line distance when every leg is known", () => {
    expect(summaryLine(whole, "en", null)).toMatch(/^3 stops, about [\d.,]+\u00a0(m|km) in straight lines in all\.$/);
  });
  it("adds a minimum time only when a pace was typed", () => {
    expect(summaryLine(whole, "en", null)).not.toMatch(/at your pace/);
    expect(summaryLine(whole, "en", 6)).toMatch(/At least \d+\u00a0min at your pace\.$/);
    expect(summaryLine(whole, "fr", 6)).toMatch(/Au moins \d+\u00a0min à votre rythme\.$/);
  });
  it("says what is missing when some distances are UNKNOWN, and keeps the token UNKNOWN in French", () => {
    expect(summaryLine(partial, "en", null)).toMatch(/The 1 known distance adds up to about .* and 2 distances are UNKNOWN because a place has no map point\.$/);
    expect(summaryLine(partial, "fr", null)).toMatch(/La distance connue fait environ .* et 2 distances sont UNKNOWN faute de point de carte pour un lieu\.$/);
  });
  it("says there is nothing to add up for one stop and no start", () => {
    expect(summaryLine(single, "en", null)).toBe("1 stop. There is no distance to add up.");
    expect(summaryLine(single, "fr", null)).toBe("1 arrêt. Il n’y a aucune distance à additionner.");
  });
  it("is singular and plural in both languages", () => {
    const two = buildOuting([onLine("a", 1), onLine("b", 2)], ["a", "b"], null);
    expect(summaryLine(two, "en", null).startsWith("2 stops,")).toBe(true);
    expect(summaryLine(two, "fr", null).startsWith("2 arrêts,")).toBe(true);
  });
});

describe("legText and legTimeText", () => {
  it("write a distance, or UNKNOWN", () => {
    expect(legText(350, "en")).toBe("350\u00a0m");
    expect(legText(1250, "fr")).toBe("1,3\u00a0km");
    expect(legText(null, "fr")).toBe("UNKNOWN");
  });
  it("write nothing without a pace, UNKNOWN without a distance, and a minimum with both", () => {
    expect(legTimeText(500, null)).toBe("");
    expect(legTimeText(null, null)).toBe("");
    expect(legTimeText(null, 3)).toBe("UNKNOWN");
    expect(legTimeText(500, 3)).toBe("10\u00a0min");
  });
});

describe("movedLine and cannotMoveLine", () => {
  it("say where the stop went, in both languages", () => {
    expect(movedLine("Café Un", 2, 5, "en")).toBe("Café Un moved to position 2 of 5.");
    expect(movedLine("Café Un", 2, 5, "fr")).toBe("Café Un déplacé à la position 2 sur 5.");
  });
  it("say a stop is already first or last", () => {
    expect(cannotMoveLine("A", 1, -1, "en")).toBe("A is already first (position 1).");
    expect(cannotMoveLine("A", 4, 1, "en")).toBe("A is already last (position 4).");
    expect(cannotMoveLine("A", 1, -1, "fr")).toBe("A est déjà premier (position 1).");
    expect(cannotMoveLine("A", 4, 1, "fr")).toBe("A est déjà dernier (position 4).");
  });
});

describe("all the copy", () => {
  for (const locale of ["en", "fr"] as const) {
    it(`passes the copy check and has none of the words the App does not use (${locale})`, () => {
      for (const line of everyLine(locale)) {
        expect(lintCopy(line, locale), line).toEqual([]);
        expect(line, line).not.toMatch(bannedRe);
      }
    });
    it(`makes no claim that an order, place or trip is better, easier, safer or possible (${locale})`, () => {
      for (const line of everyLine(locale)) expect(line, line).not.toMatch(/\b(better|easier|safer|safest|best|worst|possible to|you can reach|accessible to you)\b|meilleur|plus facile|plus sûr|plus sécuritaire/i);
    });
  }
  it("passes the French typography check line by line", () => {
    for (const line of everyLine("fr")) expect(lintFrench(line), line).toEqual([]);
  });
  it("uses the typographic apostrophe and never the token INCONNU in French", () => {
    for (const line of everyLine("fr")) {
      expect(line, line).not.toContain("'");
      expect(line, line).not.toMatch(/INCONN/i);
    }
  });
  it("has no double spaces, no leading or trailing space, and a full stop on each sentence note", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const line of everyLine(locale)) {
        expect(line, line).toBe(line.trim());
        expect(line, line).not.toMatch(/ {2}/);
      }
      for (const note of [straightLineNote(locale), paceNote(locale), summaryLine(whole, locale, null)]) expect(note.endsWith(".")).toBe(true);
    }
  });
});

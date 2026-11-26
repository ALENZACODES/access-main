import { describe, expect, it } from "vitest";
import {
  aroundCaveat, aroundHeading, aroundIntro, aroundSummary, aroundToggle, beyondLine, centreName, centreNotFound, centreOptionLabel, chooseFirst, distanceAndDirection,
  memberLine, memberName, noMatchesLine, noName, noPointCentre, placeNoun, radiusLabel, radiusOptionLabel, ringLabel, sectorLabel, tagCountsSentence, tagWord, aroundUnmeasuredLine, nearestInSector,
} from "./aroundCopy";
import { crossroads, at } from "./aroundFixtures";
import { lintCopy } from "./copyLint";
import { buildAroundList, type AroundMember } from "./aroundSearch";
import { sectorRows } from "./aroundRings";
import type { Locale } from "./stateCopy";

const LOCALES: Locale[] = ["en", "fr"];
const NBSP = "\u00a0";

function okResult(radius = 250, list = crossroads(), id = "centre") {
  const r = buildAroundList(list, id, radius);
  if (r.status !== "ok") throw new Error("expected ok");
  return r;
}
const member = (over: Partial<AroundMember> = {}): AroundMember => ({ id: "m", name: "Corner Cafe", tag: "yes", category: "cafe", address: null, metres: 120, direction: "NE", ...over });

describe("nouns and names", () => {
  it("agrees place and lieu with the number", () => {
    expect([1, 2, 0].map((n) => placeNoun(n, "en"))).toEqual(["place", "places", "places"]);
    expect([1, 2, 0].map((n) => placeNoun(n, "fr"))).toEqual(["lieu", "lieux", "lieux"]);
  });
  it("shows a missing name as a words-and-token label, never an empty string", () => {
    expect(noName("en")).toBe("Place with no name (UNKNOWN)");
    expect(noName("fr")).toBe("Lieu sans nom (UNKNOWN)");
    expect(centreName({ name: null }, "en")).toBe(noName("en"));
    expect(memberName({ name: null }, "fr")).toBe(noName("fr"));
    expect(memberName({ name: "Alpha" }, "fr")).toBe("Alpha");
  });
  it("adds the address to a choice so two places with one name differ", () => {
    expect(centreOptionLabel({ id: "a", name: "Tim Hortons", address: "1 King St" }, "en")).toBe("Tim Hortons, 1 King St");
    expect(centreOptionLabel({ id: "a", name: "Tim Hortons", address: null }, "en")).toBe("Tim Hortons");
    expect(centreOptionLabel({ id: "a", name: null, address: null }, "fr")).toBe(noName("fr"));
  });
});

describe("distances", () => {
  it("writes the choices the way the rest of the page writes distances", () => {
    expect([100, 250, 500, 1000].map((r) => radiusLabel(r, "en"))).toEqual([`100${NBSP}m`, `250${NBSP}m`, `500${NBSP}m`, `1${NBSP}km`]);
    expect(radiusLabel(1000, "fr")).toBe(`1${NBSP}km`);
  });
  it("words each choice in both languages", () => {
    expect(radiusOptionLabel(250, "en")).toBe(`Within 250${NBSP}m`);
    expect(radiusOptionLabel(1000, "fr")).toContain("À moins de");
  });
  it("says distance and direction together", () => {
    expect(distanceAndDirection(120, "NE", "en")).toBe(`120${NBSP}m to the north-east`);
    expect(distanceAndDirection(120, "W", "fr")).toBe(`120${NBSP}m à l’ouest`);
    expect(distanceAndDirection(0, null, "en")).toBe(`0${NBSP}m, at the same spot`);
    expect(distanceAndDirection(0, null, "fr")).toBe(`0${NBSP}m, au même point`);
  });
  it("puts a line together for one place", () => {
    expect(memberLine(member(), "en")).toBe(`Corner Cafe, 120${NBSP}m to the north-east, wheelchair tag: Yes`);
    expect(memberLine(member({ tag: "unknown", name: null }), "fr")).toBe(`Lieu sans nom (UNKNOWN), 120${NBSP}m au nord-est, indication pour fauteuil roulant${NBSP}: UNKNOWN`);
  });
});

describe("tags", () => {
  it("uses the words the page already uses, and the token UNKNOWN in both languages", () => {
    expect((["yes", "limited", "no", "designated", "unknown"] as const).map((x) => tagWord(x, "en"))).toEqual(["Yes", "Limited", "No", "Designated", "UNKNOWN"]);
    expect((["yes", "limited", "no", "designated", "unknown"] as const).map((x) => tagWord(x, "fr"))).toEqual(["Oui", "Limité", "Non", "Réservé", "UNKNOWN"]);
  });
  it("counts only the tags that have a place", () => {
    expect(tagCountsSentence({ yes: 2, limited: 0, no: 1, designated: 0, unknown: 1 }, "en")).toBe(`2${NBSP}Yes, 1${NBSP}No, 1${NBSP}UNKNOWN`);
    expect(tagCountsSentence({ yes: 0, limited: 0, no: 0, designated: 0, unknown: 0 }, "en")).toBe("");
    expect(tagCountsSentence({ yes: 1, limited: 0, no: 0, designated: 0, unknown: 0 }, "fr")).toBe(`1${NBSP}Oui`);
  });
});

describe("summary", () => {
  it("says how many places are listed within the distance of the centre", () => {
    const r = okResult(250);
    expect(aroundSummary(r, 4, false, "en")).toBe(`4 places listed within 250${NBSP}m of Centre Hall.`);
    expect(aroundSummary(r, 4, false, "fr")).toBe(`4 lieux répertoriés à moins de 250${NBSP}m de Centre Hall.`);
  });
  it("uses the singular for one place", () => {
    const r = okResult(100);
    expect(aroundSummary(r, 1, false, "en")).toBe(`1 place listed within 100${NBSP}m of Centre Hall.`);
    expect(aroundSummary(r, 1, false, "fr")).toBe(`1 lieu répertorié à moins de 100${NBSP}m de Centre Hall.`);
  });
  it("adds how many are shown once a filter is on", () => {
    const r = okResult(250);
    expect(aroundSummary(r, 2, true, "en")).toContain("2 shown after your filters.");
    expect(aroundSummary(r, 1, true, "fr")).toContain("1 affiché après vos filtres.");
    expect(aroundSummary(r, 3, true, "fr")).toContain("3 affichés après vos filtres.");
  });
  it("says plainly when nothing is listed", () => {
    const r = okResult(100, [at("c", 0, 0, { name: "Lonely" }), at("far", 900, 0)], "c");
    expect(aroundSummary(r, 0, false, "en")).toBe(`No other place with a map point is listed within 100${NBSP}m of Lonely.`);
    expect(aroundSummary(r, 0, false, "fr")).toContain("Aucun autre lieu avec un point sur la carte");
  });
  it("names an unnamed centre as UNKNOWN", () => {
    const r = okResult(250, [at("c", 0, 0, { name: null }), at("n", 10, 0)], "c");
    expect(aroundSummary(r, 1, false, "en")).toContain("Place with no name (UNKNOWN)");
  });
});

describe("other lines", () => {
  it("counts places beyond the distance, with the right verb", () => {
    expect(beyondLine(0, 250, "en")).toBe("");
    expect(beyondLine(1, 250, "en")).toBe(`1 more place with a map point lies farther than 250${NBSP}m.`);
    expect(beyondLine(3, 250, "en")).toBe(`3 more places with a map point lie farther than 250${NBSP}m.`);
    expect(beyondLine(1, 500, "fr")).toBe(`1 autre lieu avec un point sur la carte se trouve à plus de 500${NBSP}m.`);
    expect(beyondLine(2, 500, "fr")).toBe(`2 autres lieux avec un point sur la carte se trouvent à plus de 500${NBSP}m.`);
  });
  it("counts places with no map point", () => {
    expect(aroundUnmeasuredLine(0, "en")).toBe("");
    expect(aroundUnmeasuredLine(1, "en")).toBe("1 place has no map point, so it is left out.");
    expect(aroundUnmeasuredLine(2, "en")).toBe("2 places have no map point, so they are left out.");
    expect(aroundUnmeasuredLine(1, "fr")).toBe(`1 lieu n’a pas de point sur la carte${NBSP}: il est donc absent.`);
    expect(aroundUnmeasuredLine(2, "fr")).toBe(`2 lieux n’ont pas de point sur la carte${NBSP}: ils sont donc absents.`);
  });
  it("names the centre that has no point", () => {
    expect(noPointCentre({ id: "x", name: "Mapless", tag: "yes", address: null }, "en")).toContain("Mapless has no map point in the pack");
    expect(noPointCentre({ id: "x", name: null, tag: "yes", address: null }, "fr")).toContain("Lieu sans nom (UNKNOWN) n’a pas de point");
  });
  it("labels the bands and directions", () => {
    expect(ringLabel({ from: 0, upTo: 50 }, "en")).toBe(`Up to 50${NBSP}m`);
    expect(ringLabel({ from: 50, upTo: 100 }, "en")).toBe(`50${NBSP}m to 100${NBSP}m`);
    expect(ringLabel({ from: 250, upTo: 500 }, "fr")).toBe(`De 250${NBSP}m à 500${NBSP}m`);
    expect(ringLabel({ from: 500, upTo: 1000 }, "fr")).toBe(`De 500${NBSP}m à 1${NBSP}km`);
    expect(sectorLabel({ point: "SW" }, "en")).toBe("south-west (SW)");
    expect(sectorLabel({ point: "SW" }, "fr")).toBe("sud-ouest (SO)");
    expect(sectorLabel({ point: null }, "fr")).toBe("Au même point");
  });
  it("names the closest place in a direction, or nothing", () => {
    const r = okResult(250);
    const rows = sectorRows(r.members);
    expect(nearestInSector(rows[0]!, "en")).toBe(`North Cafe, 80${NBSP}m`);
    expect(nearestInSector(rows[1]!, "en")).toBe("");
  });
});

describe("every sentence is clean copy in both languages", () => {
  const r = okResult(250);
  const strings = (locale: Locale): string[] => [
    aroundHeading(locale), aroundIntro(locale), aroundToggle(true, locale), aroundToggle(false, locale), aroundCaveat(locale), chooseFirst(locale), centreNotFound(locale), noMatchesLine(locale),
    noPointCentre({ id: "x", name: "N", tag: "yes", address: null }, locale), aroundSummary(r, 4, false, locale), aroundSummary(r, 1, true, locale), beyondLine(2, 250, locale),
    aroundUnmeasuredLine(2, locale), memberLine(member(), locale), memberLine(member({ direction: null, tag: "unknown", name: null }), locale),
    ...[100, 250, 500, 1000].map((x) => radiusOptionLabel(x, locale)), ringLabel({ from: 0, upTo: 50 }, locale), ringLabel({ from: 100, upTo: 250 }, locale),
    sectorLabel({ point: "W" }, locale), sectorLabel({ point: null }, locale),
  ];
  for (const locale of LOCALES) {
    it(`has no overclaim, banned wording or typography issue in ${locale}`, () => {
      for (const s of strings(locale)) expect(lintCopy(s, locale), s).toEqual([]);
    });
  }
  it("never calls a place near enough, convenient, suitable or reachable", () => {
    const bad = /\b(nearby|near enough|convenient|suitable|reachable|accessible|recommend|best|safe|safer|easy|walkable|short walk)\b|pratique|recommand|adapté|accessible|sûr|facile/i;
    for (const locale of LOCALES) for (const s of strings(locale)) expect(s, s).not.toMatch(bad);
  });
  it("never writes INCONNU for an unknown tag or name", () => {
    for (const s of strings("fr")) expect(s).not.toMatch(/inconnu/i);
  });
  it("says in both languages that the lines are straight and not a way", () => {
    expect(aroundIntro("en")).toMatch(/straight line/);
    expect(aroundIntro("fr")).toMatch(/ligne droite/);
    expect(aroundCaveat("en")).toMatch(/does not say the way/);
    expect(aroundCaveat("fr")).toMatch(/ne dit pas que le chemin/);
  });
});

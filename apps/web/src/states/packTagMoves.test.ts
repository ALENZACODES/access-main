import { describe, expect, it } from "vitest";
import { lintCopy } from "./copyLint";
import type { EarlierPlace } from "./packEarlier";
import { diffPacks, type PackDiff } from "./packDiff";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";
import {
  ABSENT,
  MOVE_KEYS,
  MOVE_TAGS,
  addedRemovedLine,
  buildTagMoves,
  cellKey,
  moveKeyLabel,
  moveLabel,
  noTagMoves,
  placesIn,
  rankedMoves,
  tagFromToken,
  tagMovesLine,
  tagMovesNote,
} from "./packTagMoves";

const OSM = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 };
const now = (id: string, wheelchair: string | undefined, over: Record<string, unknown> = {}): PackPlaceRecord =>
  parsePackPlaces([{ id, name: `Place ${id}`, wheelchair, category: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: OSM, ...over }]).places[0]!;
const before = (id: string, tag: EarlierPlace["tag"], over: Partial<EarlierPlace> = {}): EarlierPlace => ({
  id,
  name: `Place ${id}`,
  kind: "cafe",
  address: "1 Main Street",
  lat: 43.65,
  lon: -79.38,
  tag,
  source: "OpenStreetMap, Geofabrik Ontario extract",
  retrievedOn: "2026-11-10",
  tier: null,
  ...over,
});
const diff = (earlier: EarlierPlace[], current: PackPlaceRecord[]): PackDiff => diffPacks(earlier, current);

describe("the keys", () => {
  it("has the five tags and then the absent side", () => {
    expect(MOVE_TAGS).toEqual(["yes", "limited", "no", "designated", "unknown"]);
    expect(MOVE_KEYS).toEqual([...MOVE_TAGS, ABSENT]);
  });
  it("names a cell by its two sides", () => {
    expect(cellKey("yes", "unknown")).toBe("yes>unknown");
    expect(cellKey(ABSENT, "no")).toBe("absent>no");
  });
});

describe("tagFromToken", () => {
  it("reads the tag names and the token UNKNOWN", () => {
    expect(["yes", "limited", "no", "designated", "UNKNOWN"].map(tagFromToken)).toEqual(["yes", "limited", "no", "designated", "unknown"]);
  });
  it("does not read anything else, including the lower-case word unknown", () => {
    for (const token of ["", "Yes", "YES", "unknown", "partial", " yes", "absent", "INCONNU"]) expect(tagFromToken(token), token).toBeNull();
  });
});

describe("buildTagMoves", () => {
  it("has an empty table when nothing moved", () => {
    const moves = buildTagMoves(diff([before("a", "yes")], [now("a", "yes")]));
    expect(noTagMoves(moves)).toBe(true);
    expect(moves.tagChanges).toBe(0);
    for (const from of MOVE_KEYS) for (const to of MOVE_KEYS) expect(moves.cells[from][to]).toBe(0);
  });
  it("counts a tag that changed in the cell for the tag it had and the tag it has", () => {
    const moves = buildTagMoves(diff([before("a", "yes"), before("b", "yes")], [now("a", "limited"), now("b", "limited")]));
    expect(moves.cells.yes.limited).toBe(2);
    expect(moves.tagChanges).toBe(2);
  });
  it("does not count a place whose tag did not change, even when another field did", () => {
    const moves = buildTagMoves(diff([before("a", "yes", { address: "9 Elsewhere Road" })], [now("a", "yes")]));
    expect(moves.tagChanges).toBe(0);
    expect(noTagMoves(moves)).toBe(true);
  });
  it("counts UNKNOWN to a value as a move, and a value to UNKNOWN as a move", () => {
    const moves = buildTagMoves(diff([before("a", "unknown"), before("b", "no")], [now("a", "yes"), now("b", undefined)]));
    expect(moves.cells.unknown.yes).toBe(1);
    expect(moves.cells.no.unknown).toBe(1);
    expect(moves.nowReported).toBe(1);
    expect(moves.nowUnknown).toBe(1);
    expect(moves.betweenReported).toBe(0);
  });
  it("splits tag changes into now reported, now UNKNOWN and between reported tags", () => {
    const earlier = [before("a", "unknown"), before("b", "unknown"), before("c", "yes"), before("d", "yes"), before("e", "no")];
    const current = [now("a", "yes"), now("b", "no"), now("c", undefined), now("d", "limited"), now("e", "designated")];
    const m = buildTagMoves(diff(earlier, current));
    expect([m.nowReported, m.nowUnknown, m.betweenReported]).toEqual([2, 1, 2]);
    expect(m.nowReported + m.nowUnknown + m.betweenReported).toBe(m.tagChanges);
  });
  it("counts added places by the tag they have now, in the absent row", () => {
    const moves = buildTagMoves(diff([], [now("a", "yes"), now("b", undefined)]));
    expect(moves.cells[ABSENT].yes).toBe(1);
    expect(moves.cells[ABSENT].unknown).toBe(1);
    expect(moves.added).toBe(2);
    expect(moves.tagChanges).toBe(0);
  });
  it("counts places no longer listed by the tag they had, in the absent column", () => {
    const moves = buildTagMoves(diff([before("a", "limited"), before("b", "unknown")], []));
    expect(moves.cells.limited[ABSENT]).toBe(1);
    expect(moves.cells.unknown[ABSENT]).toBe(1);
    expect(moves.removed).toBe(2);
  });
  it("never puts anything on the diagonal, or in the absent-to-absent cell", () => {
    const earlier = [before("a", "yes"), before("b", "no"), before("gone", "unknown")];
    const current = [now("a", "yes"), now("b", "limited"), now("new", "designated")];
    const moves = buildTagMoves(diff(earlier, current));
    for (const key of MOVE_KEYS) expect(moves.cells[key][key], key).toBe(0);
  });
  it("lists the places in each cell in id order, with their names", () => {
    const moves = buildTagMoves(diff([before("c", "yes"), before("a", "yes"), before("b", "yes")], [now("c", "no"), now("a", "no"), now("b", "no", { name: "" })]));
    expect(placesIn(moves, "yes", "no")).toEqual([
      { id: "a", name: "Place a" },
      { id: "b", name: "Place b" },
      { id: "c", name: "Place c" },
    ]);
  });
  it("uses the earlier name when the pack now gives none, as the diff does", () => {
    const moves = buildTagMoves(diff([before("a", "yes", { name: "Old Name" })], [now("a", "no", { name: "" })]));
    expect(placesIn(moves, "yes", "no")).toEqual([{ id: "a", name: "Old Name" }]);
  });
  it("keeps a null name when neither side has one", () => {
    const moves = buildTagMoves(diff([before("a", "yes", { name: null })], [now("a", "no", { name: "" })]));
    expect(placesIn(moves, "yes", "no")[0]!.name).toBeNull();
  });
  it("returns an empty list for a cell with no places", () => {
    expect(placesIn(buildTagMoves(diff([], [])), "yes", "no")).toEqual([]);
  });
  it("counts each place once however many fields changed", () => {
    const moves = buildTagMoves(diff([before("a", "yes", { name: "Old", address: "Old Road" })], [now("a", "no")]));
    expect(moves.tagChanges).toBe(1);
    expect(placesIn(moves, "yes", "no")).toHaveLength(1);
  });
  it("sets aside a tag change whose text is not a tag this App knows", () => {
    const odd: PackDiff = {
      added: [],
      removed: [],
      unchanged: 0,
      earlierCount: 1,
      currentCount: 1,
      byField: { tag: 1, name: 0, kind: 0, address: 0, position: 0, source: 0, retrieved: 0, tier: 0 },
      changed: [{ id: "x", name: "X", changes: [{ field: "tag", before: "maybe", after: "yes" }] }],
    };
    const moves = buildTagMoves(odd);
    expect(moves.unrecognised).toBe(1);
    expect(moves.tagChanges).toBe(0);
    expect(moves.cells.yes.yes).toBe(0);
  });
  it("does not change the diff it is given", () => {
    const d = diff([before("a", "yes")], [now("a", "no")]);
    const copy = JSON.stringify(d);
    buildTagMoves(d);
    expect(JSON.stringify(d)).toBe(copy);
  });
});

describe("noTagMoves", () => {
  it("is false when a place was only added or only removed", () => {
    expect(noTagMoves(buildTagMoves(diff([], [now("a", "yes")])))).toBe(false);
    expect(noTagMoves(buildTagMoves(diff([before("a", "yes")], [])))).toBe(false);
  });
});

describe("rankedMoves", () => {
  const moves = buildTagMoves(
    diff(
      [before("a", "yes"), before("b", "yes"), before("c", "no"), before("d", "unknown"), before("gone", "limited")],
      [now("a", "limited"), now("b", "limited"), now("c", "yes"), now("d", "yes"), now("new", "no")],
    ),
  );
  it("puts the cell with the most places first", () => {
    expect(rankedMoves(moves)[0]).toEqual({ from: "yes", to: "limited", places: 2 });
  });
  it("breaks ties by table order, never by what the tags are", () => {
    const rest = rankedMoves(moves).slice(1);
    expect(rest.every((m) => m.places === 1)).toBe(true);
    expect(rest.map((m) => cellKey(m.from, m.to))).toEqual(["limited>absent", "no>yes", "unknown>yes", "absent>no"].sort((a, b) => order(a) - order(b)));
  });
  it("lists only the cells that have places", () => {
    expect(rankedMoves(moves)).toHaveLength(5);
    expect(rankedMoves(buildTagMoves(diff([], [])))).toEqual([]);
  });
  it("adds up to the places that moved, were added or were removed", () => {
    expect(rankedMoves(moves).reduce((n, m) => n + m.places, 0)).toBe(moves.tagChanges + moves.added + moves.removed);
  });
});

function order(key: string): number {
  const [from, to] = key.split(">") as [string, string];
  return MOVE_KEYS.indexOf(from as (typeof MOVE_KEYS)[number]) * MOVE_KEYS.length + MOVE_KEYS.indexOf(to as (typeof MOVE_KEYS)[number]);
}

describe("labels", () => {
  it("reads in English", () => {
    expect(MOVE_KEYS.map((k) => moveKeyLabel(k, "en", "from"))).toEqual(["Yes", "Limited", "No", "Designated", "UNKNOWN", "Not in the earlier file"]);
    expect(moveKeyLabel(ABSENT, "en", "to")).toBe("Not listed now");
  });
  it("reads in French", () => {
    expect(MOVE_KEYS.map((k) => moveKeyLabel(k, "fr", "to"))).toEqual(["Oui", "Limité", "Non", "Réservé", "UNKNOWN", "Ne figure plus"]);
    expect(moveKeyLabel(ABSENT, "fr", "from")).toBe("Absent du fichier précédent");
  });
  it("puts a move in words", () => {
    expect(moveLabel("yes", "limited", "en")).toBe("Yes to Limited");
    expect(moveLabel(ABSENT, "yes", "en")).toBe("Not in the earlier file to Yes");
    expect(moveLabel("unknown", "no", "fr")).toBe("UNKNOWN vers Non");
  });
  it("keeps the token UNKNOWN in French, never INCONNU", () => {
    for (const from of MOVE_KEYS) for (const to of MOVE_KEYS) expect(moveLabel(from, to, "fr")).not.toMatch(/INCONNU/i);
  });
});

describe("tagMovesLine", () => {
  it("says no tag changed when none did", () => {
    expect(tagMovesLine(buildTagMoves(diff([before("a", "yes")], [now("a", "yes")])), "en")).toBe("No wheelchair tag changed in the places found in both.");
  });
  it("says how many changed and in which way, leaving out the ways with none", () => {
    const m = buildTagMoves(diff([before("a", "unknown"), before("b", "unknown"), before("c", "yes")], [now("a", "yes"), now("b", "no"), now("c", undefined)]));
    expect(tagMovesLine(m, "en")).toBe("3 places changed their wheelchair tag: 2 from UNKNOWN to a reported tag; 1 from a reported tag to UNKNOWN.");
  });
  it("is singular for one place", () => {
    const m = buildTagMoves(diff([before("a", "yes")], [now("a", "no")]));
    expect(tagMovesLine(m, "en")).toBe("1 place changed its wheelchair tag: 1 from one reported tag to another.");
  });
  it("sets French with a no-break space before the colon and a thin space before the semicolon", () => {
    const m = buildTagMoves(diff([before("a", "unknown"), before("c", "yes")], [now("a", "yes"), now("c", undefined)]));
    expect(tagMovesLine(m, "fr")).toBe("2 lieux ont changé d’indication pour fauteuil roulant\u00a0: 1 de UNKNOWN à une indication fournie\u202f; 1 d’une indication fournie à UNKNOWN.");
  });
  it("uses the French singular for one place", () => {
    const m = buildTagMoves(diff([before("a", "yes")], [now("a", "no")]));
    expect(tagMovesLine(m, "fr")).toMatch(/^1 lieu a changé d’indication/);
  });
});

describe("addedRemovedLine", () => {
  it("is empty when none were added or removed", () => {
    expect(addedRemovedLine(buildTagMoves(diff([before("a", "yes")], [now("a", "yes")])), "en")).toBe("");
  });
  it("counts each, singular and plural, in both languages", () => {
    const m = buildTagMoves(diff([before("gone", "yes")], [now("n1", "yes"), now("n2", "no")]));
    expect(addedRemovedLine(m, "en")).toBe("2 places added; 1 place no longer listed.");
    expect(addedRemovedLine(m, "fr")).toBe("2 lieux ajoutés\u202f; 1 lieu ne figure plus.");
  });
  it("leaves out the side with none", () => {
    expect(addedRemovedLine(buildTagMoves(diff([], [now("n1", "yes")])), "en")).toBe("1 place added.");
  });
});

describe("the copy", () => {
  it("says a move is not a rating of the place", () => {
    expect(tagMovesNote("en")).toContain("is not a rating of the place");
  });
  it("is clean in both languages and never uses ranking or accuracy words", () => {
    const m = buildTagMoves(diff([before("a", "yes"), before("gone", "no")], [now("a", "limited"), now("n", "yes")]));
    for (const locale of ["en", "fr"] as const) {
      for (const line of [tagMovesNote(locale), tagMovesLine(m, locale), addedRemovedLine(m, locale), ...MOVE_KEYS.map((k) => moveKeyLabel(k, locale, "from")), moveLabel("yes", "no", locale)]) {
        expect(lintCopy(line, locale), line).toEqual([]);
        // The note itself says what a move is not ("better or worse"), so only the other lines are held to the ranking-words ban.
        if (line !== tagMovesNote(locale)) expect(line).not.toMatch(/\b(improved|worsened|declined|degraded|better|worse|regress)|amélior|dégrad/i);
      }
    }
  });
});

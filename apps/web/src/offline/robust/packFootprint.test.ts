import { describe, expect, it } from "vitest";
import {
  compareFootprintCapacity,
  measureFootprint,
  readFootprintEvidence,
  type FootprintStatus,
} from "./packFootprint";
import type { FootprintIndex } from "./packFootprintIndex";
import { DEFAULT_RESERVE_BYTES } from "./quotaPlanning";

const builtAt = "2026-11-20T08:00:00Z";

/** Symbolic digests keep the overlap between cells visible in each example. */
function indexFrom(
  regionCells: Record<string, string[]>,
  cellHashes: Record<string, string[]>,
  bytes: Record<string, number | null>,
): FootprintIndex {
  return {
    builtAt,
    regions: new Map(Object.entries(regionCells).map(([id, cellIds]) => [
      id, { id, cellIds, label: { en: id, fr: id }, withheldCount: 0, complete: true },
    ])),
    cells: new Map(Object.entries(cellHashes).map(([id, hashes]) => [id, { id, hashes, complete: true }])),
    parts: new Map(Object.entries(bytes).map(([hash, size]) => [hash, { hash, bytes: size, sources: [] }])),
  };
}

function reading(id: string, cells: string[], missingCells: string[] = []): FootprintStatus {
  return { id, cells, missingCells, builtAt };
}

const corridor = indexFrom(
  { west: ["market", "hub"], east: ["hub", "yard"], center: ["hub"] },
  { market: ["streets", "names"], hub: ["names", "stops"], yard: ["stops", "places"] },
  { streets: 16, names: 4, stops: 8, places: 2 },
);
const westReady = reading("west", ["market", "hub"]);
const eastMissing = reading("east", ["hub", "yard"], ["yard"]);

describe("current device evidence for compressed pack parts", () => {
  it("learns presence from complete cells even if their region is outside the selection", () => {
    const facts = readFootprintEvidence(corridor, [westReady, eastMissing]);
    expect(facts.present).toEqual(new Set(["streets", "names", "stops"]));
    expect(facts.missingGroups).toEqual([["places"]]);
    expect(facts.inconsistent).toBe(false);
    const east = measureFootprint(corridor, facts, ["east"]);
    expect(east.presentBytes).toBe(12);
    expect(east.declaredBytes).toBe(14);
    expect(east.transfer).toEqual({ minimumBytes: 2, maximumBytes: 2 });
  });

  it("accepts reordered region cells and repeated identical readings", () => {
    const reordered = reading("west", ["hub", "market"]);
    const facts = readFootprintEvidence(corridor, [eastMissing, reordered, westReady, eastMissing]);
    const expected = readFootprintEvidence(corridor, [westReady, eastMissing]);
    expect(facts).toEqual(expected);
  });

  it("ignores observations of an earlier build even when the cell IDs still match", () => {
    const old = { ...westReady, builtAt: "2026-10-20T08:00:00Z" };
    const facts = readFootprintEvidence(corridor, [old]);
    expect(facts.present.size).toBe(0);
    expect(facts.missingGroups).toEqual([]);
    expect(measureFootprint(corridor, facts, ["west"]).transfer).toEqual({
      minimumBytes: 0,
      maximumBytes: 28,
    });
  });

  it("does not treat a missing build identity as a revision match", () => {
    const unstamped = { ...corridor, builtAt: "" };
    const facts = readFootprintEvidence(unstamped, [{ ...westReady, builtAt: "" }]);
    expect(facts.present.size).toBe(0);
    expect(facts.missingGroups).toHaveLength(0);
  });

  it("rejects only the row with unknown, duplicated or misassigned cells", () => {
    const valid = reading("center", ["hub"]);
    const suspect = [
      reading("elsewhere", ["market"]),
      reading("west", ["market", "market"]),
      reading("west", ["market"]),
      reading("west", ["market", "yard"]),
      reading("west", ["market", "hub"], ["foreign"]),
    ];
    for (const row of suspect) {
      expect(readFootprintEvidence(corridor, [row, valid])).toEqual(
        readFootprintEvidence(corridor, [valid]),
      );
    }
  });

  it("discards device conclusions when two owners disagree about a shared cell", () => {
    const disagree = reading("center", ["hub"], ["hub"]);
    for (const rows of [[westReady, disagree], [disagree, westReady]]) {
      const facts = readFootprintEvidence(corridor, rows);
      expect(facts.inconsistent).toBe(true);
      expect(facts.present.size).toBe(0);
      expect(facts.missingGroups).toHaveLength(0);
      expect(measureFootprint(corridor, facts, ["east"]).transfer).toEqual({
        minimumBytes: 0,
        maximumBytes: 14,
      });
    }
  });

  it("detects contradictions across differently named cells with the same digest", () => {
    const index = indexFrom({ path: ["entrance", "exit"] }, {
      entrance: ["map"], exit: ["map"],
    }, { map: 7 });
    const facts = readFootprintEvidence(index, [reading("path", ["entrance", "exit"], ["exit"])]);
    expect(facts.inconsistent).toBe(true);
    expect(measureFootprint(index, facts, ["path"]).transfer).toEqual({
      minimumBytes: 0,
      maximumBytes: 7,
    });
  });

  it("rejects a claim that a cell with no downloadable parts is missing one", () => {
    const index = indexFrom({ station: ["empty"] }, { empty: [] }, {});
    const missing = readFootprintEvidence(index, [reading("station", ["empty"], ["empty"])]);
    expect(missing.inconsistent).toBe(true);
    const ready = readFootprintEvidence(index, [reading("station", ["empty"])]);
    expect(ready.inconsistent).toBe(false);
    expect(measureFootprint(index, ready, ["station"]).transfer.maximumBytes).toBe(0);
  });
});

describe("footprints of overlapping selections", () => {
  it("counts repeated parts once within a region and charges shared bytes to its first owner", () => {
    const selection = measureFootprint(corridor, readFootprintEvidence(corridor, []), ["west", "east"]);
    expect(selection.steps).toEqual([
      { regionId: "west", partCount: 3, commonPartCount: 0, regionBytes: 28, additionalBytes: 28 },
      { regionId: "east", partCount: 3, commonPartCount: 2, regionBytes: 14, additionalBytes: 2 },
    ]);
    expect(selection.declaredBytes).toBe(30);
    expect(selection.countedOnceBytes).toBe(12);
    expect(selection.presentBytes).toBe(0);
    expect(selection.sharedHashes).toEqual(new Set(["names", "stops"]));
  });

  it("reassigns the marginal cost when selection order changes without altering aggregate totals", () => {
    const facts = readFootprintEvidence(corridor, [eastMissing]);
    const westFirst = measureFootprint(corridor, facts, ["west", "east"]);
    const eastFirst = measureFootprint(corridor, facts, ["east", "west"]);
    expect(eastFirst.steps.map((step) => step.additionalBytes)).toEqual([14, 16]);
    expect(eastFirst.steps.map((step) => step.regionId)).toEqual(["east", "west"]);
    expect(eastFirst.hashes).toEqual(westFirst.hashes);
    expect(eastFirst.sharedHashes).toEqual(westFirst.sharedHashes);
    expect(eastFirst.countedOnceBytes).toBe(westFirst.countedOnceBytes);
    expect(eastFirst.presentBytes).toBe(westFirst.presentBytes);
    expect(eastFirst.transfer).toEqual(westFirst.transfer);
  });

  it("counts each avoided copy separately when three region totals include the same digest", () => {
    const selection = measureFootprint(corridor, readFootprintEvidence(corridor, []), ["west", "east", "center"]);
    expect(selection.steps.map((step) => step.additionalBytes)).toEqual([28, 2, 0]);
    expect(selection.sharedHashes.size).toBe(2);
    expect(selection.countedOnceBytes).toBe(24);
    expect(selection.steps.reduce((sum, step) => sum + step.regionBytes!, 0)).toBe(
      selection.declaredBytes! + selection.countedOnceBytes!,
    );
  });

  it("ignores duplicate selections and keeps the first position for each region", () => {
    const facts = readFootprintEvidence(corridor, [westReady]);
    const canonical = measureFootprint(corridor, facts, ["east", "west"]);
    expect(measureFootprint(corridor, facts, ["east", "east", "west", "east", "west"])).toEqual(canonical);
  });

  it("maintains a known zero for an empty selection even with device evidence", () => {
    const empty = measureFootprint(corridor, readFootprintEvidence(corridor, [eastMissing]), []);
    expect(empty.steps).toEqual([]);
    expect(empty.hashes.size).toBe(0);
    expect(empty.declaredBytes).toBe(0);
    expect(empty.countedOnceBytes).toBe(0);
    expect(empty.presentBytes).toBe(0);
    expect(empty.transfer).toEqual({ minimumBytes: 0, maximumBytes: 0 });
  });

  it("keeps known parts visible while refusing an exact total for an unavailable region", () => {
    const facts = readFootprintEvidence(corridor, [westReady]);
    const partial = measureFootprint(corridor, facts, ["missing", "west", "missing"]);
    expect(partial.unlistedRegions).toEqual(["missing"]);
    expect(partial.steps[0]).toMatchObject({ regionId: "west", regionBytes: 28, additionalBytes: null });
    expect(partial.hashes).toEqual(new Set(["streets", "names", "stops"]));
    expect(partial.declaredBytes).toBeNull();
    expect(partial.countedOnceBytes).toBeNull();
    expect(partial.presentBytes).toBe(28);
    expect(partial.transfer.maximumBytes).toBeNull();
  });

  it("allows evidence from a complete neighbor but rejects an incomplete region's stronger claim", () => {
    const regions = new Map(corridor.regions);
    regions.set("west", { ...regions.get("west")!, complete: false });
    const index = { ...corridor, regions };
    const facts = readFootprintEvidence(index, [westReady, reading("center", ["hub"])]);
    const partial = measureFootprint(index, facts, ["west"]);
    expect(partial.steps[0]?.regionBytes).toBeNull();
    expect(partial.presentBytes).toBe(12);
    expect(partial.transfer).toEqual({ minimumBytes: 0, maximumBytes: null });
  });
});

describe("safe transfer bounds from missing-cell evidence", () => {
  it("adds the least possible absent bytes for disjoint candidate groups", () => {
    const index = indexFrom({ district: ["north", "south"] }, {
      north: ["northMap", "northSearch"], south: ["southMap", "southSearch"],
    }, { northMap: 11, northSearch: 3, southMap: 15, southSearch: 5 });
    const rows = [reading("district", ["north", "south"], ["north", "south"])];
    const known = readFootprintEvidence(index, rows);
    expect(measureFootprint(index, known, ["district"]).transfer).toEqual({
      minimumBytes: 8,
      maximumBytes: 34,
    });
  });

  it("does not charge the same missing part twice when one absence explains both cells", () => {
    const facts = readFootprintEvidence(corridor, [reading("west", ["market", "hub"], ["market", "hub"])]);
    const range = measureFootprint(corridor, facts, ["west"]).transfer;
    expect(range).toEqual({ minimumBytes: 4, maximumBytes: 28 });
  });

  it("an absent part outside the selection may satisfy the whole missing-cell observation", () => {
    const onlyMarket = reading("west", ["hub", "market"], ["market", "hub"]);
    const index = indexFrom(
      { west: ["hub", "market"], downtown: ["walk"] },
      { hub: ["x", "y"], market: ["y", "z"], walk: ["y"] },
      { x: 2, y: 7, z: 3 },
    );
    const facts = readFootprintEvidence(index, [onlyMarket]);
    expect(measureFootprint(index, facts, ["downtown"]).transfer).toEqual({
      minimumBytes: 0,
      maximumBytes: 7,
    });
  });

  it("a missing zero-byte part can establish absence without forcing a positive transfer", () => {
    const index = indexFrom({ local: ["mixed"] }, { mixed: ["signature", "routes"] }, { signature: 0, routes: 9 });
    const facts = readFootprintEvidence(index, [reading("local", ["mixed"], ["mixed"])]);
    expect(measureFootprint(index, facts, ["local"]).transfer).toEqual({
      minimumBytes: 0,
      maximumBytes: 9,
    });
  });

  it("avoids rounded totals and keeps a safe lower bound across exact-arithmetic overflow", () => {
    const index = indexFrom({ local: ["large", "small"] }, {
      large: ["archive"], small: ["index"],
    }, { archive: Number.MAX_SAFE_INTEGER, index: 1 });
    const facts = readFootprintEvidence(index, [reading("local", ["large", "small"], ["large", "small"])]);
    const selection = measureFootprint(index, facts, ["local"]);
    expect(selection.declaredBytes).toBeNull();
    expect(selection.steps[0]?.additionalBytes).toBeNull();
    expect(selection.transfer).toEqual({ minimumBytes: Number.MAX_SAFE_INTEGER, maximumBytes: null });
  });

  it("reports unknown present bytes if the observed present sum is outside exact arithmetic", () => {
    const index = indexFrom({ local: ["large", "small"] }, {
      large: ["archive"], small: ["index"],
    }, { archive: Number.MAX_SAFE_INTEGER, index: 1 });
    const facts = readFootprintEvidence(index, [reading("local", ["large", "small"])]);
    const selection = measureFootprint(index, facts, ["local"]);
    expect(selection.presentBytes).toBeNull();
    expect(selection.transfer).toEqual({ minimumBytes: 0, maximumBytes: 0 });
  });
});

function subsets<T>(items: readonly T[]): T[][] {
  return items.reduce<T[][]>((found, next) => [...found, ...found.map((prior) => [...prior, next])], [[]]);
}

describe("footprint conservation against possible device contents", () => {
  it("encloses each feasible transfer for every cache, partial observation and selection on a shared corridor", () => {
    const regions = [...corridor.regions.keys()];
    const allDigests = [...corridor.parts.keys()];
    for (const contents of subsets(allDigests)) {
      const cached = new Set(contents);
      const actual = regions.map((id) => {
        const cellIds = [...corridor.regions.get(id)!.cellIds];
        const missing = cellIds.filter((cell) => corridor.cells.get(cell)!.hashes.some((hash) => !cached.has(hash)));
        return reading(id, cellIds, missing);
      });
      for (const observed of subsets(actual)) {
        const facts = readFootprintEvidence(corridor, observed);
        expect(facts.inconsistent).toBe(false);
        for (const selection of subsets(regions)) {
          const expectedParts = new Set(selection.flatMap((region) =>
            corridor.regions.get(region)!.cellIds.flatMap((cell) => corridor.cells.get(cell)!.hashes),
          ));
          let bytesToFetch = 0;
          let total = 0;
          for (const hash of expectedParts) {
            const size = corridor.parts.get(hash)!.bytes!;
            total += size;
            if (!cached.has(hash)) bytesToFetch += size;
          }
          const footprint = measureFootprint(corridor, facts, selection);
          const context = JSON.stringify({ contents, observed: observed.map((r) => r.id), selection });
          expect(footprint.hashes, context).toEqual(expectedParts);
          expect(footprint.declaredBytes, context).toBe(total);
          expect(footprint.transfer.minimumBytes, context).toBeLessThanOrEqual(bytesToFetch);
          expect(footprint.transfer.maximumBytes, context).toBeGreaterThanOrEqual(bytesToFetch);
          expect(footprint.presentBytes! + footprint.transfer.maximumBytes!, context).toBe(total);
          const previous = measureFootprint(corridor, facts, selection.slice(0, -1));
          expect(footprint.declaredBytes!, context).toBeGreaterThanOrEqual(previous.declaredBytes!);
          expect(footprint.transfer.maximumBytes!, context).toBeGreaterThanOrEqual(previous.transfer.maximumBytes!);
        }
      }
    }
  });
});

describe("storage estimates after reserving device space", () => {
  it("uses the quota minus usage and reserve, including the equality boundary", () => {
    const estimate = { quota: 120, usage: 44 };
    const range = { minimumBytes: 20, maximumBytes: 26 };
    expect(compareFootprintCapacity(range, estimate, 50)).toEqual({ status: "within", usableBytes: 26 });
    expect(compareFootprintCapacity(range, estimate, 51)).toEqual({ status: "uncertain", usableBytes: 25 });
    expect(compareFootprintCapacity(range, estimate, 57)).toEqual({ status: "over", usableBytes: 19 });
  });

  it("uses the same default reserve as the storage planner", () => {
    const range = { minimumBytes: 1, maximumBytes: 1 };
    const estimate = { quota: DEFAULT_RESERVE_BYTES + 1, usage: 0 };
    expect(compareFootprintCapacity(range, estimate)).toEqual({ usableBytes: 1, status: "within" });
    expect(compareFootprintCapacity(range, { ...estimate, usage: 1 })).toEqual({ usableBytes: 0, status: "over" });
  });

  it("an unbounded upper estimate still rules out a download whose minimum exceeds available space", () => {
    const range = { minimumBytes: 20, maximumBytes: null };
    expect(compareFootprintCapacity(range, { quota: 10, usage: 0 }, 0).status).toBe("over");
    expect(compareFootprintCapacity(range, { quota: 20, usage: 0 }, 0).status).toBe("uncertain");
  });

  it("separates missing or inconsistent storage evidence from a genuine zero-byte requirement", () => {
    for (const estimate of [{}, { quota: 5 }, { quota: 5, usage: 8 }, { usage: 0, quota: NaN }]) {
      expect(compareFootprintCapacity({ minimumBytes: 1, maximumBytes: 1 }, estimate, 0)).toEqual({
        usableBytes: null,
        status: "unknown",
      });
      expect(compareFootprintCapacity({ minimumBytes: 0, maximumBytes: 0 }, estimate, 0)).toEqual({
        usableBytes: null,
        status: "no-transfer",
      });
    }
  });

  it("caps usable space at zero even when reserve exceeds the reported free bytes", () => {
    expect(compareFootprintCapacity({ minimumBytes: 0, maximumBytes: 5 }, { quota: 3, usage: 1 }, 8)).toEqual({
      usableBytes: 0,
      status: "uncertain",
    });
  });

  it("rejects negative, fractional, nonfinite and unsafe byte reserves", () => {
    for (const reserve of [-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => compareFootprintCapacity({ minimumBytes: 0, maximumBytes: 0 }, {}, reserve)).toThrow(RangeError);
    }
  });
});

import { describe, expect, it } from "vitest";
import { cellOf, placeHintFor, rememberPlace } from "./placeHints.ts";

describe("place hints", () => {
  it("names the pack cell that holds a point", () => {
    expect(cellOf(43.645, -79.38)).toBe("n43.5_w079.5");
    expect(cellOf(43.49, -79.51)).toBe("n43.0_w080.0");
    expect(cellOf(41.2, -82.9)).toBe("n41.0_w083.0");
    expect(cellOf(Number.NaN, -79)).toBeNull();
  });

  it("remembers in memory where a search found a place", () => {
    rememberPlace("osm:node/1", 43.645, -79.38, "venue");
    expect(placeHintFor("osm:node/1")).toEqual({ cells: ["n43.5_w079.5"], tranche: "venue" });
    rememberPlace("gtfs:stop/2", Number.NaN, Number.NaN, "transit");
    expect(placeHintFor("gtfs:stop/2")).toEqual({ tranche: "transit" });
    expect(placeHintFor("never:seen")).toBeUndefined();
  });
});

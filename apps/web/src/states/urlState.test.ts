import { describe, expect, it } from "vitest";
import { EMPTY_FILTER, MAX_QUERY_LENGTH, decodeFilter, encodeFilter, type PlaceFilter } from "./index";

describe("urlState", () => {
  it("omits defaults", () => {
    expect(encodeFilter(EMPTY_FILTER)).toBe("");
  });
  it("round-trips a full filter", () => {
    const f: PlaceFilter = { required: ["step-free-entrance", "elevator"], includeUnknown: true, query: "Café Nord" };
    const encoded = encodeFilter(f);
    expect(encoded).toContain("unk=1");
    const back = decodeFilter(encoded);
    expect(back.required).toEqual(["step-free-entrance", "elevator"]);
    expect(back.includeUnknown).toBe(true);
    expect(back.query).toBe("Café Nord");
  });
  it("orders and de-duplicates features canonically", () => {
    expect(decodeFilter("need=elevator,elevator,step-free-entrance").required).toEqual(["step-free-entrance", "elevator"]);
  });
  it("accepts a leading question mark", () => {
    expect(decodeFilter("?unk=1").includeUnknown).toBe(true);
  });
  it("drops unknown ids and ignores unknown parameters", () => {
    const f = decodeFilter("need=elevator,teleporter&evil=1&unk=yes");
    expect(f.required).toEqual(["elevator"]);
    expect(f.includeUnknown).toBe(false);
  });
  it("limits and cleans the query", () => {
    expect(decodeFilter("q=" + "a".repeat(500)).query).toHaveLength(MAX_QUERY_LENGTH);
    expect(decodeFilter("q=" + encodeURIComponent("a\u0000b\nc")).query).toBe("abc");
    expect(decodeFilter("q=%20%20").query).toBe("");
  });
  it("returns the default filter for garbage", () => {
    expect(decodeFilter("%%%")).toEqual(EMPTY_FILTER);
  });
});

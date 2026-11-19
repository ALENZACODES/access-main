import { describe, expect, it } from "vitest";
import { FEATURE_IDS, MAX_COMPARE, compareRouteView, initialConnectivity, type CompareContext } from "./index";
import { mkRecord } from "./testHelpers";

const a = mkRecord("a", "Alpha", { elevator: "yes", "automatic-door": "no", "level-path": "unknown" });
const b = mkRecord("b", "Beta", { elevator: "yes", "automatic-door": "yes" });
const c = mkRecord("c", "Gamma", { elevator: "partial" });
const d = mkRecord("d", "Delta", {});
const all = [a, b, c, d];
const ctx = (over: Partial<CompareContext> = {}): CompareContext => ({ locale: "en", connectivity: initialConnectivity(true), ...over });

describe("compareRouteView", () => {
  it("builds one row per feature and one column per place, in the requested order", () => {
    const v = compareRouteView({ status: "ok", places: all }, ["b", "a"], ctx());
    if (v.kind !== "table") throw new Error("table expected");
    expect(v.columns.map((x) => x.id)).toEqual(["b", "a"]);
    expect(v.rows.map((r) => r.feature)).toEqual([...FEATURE_IDS]);
    expect(v.caption).toBe("Reported details for Beta and Alpha");
  });
  it("flags rows that are not the same for every place", () => {
    const v = compareRouteView({ status: "ok", places: all }, ["a", "b"], ctx());
    if (v.kind !== "table") throw new Error("table expected");
    const row = (f: string) => v.rows.find((r) => r.feature === f)!;
    expect(row("elevator").differs).toBe(false);
    expect(row("elevator").differsText).toBeNull();
    expect(row("automatic-door").differs).toBe(true);
    expect(row("automatic-door").differsText).toBe("Not the same for every place");
  });
  it("keeps UNKNOWN as UNKNOWN and treats it as different from a reported value", () => {
    const v = compareRouteView({ status: "ok", places: all }, ["a", "b"], ctx());
    if (v.kind !== "table") throw new Error("table expected");
    const row = v.rows.find((r) => r.feature === "level-path")!;
    expect(row.cells.map((x) => x.statusText)).toEqual(["UNKNOWN", "UNKNOWN"]);
    expect(row.differs).toBe(false); // both UNKNOWN: nothing is claimed either way
    const mixed = compareRouteView({ status: "ok", places: all }, ["a", "d"], ctx());
    if (mixed.kind !== "table") throw new Error("table expected");
    expect(mixed.rows.find((r) => r.feature === "elevator")!.differs).toBe(true);
  });
  it("carries each reported cell's source line", () => {
    const v = compareRouteView({ status: "ok", places: all }, ["a", "b"], ctx());
    if (v.kind !== "table") throw new Error("table expected");
    const cell = v.rows.find((r) => r.feature === "elevator")!.cells[0]!;
    expect(cell.sourceLine).toContain("Source: Test source");
    expect(v.rows.find((r) => r.feature === "level-path")!.cells[0]!.sourceLine).toBeNull();
  });
  it("limits to three places, ignores duplicates and says so", () => {
    const v = compareRouteView({ status: "ok", places: all }, ["a", "a", "b", "c", "d"], ctx());
    if (v.kind !== "table") throw new Error("table expected");
    expect(v.columns).toHaveLength(MAX_COMPARE);
    expect(v.notices).toEqual(["You can compare up to 3 places. Extra places are not shown."]);
  });
  it("reports places that cannot be found and needs at least two", () => {
    const v = compareRouteView({ status: "ok", places: all }, ["a", "zzz"], ctx());
    expect(v.kind).toBe("too-few");
    if (v.kind !== "too-few") return;
    expect(v.text).toBe("Choose at least two places to compare.");
    expect(v.notices).toEqual(["1 place could not be found and is not shown."]);
    expect(compareRouteView({ status: "ok", places: all }, [], ctx()).kind).toBe("too-few");
  });
  it("works in French and maps errors", () => {
    const v = compareRouteView({ status: "ok", places: all }, ["a", "b"], ctx({ locale: "fr" }));
    expect(v.kind === "table" && v.caption).toBe("Détails signalés pour Alpha et Beta");
    expect(v.kind === "table" && v.rows[0]!.label).toBe("Entrée sans marche");
    const err = compareRouteView({ status: "error" }, [], ctx({ connectivity: initialConnectivity(false) }));
    expect(err.kind === "error" && err.view.title).toBe("You are offline");
  });
});

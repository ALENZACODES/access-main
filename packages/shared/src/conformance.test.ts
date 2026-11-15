import { describe, expect, it } from "vitest";
import records from "./fixtures/access-tools-directory.json" with { type: "json" };
import { checkModuleItem, checkModuleResult, guardModules, lastContractIssues } from "./conformance.ts";
import type { DirectoryRecord } from "./directory.ts";
import { emptyModuleResult, type ModuleRegistry, type ModuleResult } from "./modules.ts";
import type { Provenance } from "./provenance.ts";

const PROVENANCE: Provenance = {
  source_name: "Synthetic test source",
  source_url: null,
  licence: "UNKNOWN",
  licence_url: null,
  source_date: "2026-11-01",
  retrieved_at: "2026-11-13T12:00:00.000Z",
  tier: 0,
  prototype_label: "SEEDED-OPEN-DATA",
  freshness: "unknown",
};

const ctx = { locale: "en" as const, offline: false, profile: null, nowIso: "2026-11-14T12:00:00.000Z" };

function ready<T>(id: ModuleResult<T>["moduleId"], items: T[]): ModuleResult<T> {
  return { ...emptyModuleResult<T>(id, "modules.ready"), availability: "ready", items };
}

function stubRegistry(): ModuleRegistry {
  return {
    places: { id: "places", search: () => Promise.resolve(emptyModuleResult("places", "modules.unavailable")) },
    journey: { id: "journey", plan: () => Promise.resolve(emptyModuleResult("journey", "modules.unavailable")) },
    finders: { id: "finders", search: () => Promise.resolve(emptyModuleResult("finders", "modules.unavailable")) },
    navigator: { id: "navigator", list: () => Promise.resolve(emptyModuleResult("navigator", "modules.unavailable")) },
    games: { id: "games", list: () => Promise.resolve(emptyModuleResult("games", "modules.unavailable")) },
    help: { id: "help", list: () => Promise.resolve(emptyModuleResult("help", "modules.unavailable")) },
  };
}

describe("module result contract", () => {
  it("accepts an empty stub result for every route", () => {
    for (const id of ["places", "journey", "finders", "navigator", "games", "help"] as const) {
      expect(checkModuleResult(id, emptyModuleResult(id, "modules.unavailable")), id).toEqual([]);
    }
  });

  it("accepts a place with full provenance and refuses one without a licence, date, or tier", () => {
    expect(checkModuleResult("places", ready("places", [{ id: "p1", name: "Synthetic place", provenance: PROVENANCE }]))).toEqual([]);
    const codes = (provenance: Partial<Provenance>) =>
      checkModuleItem("places", { id: "p1", name: "x", provenance: { ...PROVENANCE, ...provenance } }).map((issue) => issue.code);
    expect(codes({ licence: "" })).toContain("missing_licence");
    expect(codes({ source_date: "" })).toContain("invalid_date");
    expect(codes({ tier: "UNKNOWN" as never })).toContain("invalid_tier");
    expect(codes({ tier: 3 })).toContain("verified_not_in_prototype");
    expect(checkModuleItem("places", { id: "p1", name: "x" }).map((issue) => issue.code)).toContain("missing_provenance");
  });

  it("refuses a result that claims live status or lists items while not ready", () => {
    const live = { ...ready("places", []), liveStatus: "live" };
    expect(checkModuleResult("places", live).map((issue) => issue.code)).toContain("live_status_claimed");
    const stubWithItems = { ...emptyModuleResult("places", "m"), items: [{ id: "p1", name: "x", provenance: PROVENANCE }] };
    expect(checkModuleResult("places", stubWithItems).map((issue) => issue.code)).toContain("items_without_ready");
    expect(checkModuleResult("journey", ready("places", [])).map((issue) => issue.code)).toContain("wrong_module");
  });

  it("refuses duplicate ids and a bad as-of time", () => {
    const item = { id: "same", name: "x", provenance: PROVENANCE };
    expect(checkModuleResult("places", ready("places", [item, item])).map((issue) => issue.code)).toContain("duplicate_id");
    expect(checkModuleResult("places", { ...ready("places", []), asOf: "yesterday" }).map((issue) => issue.code)).toContain("invalid_date");
    expect(checkModuleResult("places", { ...ready("places", []), asOf: "2026-11-14T12:00:00Z" })).toEqual([]);
  });

  it("refuses a finder hit that states a measurement and a journey plan that claims live status", () => {
    const finder = { id: "f1", name: "x", kind: "washroom", provenance: PROVENANCE, detail: "turning radius 150 cm" };
    expect(checkModuleItem("finders", finder).map((issue) => issue.code)).toContain("measurement_claimed");
    const plan = { id: "j1", summary: "x", provenance: PROVENANCE, liveStatus: "live" };
    expect(checkModuleItem("journey", plan).map((issue) => issue.code)).toContain("live_status_claimed");
  });

  it("accepts the access-tools directory and refuses a directory record with a changed tier", () => {
    const directory = records as DirectoryRecord[];
    expect(checkModuleResult("navigator", ready("navigator", directory))).toEqual([]);
    const changed = { ...directory[0], verificationTier: "surveyor" };
    expect(checkModuleItem("navigator", changed).length).toBeGreaterThan(0);
  });

  it("refuses a game with a clinical claim or flashing, and any health field", () => {
    const game = { id: "g1", title: "Grid Recall", clinicalClaim: false, seizureRiskFlash: false, keyboardOperable: true };
    expect(checkModuleItem("games", game)).toEqual([]);
    expect(checkModuleItem("games", { ...game, clinicalClaim: true }).map((issue) => issue.code)).toContain("clinical_claim");
    expect(checkModuleItem("games", { ...game, seizureRiskFlash: true }).map((issue) => issue.code)).toContain("flash");
    expect(checkModuleItem("games", { ...game, diagnosis: "x" }).map((issue) => issue.code)).toContain("forbidden_field");
  });

  it("requires a locale on a help article", () => {
    const article = { id: "h1", title: "Help", locale: "fr", provenance: PROVENANCE };
    expect(checkModuleItem("help", article)).toEqual([]);
    expect(checkModuleItem("help", { ...article, locale: "de" }).map((issue) => issue.code)).toContain("invalid_enum");
  });
});

describe("guardModules", () => {
  it("passes a conforming result through unchanged", async () => {
    const registry = stubRegistry();
    const result = ready("places", [{ id: "p1", name: "Synthetic place", provenance: PROVENANCE }]);
    registry.places = { id: "places", search: () => Promise.resolve(result) };
    const guarded = guardModules(registry);
    await expect(guarded.places.search({ text: "x" }, ctx)).resolves.toBe(result);
    expect(lastContractIssues.get("places")).toEqual([]);
  });

  it("replaces a nonconforming result with an empty error result", async () => {
    const registry = stubRegistry();
    registry.places = {
      id: "places",
      search: () => Promise.resolve(ready("places", [{ id: "p1", name: "No provenance" } as never])),
    };
    const result = await guardModules(registry).places.search({ text: "x" }, ctx);
    expect(result).toMatchObject({ availability: "error", items: [], messageKey: "modules.contractError", liveStatus: "unavailable" });
    expect(lastContractIssues.get("places")?.map((issue) => issue.code)).toContain("missing_provenance");
  });

  it("turns a module that throws into an error result", async () => {
    const registry = stubRegistry();
    registry.help = { id: "help", list: () => Promise.reject(new Error("offline")) };
    const result = await guardModules(registry).help.list(ctx);
    expect(result).toMatchObject({ availability: "error", items: [], messageKey: "modules.error" });
  });
});

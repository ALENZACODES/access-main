import { describe, expect, it } from "vitest";
import { createPrivacyController } from "../privacy/panel/controller";
import { FIXTURE } from "../privacy/panel/fixtures.test-util";
import { applyImport, prepareImport } from "../privacy/panel/importData";
import { liveControllerDeps } from "../privacy/panel/liveController";
import { eraseLocalData, exportLocalData } from "../privacy/panel/localData";
import { createMemoryStorage } from "../privacy/panel/storage";
import { STORAGE_REGISTER } from "../privacy/panel/storageRegister";
import {
  MAX_SHORTLIST,
  SHORTLIST_KEY,
  addToShortlist,
  loadShortlist,
  parseShortlist,
  saveShortlist,
  serializeShortlist,
  type ShortlistEntry,
} from "./shortlist";

const NOW = new Date(2026, 10, 19, 9, 0, 0);
const deps = liveControllerDeps();
const scope = { prefix: deps.prefix, keys: deps.extraKeys ?? [] };
const LIST: ShortlistEntry[] = [
  { id: "osm:way/1", addedOn: "2026-11-01" },
  { id: "osm:way/2", addedOn: "2026-11-02" },
];
const stored = () => serializeShortlist(LIST);
const seed = () => ({
  [SHORTLIST_KEY]: stored(),
  "access.language": "fr",
  "app.preferences.v1": '{"v":1}',
  "__map_tile_list": "[]",
  "site.token": "keep",
});

describe("the shortlist key and the privacy panel's scope", () => {
  it("is registered as covered by the panel, and so is in the live scope", () => {
    expect(STORAGE_REGISTER.find((r) => r.key === SHORTLIST_KEY)).toMatchObject({ reach: "panel", gated: false });
    expect(deps.extraKeys).toContain(SHORTLIST_KEY);
    expect(SHORTLIST_KEY.startsWith(deps.prefix)).toBe(false);
  });
  it("is not listed among the things Erase leaves alone", () => {
    expect(JSON.stringify(deps.outside)).not.toContain(SHORTLIST_KEY);
  });
});

describe("Download includes the shortlist", () => {
  it("writes the list into the file with the other panel data, and not the tile list or other sites' keys", () => {
    const file = exportLocalData(createMemoryStorage(seed()), scope, NOW, "en");
    const body = JSON.parse(file.text) as { items: Record<string, string> };
    expect(Object.keys(body.items)).toContain(SHORTLIST_KEY);
    expect(Object.keys(body.items)).not.toContain("__map_tile_list");
    expect(Object.keys(body.items)).not.toContain("site.token");
    expect(parseShortlist(body.items[SHORTLIST_KEY])).toEqual(LIST);
  });
  it("writes nothing for the list when the person has none", () => {
    const s = createMemoryStorage({ "access.language": "fr" });
    const body = JSON.parse(exportLocalData(s, scope, NOW, "en").text) as { items: Record<string, string> };
    expect(Object.keys(body.items)).not.toContain(SHORTLIST_KEY);
  });
});

describe("Erase removes the shortlist", () => {
  it("removes the stored list, counts it, and leaves what is outside the scope", () => {
    const s = createMemoryStorage(seed());
    const result = eraseLocalData(s, scope);
    expect(result.failed).toEqual([]);
    expect(result.removed).toBe(3);
    expect(s.getItem(SHORTLIST_KEY)).toBeNull();
    expect(s.getItem("__map_tile_list")).toBe("[]");
    expect(s.getItem("site.token")).toBe("keep");
  });
  it("leaves the page reading an empty list, not an error", () => {
    const s = createMemoryStorage(seed());
    eraseLocalData(s, scope);
    expect(loadShortlist(s)).toEqual({ list: [], ok: true });
  });
  it("reports a failed removal instead of claiming the list is gone", () => {
    const base = createMemoryStorage(seed());
    const stubborn = { ...base, getItem: (k: string) => base.getItem(k), setItem: (k: string, v: string) => base.setItem(k, v), removeItem: (k: string) => { if (k !== SHORTLIST_KEY) base.removeItem(k); } };
    const result = eraseLocalData(stubborn as typeof base, scope);
    expect(result.failed).toEqual([SHORTLIST_KEY]);
    expect(base.getItem(SHORTLIST_KEY)).not.toBeNull();
  });
  it("does nothing to the list when the scope has only the prefix", () => {
    const s = createMemoryStorage(seed());
    eraseLocalData(s, deps.prefix);
    expect(s.getItem(SHORTLIST_KEY)).toBe(stored());
  });
  it("works through the controller the live panel builds", () => {
    const storage = createMemoryStorage(seed());
    const c = createPrivacyController({ storage, inventory: FIXTURE, now: () => NOW, prefix: deps.prefix, extraKeys: deps.extraKeys });
    c.dispatch({ type: "export" });
    expect(c.getState().lastExport?.count).toBe(3);
    c.dispatch({ type: "erase-ask" });
    c.dispatch({ type: "erase-confirm" });
    expect(storage.getItem(SHORTLIST_KEY)).toBeNull();
    expect(storage.getItem("site.token")).toBe("keep");
  });
});

describe("Restore puts the shortlist back", () => {
  const fileOf = (items: Record<string, string>) => JSON.stringify({ format: "app-local-data", version: 1, prefix: deps.prefix, items });
  it("accepts the shortlist key from a downloaded file and restores the same list", () => {
    const file = exportLocalData(createMemoryStorage(seed()), scope, NOW, "en").text;
    const fresh = createMemoryStorage();
    const r = prepareImport(file, fresh, scope);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.additions).toContain(SHORTLIST_KEY);
    expect(applyImport(fresh, r.plan).written).toBe(3);
    expect(loadShortlist(fresh).list).toEqual(LIST);
  });
  it("plans an overwrite when a list is already there", () => {
    const current = saveAndGet([{ id: "other", addedOn: "2026-11-05" }]);
    const r = prepareImport(fileOf({ [SHORTLIST_KEY]: stored() }), current, scope);
    expect(r.ok && r.plan.overwrites).toEqual([SHORTLIST_KEY]);
    if (r.ok) applyImport(current, r.plan);
    expect(loadShortlist(current).list).toEqual(LIST);
  });
  it("rejects the shortlist key when the scope is only the prefix, naming it", () => {
    expect(prepareImport(fileOf({ [SHORTLIST_KEY]: stored() }), null, deps.prefix)).toEqual({ ok: false, code: "bad-key", detail: SHORTLIST_KEY });
  });
  it("keeps the page safe when a restored list is damaged: it reads as empty, never as a crash", () => {
    const bad = ["not json", "{}", '[{"id":"a b","addedOn":"2026-11-01"}]', "[1,2,3]", "null"];
    for (const value of bad) {
      const s = createMemoryStorage();
      const r = prepareImport(fileOf({ [SHORTLIST_KEY]: value }), s, scope);
      if (r.ok) applyImport(s, r.plan);
      expect(loadShortlist(s).list, value).toEqual([]);
    }
  });
  it("cannot restore more places than the list allows", () => {
    const many = Array.from({ length: MAX_SHORTLIST + 8 }, (_, i) => ({ id: `p${i}`, addedOn: "2026-11-01" }));
    const s = createMemoryStorage();
    const r = prepareImport(fileOf({ [SHORTLIST_KEY]: JSON.stringify(many) }), s, scope);
    if (r.ok) applyImport(s, r.plan);
    expect(loadShortlist(s).list.length).toBeLessThanOrEqual(MAX_SHORTLIST);
  });
  it("lets the person add to a restored list and keeps the day each place was added", () => {
    const s = createMemoryStorage();
    const r = prepareImport(fileOf({ [SHORTLIST_KEY]: stored() }), s, scope);
    if (r.ok) applyImport(s, r.plan);
    const added = addToShortlist(loadShortlist(s).list, "osm:way/3", "2026-11-19");
    expect(added.result).toBe("added");
    expect(saveShortlist(s, added.list)).toBe(true);
    expect(loadShortlist(s).list.map((e) => [e.id, e.addedOn])).toEqual([
      ["osm:way/1", "2026-11-01"],
      ["osm:way/2", "2026-11-02"],
      ["osm:way/3", "2026-11-19"],
    ]);
  });
});

function saveAndGet(list: ShortlistEntry[]) {
  const s = createMemoryStorage();
  saveShortlist(s, list);
  return s;
}

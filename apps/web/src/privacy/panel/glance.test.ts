import { describe, expect, it } from "vitest";
import { ADDRESS_REGISTER, CALL_REGISTER, type CallRow } from "./addressRegister";
import { DEVICE_REGISTER, type DeviceRow } from "./deviceRegister";
import { FEATURE_REGISTER, type FeatureRow } from "./featureRegister";
import { glanceFigures, glanceUnknowns, type GlanceFigure } from "./glance";
import { STORAGE_REGISTER, UNSCANNED, type RegisterRow } from "./storageRegister";

const b = { en: "x", fr: "y" };
const reg = (over: Partial<RegisterRow> = {}): RegisterRow => ({ key: "k", path: "p", holds: b, gated: false, reach: "panel", source: "s", recordedOn: "2026-11-20", ...over });
const dev = (kind: DeviceRow["kind"]): DeviceRow => ({ kind, name: "n", match: "exact", path: "p", holds: b, source: "s", recordedOn: "2026-11-20" });
const feat = (over: Partial<FeatureRow> = {}): FeatureRow => ({ id: "geolocation", used: true, path: "p", holds: b, asks: "no", source: "s", recordedOn: "2026-11-20", ...over });
const byId = (f: readonly GlanceFigure[]) => Object.fromEntries(f.map((x) => [x.id, x.count]));

describe("glanceFigures", () => {
  it("gives no figure for a source that was not given", () => {
    expect(glanceFigures({})).toEqual([]);
    expect(glanceFigures({ device: [] }).map((f) => f.group)).toEqual(["device", "device"]);
  });
  it("counts the saved items, the ones saved after a yes, the ones the panel cannot reach and the unread places", () => {
    const f = glanceFigures({ kept: { register: [reg(), reg({ gated: true }), reg({ gated: true, reach: "elsewhere" })], unscanned: [UNSCANNED[0]!] } });
    expect(byId(f)).toEqual({ kept: 3, "kept-asked": 2, "kept-outside": 1, "kept-unread": 1 });
  });
  it("marks only the unread places as unknown", () => {
    const f = glanceFigures({ kept: { register: [reg()], unscanned: [] } });
    expect(f.filter((x) => x.unknown).map((x) => x.id)).toEqual(["kept-unread"]);
  });
  it("counts caches and databases apart", () => {
    expect(byId(glanceFigures({ device: [dev("cache"), dev("cache"), dev("database")] }))).toEqual({ caches: 2, databases: 1 });
  });
  it("counts used and unused features, the ones the browser asks about and the ones not confirmed", () => {
    const f = glanceFigures({ features: [feat({ asks: "yes" }), feat({ asks: "UNKNOWN" }), feat({ asks: "no" }), feat({ used: false, asks: "yes", path: null }), feat({ used: false, asks: "UNKNOWN", path: null })] });
    expect(byId(f)).toEqual({ "features-used": 3, "features-asked": 1, "features-unconfirmed": 1, "features-unused": 2 });
  });
  it("counts an unconfirmed answer only for a feature the App uses", () => {
    expect(byId(glanceFigures({ features: [feat({ used: false, asks: "UNKNOWN", path: null })] }))["features-unconfirmed"]).toBe(0);
  });
  it("counts pages, names, request places and the ones with an unknown destination", () => {
    const calls: CallRow[] = [{ path: "a", calls: 1, destination: "UNKNOWN", holds: b, source: "s", recordedOn: "2026-11-20" }, { path: "b", calls: 3, destination: "same-site", holds: b, source: "s", recordedOn: "2026-11-20" }];
    const f = glanceFigures({ addresses: { addresses: [{ host: "a-site.org", kind: "link", path: "p", holds: b, source: "s", recordedOn: "2026-11-20" }, { host: "b-site.org", kind: "identifier", path: "p", holds: b, source: "s", recordedOn: "2026-11-20" }], calls } });
    expect(byId(f)).toEqual({ pages: 1, names: 1, "request-places": 2, "request-unknown": 1 });
  });
  it("counts places that make requests, not the number of requests", () => {
    const f = glanceFigures({ addresses: { addresses: [], calls: CALL_REGISTER } });
    expect(byId(f)["request-places"]).toBe(CALL_REGISTER.length);
  });
  it("returns the groups in a fixed order", () => {
    const f = glanceFigures({ addresses: { addresses: [], calls: [] }, features: [], device: [], kept: { register: [], unscanned: [] } });
    expect([...new Set(f.map((x) => x.group))]).toEqual(["kept", "device", "features", "addresses"]);
  });
  it("agrees with the real registers", () => {
    const f = byId(glanceFigures({ kept: { register: STORAGE_REGISTER, unscanned: UNSCANNED }, device: DEVICE_REGISTER, features: FEATURE_REGISTER, addresses: { addresses: ADDRESS_REGISTER, calls: CALL_REGISTER } }));
    expect(f.kept).toBe(STORAGE_REGISTER.length);
    expect(f["kept-unread"]).toBe(UNSCANNED.length);
    expect(f.caches! + f.databases!).toBe(DEVICE_REGISTER.length);
    expect(f["features-used"]! + f["features-unused"]!).toBe(FEATURE_REGISTER.length);
    expect(f.pages! + f.names!).toBe(ADDRESS_REGISTER.length);
  });
});

describe("glanceUnknowns", () => {
  it("adds up only the unknown figures that count something", () => {
    const f: GlanceFigure[] = [
      { id: "kept", group: "kept", count: 9, unknown: false },
      { id: "kept-unread", group: "kept", count: 2, unknown: true },
      { id: "features-unconfirmed", group: "features", count: 0, unknown: true },
      { id: "request-unknown", group: "addresses", count: 1, unknown: true },
    ];
    expect(glanceUnknowns(f)).toEqual({ figures: 2, things: 3 });
  });
  it("is zero for no figures", () => {
    expect(glanceUnknowns([])).toEqual({ figures: 0, things: 0 });
  });
});

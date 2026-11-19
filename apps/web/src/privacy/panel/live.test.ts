import { describe, expect, it } from "vitest";
import { consentKey, saveConsent, setConsent, type ConsentState } from "./consent";
import { LIVE_PURPOSES, LIVE_RULES, PRIVACY_STORAGE_PREFIX, ROUTE_REPORTS_PURPOSE, ROUTE_REPORTS_STORAGE_KEY, assertLiveRules, liveStorage, saveGated } from "./live";
import { validatePurposes } from "./consent";
import { createMemoryStorage } from "./storage";

const NOW = new Date(2026, 10, 19, 9, 0, 0);
const decide = (value: "granted" | "declined"): ConsentState => setConsent({}, ROUTE_REPORTS_PURPOSE, value, NOW);

describe("live rules", () => {
  it("are consistent and use the App's prefix", () => {
    expect(() => assertLiveRules()).not.toThrow();
    expect(validatePurposes(LIVE_PURPOSES)).toEqual([]);
    expect(ROUTE_REPORTS_STORAGE_KEY.startsWith(PRIVACY_STORAGE_PREFIX)).toBe(true);
    expect(LIVE_RULES).toEqual([{ purposeId: "route-reports", key: "access.routeReports.v1" }]);
  });
  it("throw on a bad rule list", () => {
    expect(() => assertLiveRules([{ purposeId: "nope", key: "k" }])).toThrow(/unknown-purpose/);
  });
  it("keep the consent record out of the gated keys", () => {
    expect(consentKey(PRIVACY_STORAGE_PREFIX)).not.toBe(ROUTE_REPORTS_STORAGE_KEY);
  });
});

describe("liveStorage and saveGated", () => {
  it("is null when the browser blocks storage", () => {
    expect(liveStorage(null)).toBeNull();
    expect(saveGated(null, ROUTE_REPORTS_STORAGE_KEY, "[]")).toBe("no-storage");
  });
  it("saves nothing until the person agrees, and says so", () => {
    const base = createMemoryStorage();
    const gate = liveStorage(base);
    expect(saveGated(gate, ROUTE_REPORTS_STORAGE_KEY, "[1]")).toBe("needs-choice");
    expect(base.getItem(ROUTE_REPORTS_STORAGE_KEY)).toBeNull();
  });
  it("saves once the choice is stored, without being rebuilt", () => {
    const base = createMemoryStorage();
    const gate = liveStorage(base);
    expect(saveGated(gate, ROUTE_REPORTS_STORAGE_KEY, "[1]")).toBe("needs-choice");
    expect(saveConsent(base, PRIVACY_STORAGE_PREFIX, decide("granted"))).toBe(true);
    expect(saveGated(gate, ROUTE_REPORTS_STORAGE_KEY, "[1,2]")).toBe("saved");
    expect(base.getItem(ROUTE_REPORTS_STORAGE_KEY)).toBe("[1,2]");
  });
  it("reports a no as declined and withholds the write", () => {
    const base = createMemoryStorage();
    saveConsent(base, PRIVACY_STORAGE_PREFIX, decide("declined"));
    const gate = liveStorage(base);
    expect(saveGated(gate, ROUTE_REPORTS_STORAGE_KEY, "[1]")).toBe("declined");
    expect(base.getItem(ROUTE_REPORTS_STORAGE_KEY)).toBeNull();
  });
  it("lets other keys through and always lets a person read", () => {
    const base = createMemoryStorage({ [ROUTE_REPORTS_STORAGE_KEY]: "[9]" });
    const gate = liveStorage(base);
    expect(saveGated(gate, "access.language", "fr")).toBe("saved");
    expect(gate?.getItem(ROUTE_REPORTS_STORAGE_KEY)).toBe("[9]");
  });
});

import { describe, expect, it } from "vitest";
import {
  assertValidPurposes,
  clearConsent,
  consentKey,
  consentStatus,
  isAllowed,
  loadConsent,
  saveConsent,
  setConsent,
  validatePurposes,
  type ConsentState,
  type Purpose,
} from "./consent";
import { createMemoryStorage, type StorageLike } from "./storage";

const P: Purpose = {
  id: "saved-places",
  label: { en: "Saved places", fr: "Lieux enregistrés" },
  description: { en: "Remember places on this device", fr: "Garder des lieux sur cet appareil" },
  wordingVersion: 1,
};
const Q: Purpose = { ...P, id: "map-hints", label: { en: "Map hints", fr: "Indices de carte" } };
const NOW = new Date(2026, 10, 15, 9, 0, 0);

describe("consentStatus and isAllowed", () => {
  it("is unknown until the person decides, and unknown is not allowed", () => {
    expect(consentStatus({}, P)).toEqual({ value: "unknown", stale: false });
    expect(isAllowed({}, P)).toBe(false);
  });
  it("is allowed only after an explicit grant", () => {
    const s = setConsent({}, P, "granted", NOW);
    expect(consentStatus(s, P)).toEqual({ value: "granted", decidedOn: "2026-11-15", stale: false });
    expect(isAllowed(s, P)).toBe(true);
  });
  it("a refusal is recorded and is not allowed", () => {
    const s = setConsent({}, P, "declined", NOW);
    expect(consentStatus(s, P).value).toBe("declined");
    expect(isAllowed(s, P)).toBe(false);
  });
  it("goes back to unknown, marked stale, when the wording version changes", () => {
    const s = setConsent({}, P, "granted", NOW);
    const newer: Purpose = { ...P, wordingVersion: 2 };
    expect(consentStatus(s, newer)).toEqual({ value: "unknown", stale: true });
    expect(isAllowed(s, newer)).toBe(false);
  });
  it("choices for different purposes are independent", () => {
    const s = setConsent(setConsent({}, P, "granted", NOW), Q, "declined", NOW);
    expect(isAllowed(s, P)).toBe(true);
    expect(isAllowed(s, Q)).toBe(false);
  });
});

describe("setConsent and clearConsent", () => {
  it("does not change the state it was given", () => {
    const before: ConsentState = {};
    setConsent(before, P, "granted", NOW);
    expect(before).toEqual({});
  });
  it("a later choice replaces the earlier one", () => {
    const s = setConsent(setConsent({}, P, "granted", NOW), P, "declined", NOW);
    expect(consentStatus(s, P).value).toBe("declined");
  });
  it("clearing returns to unknown", () => {
    const s = clearConsent(setConsent({}, P, "granted", NOW), P.id);
    expect(consentStatus(s, P)).toEqual({ value: "unknown", stale: false });
  });
});

describe("validatePurposes", () => {
  it("accepts good purposes", () => {
    expect(validatePurposes([P, Q])).toEqual([]);
    expect(() => assertValidPurposes([P, Q])).not.toThrow();
  });
  it("rejects bad and duplicate ids and bad versions", () => {
    const codes = validatePurposes([
      { ...P, id: "Bad Id" },
      P,
      P,
      { ...Q, wordingVersion: 0 },
      { ...Q, id: "other", wordingVersion: 1.5 },
    ]).map((p) => p.code);
    expect(codes).toEqual(["bad-id", "duplicate-id", "bad-version", "bad-version"]);
  });
  it("requires text in both languages", () => {
    const p = validatePurposes([{ ...P, label: { en: "x", fr: "" }, description: { en: " ", fr: "y" } }]);
    expect(p.map((x) => x.field)).toEqual(["label.fr", "description.en"]);
  });
  it("applies the wording lint, so an overclaim cannot be shipped", () => {
    const p = validatePurposes([{ ...P, description: { en: "Verified in real time", fr: "Pour l'App" } }]);
    expect(p.every((x) => x.code === "copy-lint")).toBe(true);
    expect(p.map((x) => x.field)).toEqual(["description.en", "description.en", "description.fr"]);
  });
  it("assertValidPurposes names the problem", () => {
    expect(() => assertValidPurposes([{ ...P, id: "NO" }])).toThrow(/Invalid consent purposes[\s\S]*bad-id/);
  });
});

describe("loadConsent and saveConsent", () => {
  it("round-trips", () => {
    const s = createMemoryStorage();
    const state = setConsent({}, P, "granted", NOW);
    expect(saveConsent(s, "app.", state)).toBe(true);
    expect(s.getItem(consentKey("app."))).toContain('"records"');
    expect(loadConsent(s, "app.", [P, Q])).toEqual(state);
  });
  it("returns nothing when nothing is stored or storage is missing", () => {
    expect(loadConsent(createMemoryStorage(), "app.", [P])).toEqual({});
    expect(loadConsent(null, "app.", [P])).toEqual({});
    expect(saveConsent(null, "app.", {})).toBe(false);
  });
  it.each(["not json", "null", "[]", '{"records":null}', '{"records":[]}', "{}"])(
    "ignores unreadable stored value %s",
    (raw) => {
      expect(loadConsent(createMemoryStorage({ [consentKey("app.")]: raw }), "app.", [P])).toEqual({});
    },
  );
  it("drops records for purposes that no longer exist and records that are malformed", () => {
    const raw = JSON.stringify({
      records: {
        "saved-places": { value: "granted", decidedOn: "2026-11-15", wordingVersion: 1 },
        gone: { value: "granted", decidedOn: "2026-11-15", wordingVersion: 1 },
        "map-hints": { value: "maybe", decidedOn: "2026-11-15", wordingVersion: 1 },
      },
    });
    const state = loadConsent(createMemoryStorage({ [consentKey("app.")]: raw }), "app.", [P, Q]);
    expect(Object.keys(state)).toEqual(["saved-places"]);
  });
  it.each([
    { value: "granted", decidedOn: "yesterday", wordingVersion: 1 },
    { value: "granted", decidedOn: "2026-11-15", wordingVersion: "1" },
    { value: "granted", decidedOn: "2026-11-15", wordingVersion: 1.5 },
    "granted",
    null,
  ])("drops malformed record %j", (rec) => {
    const raw = JSON.stringify({ records: { "saved-places": rec } });
    expect(loadConsent(createMemoryStorage({ [consentKey("app.")]: raw }), "app.", [P])).toEqual({});
  });
  it("reports a failed save", () => {
    const s: StorageLike = {
      length: 0,
      key: () => null,
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => undefined,
    };
    expect(saveConsent(s, "app.", {})).toBe(false);
  });
  it("reports a throwing read as no choices", () => {
    const s: StorageLike = {
      length: 0,
      key: () => null,
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(loadConsent(s, "app.", [P])).toEqual({});
  });
});

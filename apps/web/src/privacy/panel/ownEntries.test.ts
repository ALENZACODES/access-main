import { describe, expect, it } from "vitest";
import { ownEntries } from "./ownEntries";
import { RESERVED_ID_PREFIX, isValidKeyPattern, validateInventory, type InventoryEntry } from "./inventory";
import { FIXTURE } from "./fixtures.test-util";

const ALL = { consent: true, activity: true, changes: true };

describe("ownEntries", () => {
  it("lists only what the switched-on features store", () => {
    expect(ownEntries({ consent: false, activity: false, changes: false }).map((e) => e.id)).toEqual(["privacy-language"]);
    expect(ownEntries({ consent: true, activity: false, changes: false }).map((e) => e.id)).toEqual([
      "privacy-language",
      "privacy-consent",
    ]);
    expect(ownEntries(ALL).map((e) => e.id)).toEqual([
      "privacy-language",
      "privacy-consent",
      "privacy-activity",
      "privacy-seen",
    ]);
  });
  it("passes the inventory rules, including the wording lint in both languages", () => {
    expect(validateInventory(ownEntries(ALL), { allowReservedIds: true })).toEqual([]);
  });
  it("uses the reserved id prefix and names a storage key for every entry", () => {
    for (const e of ownEntries(ALL)) {
      expect(e.id.startsWith(RESERVED_ID_PREFIX)).toBe(true);
      expect(e.storageKeys?.length).toBeGreaterThan(0);
      expect(e.where).toBe("on-device");
    }
  });
  it("states the retention that the code really applies", () => {
    const byId = Object.fromEntries(ownEntries(ALL).map((e) => [e.id, e]));
    expect(byId["privacy-activity"]?.keptFor?.en).toContain("90 days");
    expect(byId["privacy-activity"]?.keptFor?.fr).toContain("90 jours");
    expect(byId["privacy-seen"]?.keptFor?.en).toContain("365 days");
  });
  it("records a source and a date for each entry", () => {
    for (const e of ownEntries(ALL)) {
      expect(e.source.en).not.toBe("");
      expect(e.recordedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("inventory storage key rules", () => {
  const base = FIXTURE[0] as InventoryEntry;
  const codes = (e: InventoryEntry[], o = {}): string[] => validateInventory(e, o).map((p) => p.code);

  it.each(["prefs.v1", "cache.*", "a", "a:b_c-d.e"])("accepts %s", (k) => {
    expect(isValidKeyPattern(k)).toBe(true);
  });
  it.each(["", "*", "a b", "a*b", "a/b", "a**", "é"])("rejects %j", (k) => {
    expect(isValidKeyPattern(k)).toBe(false);
  });
  it("rejects a bad pattern in an entry", () => {
    expect(codes([{ ...base, storageKeys: ["a b"] }])).toEqual(["bad-storage-key"]);
  });
  it("rejects the same pattern claimed by two entries", () => {
    expect(codes([{ ...base, storageKeys: ["k"] }, { ...base, id: "other", storageKeys: ["k"] }])).toEqual(["duplicate-storage-key"]);
  });
  it("rejects a reserved id from outside, but not for the panel's own entries", () => {
    expect(codes([{ ...base, id: "privacy-x" }])).toEqual(["reserved-id"]);
    expect(codes([{ ...base, id: "privacy-x" }], { allowReservedIds: true })).toEqual([]);
  });
  it("rejects a caller entry that takes a storage name the panel already uses", () => {
    const mine = ownEntries(ALL);
    const clash: InventoryEntry = { ...base, storageKeys: ["prefs.v1"] };
    expect(codes([...mine, clash], { allowReservedIds: true })).toEqual(["duplicate-storage-key"]);
  });
});

describe("the network record entry", () => {
  it("is listed only when the guard's policy is given", () => {
    expect(ownEntries({ consent: false, activity: false, changes: false }).map((e) => e.id)).not.toContain("privacy-egress");
    const e = ownEntries({ consent: false, activity: false, changes: false, egress: true }).find((x) => x.id === "privacy-egress");
    expect(e?.storageKeys).toEqual(["egress.v1"]);
    expect(e?.keptFor?.en).toContain("30 days");
    expect(e?.keptFor?.fr).toContain("30 jours");
  });
});

import { describe, expect, it } from "vitest";
import { FIXTURE } from "./fixtures.test-util";
import {
  assertValidInventory,
  isIsoDate,
  sortInventory,
  summarizeInventory,
  validateInventory,
  type InventoryEntry,
} from "./inventory";

const base = FIXTURE[0] as InventoryEntry;
const withEntry = (patch: Partial<InventoryEntry>): InventoryEntry[] => [{ ...base, ...patch }];

describe("isIsoDate", () => {
  it.each(["2026-11-15", "2024-02-29", "2000-12-31"])("accepts %s", (d) => {
    expect(isIsoDate(d)).toBe(true);
  });
  it.each(["2026-02-30", "2025-02-29", "2026-13-01", "2026-1-1", "15/11/2026", "", "2026-11-15T00:00"])(
    "rejects %s",
    (d) => {
      expect(isIsoDate(d)).toBe(false);
    },
  );
});

describe("validateInventory", () => {
  it("accepts the fixture", () => {
    expect(validateInventory(FIXTURE)).toEqual([]);
    expect(() => assertValidInventory(FIXTURE)).not.toThrow();
  });
  it("rejects bad and duplicate ids", () => {
    expect(validateInventory(withEntry({ id: "Bad Id" })).map((p) => p.code)).toEqual(["bad-id"]);
    const dup = [base, base];
    expect(validateInventory(dup).map((p) => p.code)).toEqual(["duplicate-id"]);
  });
  it("requires a label and a source in both languages", () => {
    const p = validateInventory(withEntry({ label: { en: "x", fr: " " }, source: { en: "", fr: "y" } }));
    expect(p.map((x) => x.field)).toEqual(["label.fr", "source.en"]);
    expect(p.every((x) => x.code === "empty-text")).toBe(true);
  });
  it("does not require purpose or retention: absent means unknown", () => {
    const bare: InventoryEntry = { ...base };
    delete bare.purpose;
    delete bare.keptFor;
    expect(validateInventory([bare])).toEqual([]);
  });
  it("rejects a purpose that is present but blank", () => {
    const p = validateInventory(withEntry({ purpose: { en: "Fine", fr: "" } }));
    expect(p).toEqual([{ id: "saved-places", field: "purpose.fr", code: "empty-text" }]);
  });
  it("rejects an impossible record date and an empty licence", () => {
    const p = validateInventory(withEntry({ recordedOn: "2026-02-31", licence: " " }));
    expect(p.map((x) => x.code).sort()).toEqual(["bad-date", "empty-licence"]);
  });
  it("applies the copy lint per language", () => {
    const p = validateInventory(
      withEntry({ purpose: { en: "Verified by staff", fr: "Pour l'App" } }),
    );
    expect(p.map((x) => x.field)).toEqual(["purpose.en", "purpose.fr"]);
    expect(p.every((x) => x.code === "copy-lint")).toBe(true);
  });
  it("assertValidInventory lists every problem", () => {
    expect(() => assertValidInventory(withEntry({ id: "No", recordedOn: "nope" }))).toThrow(
      /bad-id[\s\S]*bad-date/,
    );
  });
});

describe("sortInventory and summarizeInventory", () => {
  it("sorts by the label in the chosen language without changing the input", () => {
    const copy = [...FIXTURE];
    expect(sortInventory(FIXTURE, "en").map((e) => e.id)).toEqual(["feedback-note", "saved-places", "settings"]);
    expect(sortInventory(FIXTURE, "fr").map((e) => e.id)).toEqual(["feedback-note", "saved-places", "settings"]);
    expect(FIXTURE).toEqual(copy);
  });
  it("French sort ignores accents at base sensitivity", () => {
    const entries: InventoryEntry[] = [
      { ...base, id: "a", label: { en: "A", fr: "Zèbre" } },
      { ...base, id: "b", label: { en: "B", fr: "Zebu" } },
      { ...base, id: "c", label: { en: "C", fr: "Élan" } },
    ];
    expect(sortInventory(entries, "fr").map((e) => e.id)).toEqual(["c", "a", "b"]);
  });
  it("counts missing locations as unknown", () => {
    expect(summarizeInventory(FIXTURE)).toEqual({
      "on-device": 1,
      "sent-to-server": 1,
      unknown: 1,
      total: 3,
    });
    expect(summarizeInventory([])).toEqual({ "on-device": 0, "sent-to-server": 0, unknown: 0, total: 0 });
  });
});

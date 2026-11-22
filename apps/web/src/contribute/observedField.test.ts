import { describe, expect, it } from "vitest";
import { makeDraft, validateDraft, type Change } from "../../../../packages/contribute/src/schema";
import { entryForField, recordField, type FieldEntry } from "./observedField";

const width: FieldEntry = { field: "width", value: "82", unit: "cm", unknown: false };

function applied(changes: Record<string, Change>, entry: FieldEntry, editing: string | null = null) {
  const result = recordField(changes, entry, editing);
  if (!result.ok) throw new Error(result.issue);
  expect(validateDraft({ ...makeDraft(), changes: result.changes })).toBe(true);
  return result.changes;
}

describe("recording an observed field", () => {
  it("normalizes a key and measurement without changing another observation", () => {
    const surface = { value: "brick" };
    const original = { surface };
    const next = applied(original, { ...width, field: "  Width ", unit: " cm " });
    expect(next).toEqual({ surface, width: { value: 82, unit: "cm" } });
    expect(next.surface).toBe(surface);
    expect(original).toEqual({ surface });
  });

  it("updates a named field through the original add-or-update workflow", () => {
    const before = { width: { value: 12, unit: "in" } };
    expect(applied(before, width)).toEqual({ width: { value: 82, unit: "cm" } });
    expect(before.width).toEqual({ value: 12, unit: "in" });
  });

  it.each([
    ["0", 0],
    ["-0.50", -0.5],
    [" 82.00 ", 82],
    ["01", "01"],
    ["1e3", "1e3"],
    ["+15", "+15"],
    ["0x10", "0x10"],
    ["1,75", "1,75"],
    ["9007199254740992", "9007199254740992"],
    ["0.10000000000000001", "0.10000000000000001"],
  ])("preserves the intended representation of %s", (value, expected) => {
    const changes = applied({}, { ...width, value: String(value) });
    expect(changes.width?.value).toBe(expected);
  });

  it("removes a cleared unit when updating and preserves the original typed boolean", () => {
    const old = { value: false, unit: "flag" };
    const form = entryForField("ramp", old);
    expect(form).toEqual({ field: "ramp", value: "false", unit: "flag", unknown: false });
    const next = applied({ ramp: old }, { ...form, unit: " " }, "ramp");
    expect(next.ramp).toEqual({ value: false });
  });

  it("can change a previously known measurement to unknown and back", () => {
    const old = { width: { value: 82, unit: "cm" } };
    const unknown = applied(old, { ...width, unknown: true }, "width");
    expect(unknown.width).toEqual({ value: "UNKNOWN", unit: "cm" });
    const form = entryForField("width", unknown.width!);
    expect(form).toEqual({ field: "width", value: "", unknown: true, unit: "cm" });
    expect(applied(unknown, { ...form, unknown: false, value: "92" }, "width")).toEqual({
      width: { value: 92, unit: "cm" },
    });
  });

  it.each(["", " ", " 001 ", "18", "false"])("preserves the exact imported string %j during a rename", (value) => {
    const change = { value };
    const entry = entryForField("old_key", change);
    const changes = applied({ old_key: change }, { ...entry, field: "new_key" }, "old_key");
    expect(changes.new_key?.value).toBe(value);
  });
});

describe("field validation and recovery", () => {
  it.each(["", " ", "_width", "2doors", "door width", "éclairage", "a".repeat(81)])(
    "returns a correctable field-name error for %j", (field) => {
      expect(recordField({}, { ...width, field }, null)).toEqual({ ok: false, control: "field", issue: "keyFormat" });
    }
  );

  it("uses the same private-name rule as imported drafts, including normalized aliases", () => {
    const result = recordField({}, { ...width, field: " Health_Card " }, null);
    expect(result).toEqual({ ok: false, control: "field", issue: "privateKey" });
    expect(validateDraft({ ...makeDraft(), changes: { health_card: { value: "example" } } })).toBe(false);
    expect(applied({}, { ...width, field: "card_reader" }).card_reader?.value).toBe(82);
  });

  it("rejects an empty new value and accepts an explicit unknown without using the disabled text", () => {
    const entry = { ...width, value: "  " };
    expect(recordField({}, entry, null)).toEqual({ ok: false, control: "value", issue: "emptyValue" });
    expect(applied({}, { ...entry, unknown: true }).width).toEqual({ value: "UNKNOWN", unit: "cm" });
  });

  it("counts Unicode characters the same way as the exported draft schema", () => {
    const value = "🚪".repeat(1000);
    const unit = "📏".repeat(40);
    expect(applied({}, { ...width, unit, value }).width).toEqual({ value, unit });
    expect(recordField({}, { ...width, value: value + "x" }, null)).toEqual({
      ok: false, control: "value", issue: "longValue",
    });
    expect(recordField({}, { ...width, unit: unit + "x" }, null)).toEqual({
      ok: false, control: "unit", issue: "longUnit",
    });
  });

  it("keeps both fields after a rename collision and accepts a subsequent correction", () => {
    const before = { approach: { value: "level" }, width: { value: 72 }, door: { value: "manual" } };
    expect(recordField(before, { ...width, field: "Door" }, "width")).toEqual({
      ok: false, control: "field", issue: "collision",
    });
    const next = applied(before, { ...width, field: "clear_width" }, "width");
    expect(Object.keys(next)).toEqual(["approach", "clear_width", "door"]);
    expect(next.clear_width).toEqual({ value: 82, unit: "cm" });
    expect(before.width).toEqual({ value: 72 });
  });

  it("allows replacement and rename at capacity while rejecting additional fields", () => {
    const before = Object.fromEntries(Array.from({ length: 100 }, (_, i) => ["door_" + i, { value: i }]));
    expect(recordField(before, width, null)).toEqual({ ok: false, control: "field", issue: "capacity" });
    const renamed = applied(before, width, "door_30");
    expect(Object.keys(renamed)).toHaveLength(100);
    expect(renamed.door_30).toBeUndefined();
    expect(renamed.width?.value).toBe(82);
    const corrected = applied(renamed, { ...width, value: "83" });
    expect(corrected.width?.value).toBe(83);
  });
});

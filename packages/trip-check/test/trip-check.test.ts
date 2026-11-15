import { describe, expect, it } from "vitest";
import {
  EXPORT_SCHEMA,
  MemoryStorage,
  PROMPTS,
  STRINGS,
  exportDrafts,
  newDraft,
  tableStorage,
  toContributeDraft,
} from "../src/index";
import type { TripDraft } from "../src/index";

const NOW = new Date("2026-01-15T12:00:00.000Z");
const promptAt = (index: number) => {
  const prompt = PROMPTS[index];
  if (!prompt) throw new Error(`missing prompt ${index}`);
  return prompt;
};

describe("UNKNOWN", () => {
  it("writes UNKNOWN, never no, and stays tier 0 locally", () => {
    const d = newDraft(promptAt(0), "UNKNOWN", { now: NOW });
    expect(d.value).toBe("UNKNOWN");
    expect(d.value).not.toBe("no");
    expect(d.tier).toBe(0);
    expect(d.state).toBe("local");
  });
  it("labels the third button as could-not-check in EN and FR", () => {
    expect(STRINGS.en.unknown).toBe("I could not check");
    expect(STRINGS.fr.unknown).toBe("Je n'ai pas pu v\u00e9rifier");
  });
});

describe("export shape", () => {
  it("exports a JSON Blob at tier 1 with the shared field shape and marks drafts exported", async () => {
    const store = new MemoryStorage();
    await store.put(newDraft(promptAt(0), "yes", { now: NOW, id: "a", place_ref: "node/1" }));
    await store.put(newDraft(promptAt(1), "UNKNOWN", { now: NOW, id: "b" }));
    const res = await exportDrafts(store, NOW);
    expect(res).not.toBeNull();
    expect(res!.blob.type).toBe("application/json");
    expect(res!.filename).toBe("trip-check-2026-01-15.json");
    const parsed = JSON.parse(await res!.blob.text());
    expect(parsed.schema).toBe(EXPORT_SCHEMA);
    expect(parsed.records).toHaveLength(2);
    for (const r of parsed.records) {
      expect(r.tier).toBe(1);
      for (const k of ["value", "source_id", "licence", "retrieved_at", "tier"]) expect(r).toHaveProperty(k);
    }
    expect(parsed.records[1]?.value).toBe("UNKNOWN");
    const text = JSON.stringify(parsed);
    expect(text).not.toMatch(/https?:|token|issue/i);
    expect((await store.list()).every((d) => d.state === "exported")).toBe(true);
    expect(await exportDrafts(store, NOW)).toBeNull();
  });
  it("never assigns tier 2 or 3", async () => {
    const store = new MemoryStorage();
    await store.put(newDraft(promptAt(2), "no", { now: NOW }));
    const res = await exportDrafts(store, NOW);
    expect(res!.file.records.every((r) => r.tier === 1)).toBe(true);
  });
  it("maps to the I9 draft shape", async () => {
    const store = new MemoryStorage();
    await store.put(newDraft(promptAt(3), "yes", { now: NOW, id: "c", place_ref: "way/9" }));
    const res = await exportDrafts(store, NOW);
    const record = res!.file.records[0];
    expect(record).toBeDefined();
    expect(toContributeDraft(record!)).toEqual({
      kind: "trip-check",
      field_id: "door_usable",
      place_ref: "way/9",
      value: "yes",
      source_id: "trip-check-device",
      source_key: "c",
      licence: "CC0",
      retrieved_at: NOW.toISOString(),
      tier: 1,
    });
  });
});

describe("storage adapter", () => {
  it("wraps a Dexie-like table", async () => {
    const rows = new Map<string, TripDraft>();
    const s = tableStorage({
      toArray: async () => [...rows.values()],
      put: async (v) => rows.set(v.id, v),
      delete: async (k) => rows.delete(k),
    });
    await s.put(newDraft(promptAt(0), "no", { now: NOW, id: "x" }));
    expect(await s.list()).toHaveLength(1);
    await s.remove("x");
    expect(await s.list()).toHaveLength(0);
  });
});

describe("catalog and language", () => {
  it("has EN and FR text for every prompt", () => {
    for (const p of PROMPTS) {
      expect(p.text.en.length).toBeGreaterThan(0);
      expect(p.text.fr.length).toBeGreaterThan(0);
    }
    expect(PROMPTS.map((p) => p.field_id)).toContain("elevator_working");
  });
  it("contains no medical, advice, eligibility or model wording", () => {
    const model = /\b(AI|IA|GPT|LLM)\b|Claude|Gemini/;
    const banned =
      /artificial intelligence|intelligence artificielle|spinal|injur|diagnos|medic|m\u00e9dic|therap|th\u00e9rap|symptom|sympt\u00f4m|eligib|admissible|you should|vous devriez|paraly|l\u00e9sion|moelle/i;
    const all = [
      ...PROMPTS.flatMap((p) => [p.text.en, p.text.fr]),
      ...Object.values(STRINGS).flatMap((s) => Object.values(s)),
    ];
    for (const t of all) {
      expect(t).not.toMatch(banned);
      expect(t).not.toMatch(model);
    }
  });
});

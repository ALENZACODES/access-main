import { describe, expect, it } from "vitest";
import { ProposalStore, type LocalStorageLike } from "../src/store";
import { suggestFromEvidence } from "../src/suggest";
import { isUnverifiedDraft } from "../src/validation";
import { withoutUnverifiedDrafts } from "../src/visibility";
import type { PackRecord } from "../src/types";

function memoryStorage(): LocalStorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

function fixture() {
  let nextId = 0;
  return new ProposalStore(
    memoryStorage(),
    () => new Date("2026-11-15T12:00:00.000Z"),
    () => `synthetic-${++nextId}`,
  );
}

const input = {
  target: { kind: "existing" as const, id: "synthetic-place-1" },
  field: "step_free_entry",
  suggestedValue: "UNKNOWN" as const,
  evidence: [
    { kind: "photo" as const, photoId: "synthetic-photo-1" },
    { kind: "note" as const, text: "Synthetic observation." },
  ],
  source: {
    source_id: "synthetic-community-observation",
    licence: "CC0" as const,
    retrieved_at: "2026-11-15T12:00:00.000Z",
  },
};

describe("device-only proposal queue", () => {
  it("starts at tier 0 and cannot export pending drafts", () => {
    const store = fixture();
    const draft = store.create(input);
    expect(draft.tier).toBe(0);
    expect(draft.status).toBe("pending");
    expect(isUnverifiedDraft(draft)).toBe(true);
    expect(store.listPending()).toHaveLength(1);
    expect(store.listExportable()).toEqual([]);
  });

  it("accepts only with a person's note and creates tier 1 output", () => {
    const store = fixture();
    const draft = store.create(input);
    expect(() => store.accept(draft.id, " ")).toThrow();

    const contribution = store.accept(
      draft.id,
      "I checked the original evidence.",
    );

    expect(contribution.record.tier).toBe(1);
    expect(contribution.record.value).toBe("UNKNOWN");
    expect(contribution.record.source_id).toBe(input.source.source_id);
    expect(store.listPending()).toEqual([]);
    expect(store.listExportable()).toEqual([contribution]);
    expect(JSON.parse(store.exportJSON())).toEqual([contribution]);
    expect(() => store.accept(draft.id, "Again")).toThrow();
  });

  it("never exports rejected drafts", () => {
    const store = fixture();
    const rejected = store.create(input);
    const accepted = store.create({
      ...input,
      suggestedValue: true,
    });

    store.reject(rejected.id, "Evidence is insufficient.");
    store.accept(accepted.id, "Personally checked.");

    const exported = store.exportJSON();
    expect(exported).not.toContain(rejected.id);
    expect(exported).not.toContain("Evidence is insufficient.");
    expect(store.listExportable()).toHaveLength(1);
    expect(() => store.accept(rejected.id, "Override")).toThrow();
  });

  it("never accepts drafts without provenance", () => {
    const store = fixture();
    const draft = store.create({
      ...input,
      source: undefined,
    });
    expect(() => store.accept(draft.id, "Checked")).toThrow();
    expect(store.listPending()).toHaveLength(1);
  });

  it("rejects forged tier and invalid storage records", () => {
    expect(
      isUnverifiedDraft({
        ...fixture().create(input),
        tier: 2,
      }),
    ).toBe(false);

    const storage = memoryStorage();
    storage.setItem("access-main:proposals:v1", "not json");
    const store = new ProposalStore(storage);
    expect(() => store.listPending()).toThrow();
  });

  it("keeps local storage independent of the pack", () => {
    const pack: PackRecord = {
      id: "synthetic-place-1",
      facts: {},
    };
    const store = fixture();
    const draft = store.create(input);
    expect(withoutUnverifiedDrafts(pack, [draft]).facts).toEqual({});
    store.accept(draft.id, "Checked evidence.");
    expect(pack.facts).toEqual({});
  });

  it("cannot smuggle a tier 0 fact onto a place page", () => {
    const hostile = {
      id: "synthetic-place-1",
      facts: {
        step_free_entry: {
          value: true,
          source_id: "synthetic",
          licence: "CC0",
          retrieved_at: "2026-11-15T12:00:00.000Z",
          tier: 0,
        },
      },
    } as unknown as PackRecord;

    expect(withoutUnverifiedDrafts(hostile, []).facts).toEqual({});
  });
});

describe("optional evidence suggestions", () => {
  it("keeps uncertain fields UNKNOWN", () => {
    expect(
      suggestFromEvidence({
        field: "step_free_entry",
        observation: true,
        confidence: 0.5,
      }),
    ).toEqual({
      field: "step_free_entry",
      value: "UNKNOWN",
      confidence: 0.5,
    });
  });

  it("does not infer from missing evidence", () => {
    expect(
      suggestFromEvidence({
        field: "step_free_entry",
        confidence: 0.99,
      })?.value,
    ).toBe("UNKNOWN");
    expect(
      suggestFromEvidence({
        field: "step_free_entry",
      }),
    ).toBeUndefined();
  });
});

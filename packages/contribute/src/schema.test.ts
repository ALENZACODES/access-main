import { describe, expect, it } from "vitest";
import { COMMUNITY_TIER, makeDraft, validateDraft } from "./schema";
import { parseImport, toGeoJSON, exportZip } from "./export";

function ready() {
  const draft = makeDraft();
  draft.changes = { entrance_width_cm: { value: "UNKNOWN", unit: "cm" } };
  return draft;
}
describe("offline contributions", () => {
  it("accepts unknown values and fixes unreviewed tier", () => {
    const draft = ready();
    expect(validateDraft(draft)).toBe(true);
    expect(draft.tier).toBe(COMMUNITY_TIER);
    expect(validateDraft({ ...draft, tier: "VERIFIED" })).toBe(false);
    expect(validateDraft({ ...draft, observed: "2026-02-30" })).toBe(false);
  });
  it("refuses sensitive and unexpected keys", () => {
    const draft = ready();
    expect(validateDraft({ ...draft, changes: { health_card: { value: "x" } } })).toBe(false);
    expect(validateDraft({ ...draft, unexpected: "x" })).toBe(false);
    expect(validateDraft({ ...draft, changes: {} })).toBe(false);
  });
  it("imports JSON and GeoJSON without inventing coordinates", () => {
    const draft = ready();
    expect(toGeoJSON([draft]).features[0]?.geometry).toBeNull();
    expect(parseImport(toGeoJSON([draft]))).toEqual([draft]);
    expect(() => parseImport({ type: "FeatureCollection", features: [{ type: "Unknown" }] })).toThrow();
  });
  it("writes a valid local zip with JSON, GeoJSON and no network request", async () => {
    const draft = ready();
    draft.photos = [{ id: "pic", name: "image.jpg", licence: "CC BY 4.0", mime: "image/jpeg" }];
    const blob = await exportZip([draft], async () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(Array.from(bytes.subarray(0, 4))).toEqual([80, 75, 3, 4]);
    expect(new TextDecoder().decode(bytes)).toContain("contributions.geojson");
    expect(new TextDecoder().decode(bytes)).toContain("photos/");
  });
});

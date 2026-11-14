import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateManifest, validateObservedAt, validatePackContent, type PackContent, type PackManifest } from "./pack.ts";

const dir = fileURLToPath(new URL("../../../apps/web/public/packs/toronto/", import.meta.url));
const body = readFileSync(`${dir}content.json`, "utf8");
const manifest = JSON.parse(readFileSync(`${dir}manifest.json`, "utf8")) as PackManifest;
const content = JSON.parse(body) as PackContent;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("Toronto pack files", () => {
  it("manifest size, hash, and counts match the content file", () => {
    expect(validateManifest(manifest)).toEqual([]);
    expect(Buffer.byteLength(body, "utf8")).toBe(manifest.size_bytes);
    expect(createHash("sha256").update(body, "utf8").digest("hex")).toBe(manifest.sha256);
    expect(validatePackContent(content, manifest)).toEqual([]);
    expect(content.places).toHaveLength(manifest.counts.places);
    expect(content.help_numbers).toHaveLength(manifest.counts.help_numbers);
    expect(content.elevator_status).toHaveLength(manifest.counts.elevator_status);
    expect(content.journeys).toEqual([]);
  });

  it("every place has a source, licence, date, and tier, and keeps unknowns as UNKNOWN", () => {
    for (const place of content.places) {
      expect(place.provenance.source_name).toBeTruthy();
      expect(place.provenance.licence).toBe("ODbL-1.0");
      expect(place.provenance.retrieved_at).toBe("2026-11-13");
      expect(place.provenance.tier).toBe(0);
      expect(place.provenance.prototype_label).toBe("SEEDED-OPEN-DATA");
    }
    expect(content.places.some((place) => place.wheelchair === "UNKNOWN")).toBe(true);
    expect(content.places.some((place) => place.address === "UNKNOWN")).toBe(true);
  });

  it("elevator status is a dated tier 4 copy labelled last-checked", () => {
    for (const item of content.elevator_status) {
      expect(item.label).toBe("last-checked");
      expect(item.tier).toBe(4);
      expect(item.checked_at).toBe("2026-11-13T19:48:29.000Z");
      expect(item.licence).toBe("OGL-Toronto-1.0");
    }
    expect(content.elevator_status.map((item) => item.station)).toEqual(["Cedarvale", "Pape", "Finch"]);
  });

  it("help numbers carry the desk-check tier E and both languages", () => {
    expect(content.help_numbers.map((item) => item.contact)).toContain("911");
    for (const item of content.help_numbers) expect(item.provenance.tier).toBe("E");
  });
});

describe("pack checks refuse what the rules forbid", () => {
  it("refuses a count that does not match", () => {
    const changed = clone(content);
    changed.places.pop();
    expect(validatePackContent(changed, manifest)).toContainEqual({ field: "places", code: "count_mismatch" });
  });

  it("refuses a verified place, a blank in place of UNKNOWN, and a missing licence", () => {
    const changed = clone(content);
    changed.places[0]!.provenance = { ...changed.places[0]!.provenance, tier: 3, prototype_label: "VERIFIED" };
    changed.places[1]!.wheelchair = "";
    changed.places[2]!.provenance = { ...changed.places[2]!.provenance, licence: "" };
    const codes = validatePackContent(changed, manifest).map((issue) => `${issue.field}:${issue.code}`);
    expect(codes).toContain("places[0].provenance.tier:verified_not_in_prototype");
    expect(codes).toContain("places[1].wheelchair:blank_not_unknown");
    expect(codes).toContain("places[2].provenance.licence:missing_licence");
  });

  it("refuses elevator status that is not labelled last-checked", () => {
    const changed = clone(content);
    (changed.elevator_status[0] as { label: string }).label = "live";
    expect(validatePackContent(changed, manifest)).toContainEqual({ field: "elevator_status[0].label", code: "must_be_last_checked" });
  });

  it("refuses a health field anywhere in the content", () => {
    const changed = clone(content) as unknown as Record<string, unknown>;
    (changed.places as Array<Record<string, unknown>>)[0]!.diagnosis = "x";
    expect(validatePackContent(changed as unknown as PackContent, manifest).map((issue) => issue.code)).toContain("forbidden_field");
  });

  it("refuses an observation time in the future", () => {
    expect(validateObservedAt("2026-11-14T12:00:00.000Z", "2026-11-14T12:00:30.000Z")).toEqual([]);
    expect(validateObservedAt("2026-11-14T12:10:00.000Z", "2026-11-14T12:00:00.000Z")).toEqual([{ field: "observed_at", code: "in_future" }]);
    expect(validateObservedAt("not a date", "2026-11-14T12:00:00.000Z")).toEqual([{ field: "observed_at", code: "invalid_date" }]);
  });
});

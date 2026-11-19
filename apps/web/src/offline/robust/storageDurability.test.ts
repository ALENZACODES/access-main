import { describe, expect, it, vi } from "vitest";
import {
  createDurabilityController, createDurabilityReport, DURABILITY_COPY,
  jsonDurabilityReport, readStorageDurability, textDurabilityReport,
} from "./storageDurability";
import type { RegionInventory } from "./regionInventory";
import type { RegionManifest } from "./regionDownload";

const source = { source: "Ontario open data", licence: "CC BY 4.0", date: "2026-01-15" };
const manifest: RegionManifest = {
  regionId: "region-a",
  cells: [
    { id: "a", bytes: 10, provenance: source },
    { id: "b", bytes: 20, provenance: source },
  ],
};
const inventory: RegionInventory = {
  regionId: "region-a",
  complete: false,
  savedCount: 1,
  unknownCount: 1,
  expectedBytes: 30,
  savedBytes: 10,
  cells: [
    { id: "a", expectedBytes: 10, state: "saved", cause: "present", provenance: source },
    { id: "b", expectedBytes: 20, state: "unknown", cause: "missing", provenance: source },
  ],
};
const reading = {
  retention: "not-enabled" as const, capacity: "known" as const,
  usedBytes: 50, quotaBytes: 100, freeBytes: 50, canRequest: true, readError: false,
};

describe("browser storage durability", () => {
  it("keeps an absent storage interface UNKNOWN", async () => {
    expect(await readStorageDurability(undefined)).toMatchObject({
      capacity: "UNKNOWN", retention: "UNKNOWN", freeBytes: null, canRequest: false,
    });
  });

  it("reads storage capacity without requesting persistence", async () => {
    const persist = vi.fn(async () => true);
    const result = await readStorageDurability({
      estimate: async () => ({ quota: 100, usage: 40 }),
      persisted: async () => false,
      persist,
    });
    expect(result).toMatchObject({
      retention: "not-enabled", capacity: "known", freeBytes: 60,
      usedBytes: 40, canRequest: true,
    });
    expect(persist).not.toHaveBeenCalled();
  });

  it("rejects negative and inconsistent storage numbers", async () => {
    for (const estimate of [
      { quota: -1, usage: 0 }, { quota: 10, usage: 11 },
      { quota: Number.NaN, usage: 0 }, { quota: 3, usage: 0.5 },
      { quota: Number.MAX_SAFE_INTEGER + 1, usage: 3 }, {},
    ]) {
      expect((await readStorageDurability({ estimate: async () => estimate })).capacity).toBe("UNKNOWN");
    }
  });

  it("retains capacity if the retention query fails", async () => {
    const result = await readStorageDurability({
      estimate: async () => ({ quota: 40, usage: 10 }),
      persisted: async () => { throw new Error("blocked"); },
    });
    expect(result).toMatchObject({ retention: "UNKNOWN", freeBytes: 30, readError: true });
  });

  it("retains known retention if the estimate fails", async () => {
    const result = await readStorageDurability({
      persisted: async () => true,
      estimate: async () => { throw new Error("unavailable"); },
    });
    expect(result).toMatchObject({ retention: "enabled", capacity: "UNKNOWN", readError: true });
  });

  it("does not request retention during inspection", async () => {
    const persist = vi.fn(async () => true);
    const controller = createDurabilityController({ persisted: async () => false, persist });
    await controller.refresh();
    expect(controller.getState().phase).toBe("ready");
    expect(persist).not.toHaveBeenCalled();
  });

  it("requests retention only through the explicit controller method", async () => {
    let accepted = false;
    const persist = vi.fn(async () => { accepted = true; return true; });
    const controller = createDurabilityController({
      persisted: async () => accepted, persist,
    });
    await controller.refresh();
    await controller.request();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toMatchObject({
      outcome: "enabled", phase: "ready", reading: { retention: "enabled" },
    });
  });

  it("does not assert retention following a denied request", async () => {
    const controller = createDurabilityController({
      persist: async () => false, persisted: async () => false,
    });
    await controller.request();
    expect(controller.getState().outcome).toBe("not-enabled");
    expect(controller.getState().reading.retention).toBe("not-enabled");
  });

  it("handles a browser refusal without a false positive", async () => {
    const controller = createDurabilityController({
      persist: async () => { throw new Error("denied"); },
    });
    await controller.request();
    expect(controller.getState().outcome).toBe("error");
    expect(controller.getState().reading.retention).toBe("UNKNOWN");
  });

  it("handles an unavailable persistence request", async () => {
    const controller = createDurabilityController({});
    await controller.request();
    expect(controller.getState().outcome).toBe("unavailable");
  });

  it("serialises concurrent requests", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<boolean>((resolve) => { release = () => { resolve(true); }; });
    const persist = vi.fn(() => gate);
    const controller = createDurabilityController({ persist });
    const first = controller.request();
    const second = controller.request();
    expect(first).toBe(second);
    release?.();
    await first;
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("does not notify subscribers after disposal", async () => {
    let resolveReading: ((value: boolean) => void) | undefined;
    const persisted = new Promise<boolean>((resolve) => { resolveReading = resolve; });
    const callback = vi.fn();
    const controller = createDurabilityController({ persisted: () => persisted });
    controller.subscribe(callback);
    const pending = controller.refresh();
    controller.dispose();
    resolveReading?.(true);
    await pending;
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

describe("device-local storage report", () => {
  it("records source, licence, date and UNKNOWN evidence tier per cell", () => {
    const report = createDurabilityReport(manifest, inventory, reading, "2026-11-19");
    expect(report.cells).toEqual([
      { id: "a", offline: "saved", source: source.source, licence: source.licence,
        date: source.date, expectedBytes: 10, tier: "UNKNOWN" },
      { id: "b", offline: "UNKNOWN", source: source.source, licence: source.licence,
        date: source.date, expectedBytes: 20, tier: "UNKNOWN" },
    ]);
  });

  it("marks all cells UNKNOWN with missing inventory", () => {
    const report = createDurabilityReport(manifest, null, reading, "2026-11-19");
    expect(report.cells.map((cell) => cell.offline)).toEqual(["UNKNOWN", "UNKNOWN"]);
  });

  it("fails closed when inventory belongs to a different region", () => {
    const report = createDurabilityReport(manifest, { ...inventory, regionId: "elsewhere" }, reading, "2026-11-19");
    expect(report.cells.every((cell) => cell.offline === "UNKNOWN")).toBe(true);
  });

  it("fails closed when one listed cell is absent", () => {
    const report = createDurabilityReport(manifest, { ...inventory, cells: inventory.cells.slice(0, 1) }, reading, "2026-11-19");
    expect(report.cells.every((cell) => cell.offline === "UNKNOWN")).toBe(true);
  });

  it("fails closed for an unlisted inventory row", () => {
    const extra = { ...inventory.cells[0]!, id: "outside" };
    const report = createDurabilityReport(manifest, { ...inventory, cells: [inventory.cells[0]!, extra] }, reading, "2026-11-19");
    expect(report.cells.every((cell) => cell.offline === "UNKNOWN")).toBe(true);
  });

  it("fails closed on duplicate manifest IDs", () => {
    const broken = { ...manifest, cells: [manifest.cells[0]!, manifest.cells[0]!] };
    const report = createDurabilityReport(broken, inventory, reading, "2026-11-19");
    expect(report.cells.every((cell) => cell.offline === "UNKNOWN")).toBe(true);
  });

  it("fails closed when provenance differs", () => {
    const changed = { ...inventory, cells: inventory.cells.map((cell) => ({
      ...cell, provenance: { ...cell.provenance, date: "2025-01-01" },
    })) };
    const report = createDurabilityReport(manifest, changed, reading, "2026-11-19");
    expect(report.cells.every((cell) => cell.offline === "UNKNOWN")).toBe(true);
  });

  it("rejects invalid dates", () => {
    expect(() => createDurabilityReport(manifest, inventory, reading, "tomorrow")).toThrow();
  });

  it("exports no pack bytes or device identifiers", () => {
    const report = createDurabilityReport(manifest, inventory, reading, "2026-11-19");
    const json = jsonDurabilityReport(report);
    expect(json).not.toContain("Uint8Array");
    expect(json).not.toContain("base64");
    expect(JSON.parse(json)).toMatchObject({ schema: "offline-storage-durability-v1" });
  });

  it("shows English and French provenance in text reports", () => {
    const report = createDurabilityReport(manifest, inventory, reading, "2026-11-19");
    expect(textDurabilityReport(report, "en")).toContain("Licence: CC BY 4.0");
    expect(textDurabilityReport(report, "fr")).toContain("Licence\u00a0: CC BY 4.0");
    expect(textDurabilityReport(report, "fr")).toContain("UNKNOWN");
  });

  it("neutralises directional overrides and newlines in text exports", () => {
    const malicious = { ...manifest, cells: manifest.cells.map((cell) => ({
      ...cell, provenance: { ...cell.provenance, source: "City\u202e hidden\nnext" },
    })) };
    const report = createDurabilityReport(malicious, null, reading, "2026-11-19");
    const text = textDurabilityReport(report, "en");
    expect(text).not.toContain("\u202e");
    expect(text).toContain("City  hidden next");
  });

  it("provides matching English and French keys", () => {
    expect(Object.keys(DURABILITY_COPY.en)).toEqual(Object.keys(DURABILITY_COPY.fr));
  });

  it("does not claim that retaining storage is permanent", () => {
    expect(DURABILITY_COPY.en.enabled).toContain("still be removed");
    expect(DURABILITY_COPY.fr.enabled).toContain("toujours être supprimées");
  });
});

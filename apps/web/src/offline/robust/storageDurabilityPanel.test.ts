import { describe, expect, it, vi } from "vitest";
import { saveDurabilityReport } from "./storageDurabilityPanel";
import type { DurabilityReport } from "./storageDurability";

const sample: DurabilityReport = {
  schema: "offline-storage-durability-v1",
  region: "central/area", recordedOn: "2026-11-19",
  retention: "UNKNOWN", capacity: "UNKNOWN",
  usedBytes: null, quotaBytes: null, freeBytes: null,
  cells: [{ id: "c1", offline: "UNKNOWN", source: "Open information",
    licence: "CC BY 4.0", date: "2026-01-01", tier: "UNKNOWN", expectedBytes: 5 }],
};

describe("user-triggered storage report export", () => {
  it("downloads a sanitized file name and revokes the temporary URL", () => {
    const click = vi.fn();
    const append = vi.fn();
    const remove = vi.fn();
    const doc = {
      createElement: vi.fn(() => ({ click, remove, hidden: false, href: "", download: "" })),
      body: { append },
    } as unknown as Document;
    const createUrl = vi.fn(() => "blob:local");
    const revokeUrl = vi.fn();
    saveDurabilityReport(sample, "fr", "json", doc, createUrl, revokeUrl);
    expect(click).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(revokeUrl).toHaveBeenCalledWith("blob:local");
    expect(doc.createElement).toHaveBeenCalledWith("a");
    expect((append.mock.calls[0] as unknown[])[0]).toMatchObject({
      download: "offline-storage-central-area.json", hidden: true,
    });
  });

  it("revokes the object URL even when the browser refuses the click", () => {
    const revokeUrl = vi.fn();
    const doc = {
      createElement: () => ({ click: () => { throw new Error("blocked"); }, remove: vi.fn() }),
      body: { append: vi.fn() },
    } as unknown as Document;
    expect(() => saveDurabilityReport(sample, "en", "txt", doc,
      () => "blob:local", revokeUrl)).toThrow("blocked");
    expect(revokeUrl).toHaveBeenCalledWith("blob:local");
  });
});

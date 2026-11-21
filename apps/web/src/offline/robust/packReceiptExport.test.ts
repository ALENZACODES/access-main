import { describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import type { RegionInventory } from "./regionInventory";
import type { RegionManifest } from "./regionDownload";
import {
  createPackReceipt,
  emptyReceiptBook,
  appendPackReceipt,
  type ReceiptCrypto,
} from "./packReceipt";
import {
  receiptBookText,
  receiptComparisonText,
  receiptFilename,
  receiptJson,
  receiptTextBetween,
} from "./packReceiptExport";

const cryptoProvider = webcrypto as unknown as ReceiptCrypto;
const source = { source: "Municipal open data", licence: "CC BY 4.0", date: "2026-10-01" };
const manifest: RegionManifest = {
  regionId: "central",
  cells: [
    { id: "one", bytes: 12, provenance: source },
    { id: "two", bytes: 24, provenance: source },
  ],
};
const local: RegionInventory = {
  regionId: "central",
  cells: [
    { id: "one", expectedBytes: 12, provenance: source, cause: "present", state: "saved" },
    { id: "two", expectedBytes: 24, provenance: source, cause: "missing", state: "unknown" },
  ],
  savedCount: 1,
  unknownCount: 1,
  savedBytes: 12,
  expectedBytes: 36,
  complete: false,
};
const firstTime = "2026-11-21T10:00:00.000Z";
const secondTime = "2026-11-21T10:01:00.000Z";

describe("offline receipt export text", () => {
  it("states that no comparison is available when the book has one reading", () => {
    const text = receiptComparisonText(null, "en");
    expect(text).toContain("Offline pack receipt comparison");
    expect(text).toContain("Status: UNKNOWN");
    expect(text).toContain("No pair of readings");
  });

  it("includes region, timestamps, status and cell provenance in English", async () => {
    const first = await createPackReceipt(manifest, local, firstTime, cryptoProvider);
    const second = await createPackReceipt(manifest, local, secondTime, cryptoProvider);
    const text = receiptTextBetween(first, second, "en");
    expect(text).toContain("Region: central");
    expect(text).toContain(firstTime);
    expect(text).toContain(secondTime);
    expect(text).toContain("Municipal open data");
    expect(text).toContain("CC BY 4.0");
    expect(text).toContain("2026-10-01");
    expect(text).toContain("UNKNOWN");
    expect(text).toContain("historical");
  });

  it("uses French labels and a non-breaking space before every generated colon", async () => {
    const first = await createPackReceipt(manifest, local, firstTime, cryptoProvider);
    const second = await createPackReceipt(manifest, local, secondTime, cryptoProvider);
    const text = receiptTextBetween(first, second, "fr");
    expect(text).toContain("Région\u00a0: central");
    expect(text).toContain("Lecture précédente\u00a0:");
    expect(text).toContain("Lecture suivante\u00a0:");
    expect(text).toContain("Source\u00a0:");
    expect(text).toContain("Licence\u00a0:");
    expect(text).not.toMatch(/ [;:!?]/u);
    expect(text).not.toContain("Inconnu");
  });

  it("keeps the historical and physical-access caveat in both languages", async () => {
    const first = await createPackReceipt(manifest, local, firstTime, cryptoProvider);
    const second = await createPackReceipt(manifest, local, secondTime, cryptoProvider);
    expect(receiptTextBetween(first, second, "en")).toContain("do not establish current storage or physical access");
    expect(receiptTextBetween(first, second, "fr")).toContain("n’établissent ni le stockage actuel ni l’accès physique");
  });

  it("returns a stable filename and sanitizes the region identifier", () => {
    expect(receiptFilename("central", "json")).toBe("offline-pack-receipts-central.json");
    expect(receiptFilename("../private region", "txt")).toBe("offline-pack-receipts-------private-region.txt");
    expect(receiptFilename(" ", "json")).toBe("offline-pack-receipts-region.json");
  });

  it("exports the book JSON through the same schema validator", async () => {
    const captured = await createPackReceipt(manifest, local, firstTime, cryptoProvider);
    const book = appendPackReceipt(emptyReceiptBook("central"), captured);
    const text = receiptJson(book);
    expect(JSON.parse(text)).toMatchObject({
      schema: "offline-pack-receipt-book-v1",
      regionId: "central",
      receipts: [{ digest: captured.digest }],
    });
  });

  it("exports a one-reading text summary without inventing a comparison", async () => {
    const captured = await createPackReceipt(manifest, local, firstTime, cryptoProvider);
    const book = appendPackReceipt(emptyReceiptBook("central"), captured);
    const text = receiptBookText(book, "en");
    expect(text).toContain("UNKNOWN");
    expect(text).toContain("No pair of readings");
  });

  it("keeps payload bytes and device identity out of text output", async () => {
    const first = await createPackReceipt(manifest, local, firstTime, cryptoProvider);
    const second = await createPackReceipt(manifest, local, secondTime, cryptoProvider);
    const text = receiptTextBetween(first, second, "en");
    expect(text).not.toContain("deviceId");
    expect(text).not.toContain("deviceAddress");
    expect(text).not.toContain("payloadBytes");
    expect(text).not.toContain("localStorage");
  });
});

import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { RegionInventory, InventoryCell } from "./regionInventory";
import type { Provenance, RegionManifest } from "./regionDownload";
import {
  appendPackReceipt,
  checkPackReceiptDigest,
  comparePackReceipts,
  createPackReceipt,
  emptyReceiptBook,
  encodeReceiptBook,
  latestReceiptDiff,
  pageReceiptDiff,
  parseReceiptBook,
  receiptCanonicalPayload,
  summarizeReceiptBook,
  validatePackReceipt,
  validateReceiptBook,
  RECEIPT_MAX_BYTES,
  type PackReceipt,
  type ReceiptBook,
  type ReceiptCrypto,
  type ReceiptFilter,
  type ReceiptOrder,
} from "./packReceipt";

const cryptoProvider = webcrypto as unknown as ReceiptCrypto;
const firstSource: Provenance = {
  source: "Municipal open data",
  licence: "CC BY 4.0",
  date: "2026-10-01",
};
const secondSource: Provenance = {
  source: "Regional open data",
  licence: "CC0 1.0",
  date: "2026-10-15",
};
const manifest: RegionManifest = {
  regionId: "north",
  cells: [
    { id: "alpha", bytes: 10, provenance: firstSource },
    { id: "beta", bytes: 20, provenance: firstSource },
    { id: "gamma", bytes: 30, provenance: secondSource },
  ],
};
const early = "2026-11-21T10:00:00.000Z";
const middle = "2026-11-21T10:01:00.000Z";
const late = "2026-11-21T10:02:00.000Z";

function inventoryCell(
  cellId: string,
  cause: InventoryCell["cause"] = "present",
  change: Partial<InventoryCell> = {},
): InventoryCell {
  const listed = manifest.cells.find((cell) => cell.id === cellId);
  if (!listed) throw new Error("Missing receipt fixture cell");
  return {
    id: cellId,
    expectedBytes: listed.bytes,
    provenance: listed.provenance,
    cause,
    state: cause === "present" ? "saved" : "unknown",
    ...change,
  };
}

function inventory(
  cells: readonly InventoryCell[] = [
    inventoryCell("alpha"),
    inventoryCell("beta", "missing"),
    inventoryCell("gamma", "stale"),
  ],
  regionId = "north",
): RegionInventory {
  const saved = cells.filter((cell) => cell.state === "saved");
  return {
    regionId,
    cells,
    savedCount: saved.length,
    unknownCount: cells.length - saved.length,
    savedBytes: saved.reduce((sum, cell) => sum + cell.expectedBytes, 0),
    expectedBytes: cells.reduce((sum, cell) => sum + cell.expectedBytes, 0),
    complete: saved.length === cells.length,
  };
}

async function receipt(
  cells: RegionInventory | null = inventory(),
  at = early,
  sourceManifest: RegionManifest = manifest,
): Promise<PackReceipt> {
  return createPackReceipt(sourceManifest, cells, at, cryptoProvider);
}

function mutateReceipt(value: PackReceipt, patch: Partial<PackReceipt>): PackReceipt {
  return { ...value, ...patch };
}

function sourceBook(): ReceiptBook {
  return emptyReceiptBook("north");
}

describe("offline pack receipt capture", () => {
  it("records a metadata-only snapshot with a SHA-256 digest", async () => {
    const result = await receipt();
    expect(result).toMatchObject({
      schema: "offline-pack-receipt-v1",
      regionId: "north",
      capturedAt: early,
      status: "UNKNOWN",
      savedCount: 1,
      unknownCount: 2,
      totalBytes: 60,
    });
    expect(result.digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.cells.map((cell) => cell.id)).toEqual(["alpha", "beta", "gamma"]);
    expect(result.cells[0]).toMatchObject({ state: "saved", cause: "present", bytes: 10, source: firstSource });
    expect(result.cells[1]).toMatchObject({ state: "UNKNOWN", cause: "missing" });
    expect(result.cells[2]).toMatchObject({ state: "UNKNOWN", cause: "stale" });
    expect(JSON.stringify(result)).not.toContain("deviceId");
    expect(JSON.stringify(result)).not.toContain("storagePath");
    expect(JSON.stringify(result)).not.toContain("payload");
  });

  it("records an all-UNKNOWN snapshot when the inventory cannot be read", async () => {
    const result = await receipt(null);
    expect(result.status).toBe("UNKNOWN");
    expect(result.savedCount).toBe(0);
    expect(result.unknownCount).toBe(3);
    expect(result.cells.every((cell) => cell.state === "UNKNOWN" && cell.cause === "UNKNOWN")).toBe(true);
  });

  it("records all cells as UNKNOWN when the inventory belongs to another region", async () => {
    const result = await receipt(inventory(undefined, "south"));
    expect(result.savedCount).toBe(0);
    expect(result.cells.every((cell) => cell.cause === "UNKNOWN")).toBe(true);
  });

  it("records all cells as UNKNOWN when the inventory is incomplete", async () => {
    const result = await receipt(inventory([inventoryCell("alpha")]));
    expect(result.cells.map((cell) => cell.state)).toEqual(["UNKNOWN", "UNKNOWN", "UNKNOWN"]);
  });

  it("records all cells as UNKNOWN when the inventory contains a duplicate", async () => {
    const duplicate = inventory([inventoryCell("alpha"), inventoryCell("alpha"), inventoryCell("gamma")]);
    const result = await receipt(duplicate);
    expect(result.cells.every((cell) => cell.state === "UNKNOWN")).toBe(true);
  });

  it("keeps an individual cell UNKNOWN when its byte count differs", async () => {
    const rows = [
      inventoryCell("alpha", "present", { expectedBytes: 11 }),
      inventoryCell("beta", "missing"),
      inventoryCell("gamma", "present"),
    ];
    const result = await receipt(inventory(rows));
    expect(result.cells[0]?.cause).toBe("UNKNOWN");
    expect(result.cells[1]?.cause).toBe("missing");
    expect(result.cells[2]?.state).toBe("saved");
  });

  it("keeps an individual cell UNKNOWN when source metadata differs", async () => {
    const rows = [
      inventoryCell("alpha", "present", { provenance: { ...firstSource, source: "Renamed source" } }),
      inventoryCell("beta", "missing"),
      inventoryCell("gamma", "present"),
    ];
    const result = await receipt(inventory(rows));
    expect(result.cells[0]?.state).toBe("UNKNOWN");
    expect(result.cells[0]?.cause).toBe("UNKNOWN");
  });

  it("does not convert an inventory cause of present with an unknown state into saved", async () => {
    const rows = [
      inventoryCell("alpha", "present", { state: "unknown" }),
      inventoryCell("beta", "missing"),
      inventoryCell("gamma", "present"),
    ];
    const result = await receipt(inventory(rows));
    expect(result.cells[0]).toMatchObject({ state: "UNKNOWN", cause: "UNKNOWN" });
  });

  it("does not convert a non-present cause into saved even if the input state says saved", async () => {
    const rows = [
      inventoryCell("alpha", "missing", { state: "saved" }),
      inventoryCell("beta", "missing"),
      inventoryCell("gamma", "present"),
    ];
    const result = await receipt(inventory(rows));
    expect(result.cells[0]).toMatchObject({ state: "UNKNOWN", cause: "missing" });
  });

  it("retains source, licence, date and listed bytes for each receipt cell", async () => {
    const result = await receipt();
    expect(result.cells.map((cell) => [cell.source, cell.bytes])).toEqual([
      [firstSource, 10], [firstSource, 20], [secondSource, 30],
    ]);
  });

  it("rejects an invalid capture timestamp", async () => {
    await expect(receipt(inventory(), "tomorrow")).rejects.toThrow();
    await expect(receipt(inventory(), "2026-02-30T10:00:00.000Z")).rejects.toThrow();
  });

  it("rejects a manifest with duplicate cell IDs", async () => {
    const duplicate = { ...manifest, cells: [manifest.cells[0]!, manifest.cells[0]!] };
    await expect(receipt(inventory(), early, duplicate)).rejects.toThrow();
  });

  it("rejects a manifest with an invalid region identifier", async () => {
    const invalid = { ...manifest, regionId: " " };
    await expect(receipt(inventory(), early, invalid)).rejects.toThrow();
  });

  it("rejects a manifest with a negative or fractional byte count", async () => {
    for (const bytes of [-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      const invalid = { ...manifest, cells: [{ ...manifest.cells[0]!, bytes }] };
      await expect(receipt(inventory(), early, invalid)).rejects.toThrow();
    }
  });

  it("rejects malformed provenance dates and control characters", async () => {
    for (const provenance of [
      { ...firstSource, date: "2026-02-30" },
      { ...firstSource, source: "Open\nsource" },
      { ...firstSource, licence: "" },
    ]) {
      const invalid = { ...manifest, cells: [{ ...manifest.cells[0]!, provenance }] };
      await expect(receipt(inventory(), early, invalid)).rejects.toThrow();
    }
  });

  it("requires Web Crypto SHA-256 and does not silently make an unsigned receipt", async () => {
    await expect(createPackReceipt(manifest, inventory(), early, undefined as never)).resolves.toHaveProperty("digest");
    const unavailable = { subtle: { digest: undefined } } as unknown as ReceiptCrypto;
    await expect(createPackReceipt(manifest, inventory(), early, unavailable)).rejects.toThrow();
  });

  it("produces the same digest for equivalent manifest cell order", async () => {
    const reverse: RegionManifest = { ...manifest, cells: [...manifest.cells].reverse() };
    const one = await receipt();
    const two = await receipt(inventory(), early, reverse);
    expect(one.digest).toBe(two.digest);
  });

  it("changes the digest when a declared source date changes", async () => {
    const changed: RegionManifest = {
      ...manifest,
      cells: manifest.cells.map((cell) => cell.id === "alpha"
        ? { ...cell, provenance: { ...cell.provenance, date: "2026-10-02" } }
        : cell),
    };
    const one = await receipt();
    const two = await receipt(inventory(), early, changed);
    expect(one.digest).not.toBe(two.digest);
  });

  it("changes the digest when the local state changes", async () => {
    const one = await receipt();
    const two = await receipt(inventory([
      inventoryCell("alpha", "present"),
      inventoryCell("beta", "present"),
      inventoryCell("gamma", "stale"),
    ]), middle);
    expect(one.digest).not.toBe(two.digest);
  });

  it("exposes a canonical payload without the digest field", async () => {
    const result = await receipt();
    const canonical = receiptCanonicalPayload(result);
    expect(canonical).toContain('"schema":"offline-pack-receipt-v1"');
    expect(canonical).toContain('"regionId":"north"');
    expect(canonical).not.toContain(result.digest);
    expect(canonical.indexOf('"alpha"')).toBeLessThan(canonical.indexOf('"beta"'));
  });
});

describe("receipt validation and digest checking", () => {
  it("accepts a valid captured receipt", async () => {
    const result = await receipt();
    expect(validatePackReceipt(result)).toEqual(result);
    expect(await checkPackReceiptDigest(result, cryptoProvider)).toBe(true);
  });

  it("rejects an unsupported receipt schema", async () => {
    const result = await receipt();
    expect(() => validatePackReceipt({ ...result, schema: "other" })).toThrow();
  });

  it("rejects a digest with the wrong shape", async () => {
    const result = await receipt();
    for (const digest of ["", "abc", "G".repeat(64), "a".repeat(63)]) {
      expect(() => validatePackReceipt({ ...result, digest })).toThrow();
    }
  });

  it("rejects a duplicate cell identifier", async () => {
    const result = await receipt();
    expect(() => validatePackReceipt({ ...result, cells: [...result.cells, result.cells[0]] })).toThrow();
  });

  it("rejects a contradictory saved state and cause", async () => {
    const result = await receipt();
    const cells = result.cells.map((cell, index) => index === 0 ? { ...cell, cause: "missing" } : cell);
    expect(() => validatePackReceipt({ ...result, cells })).toThrow();
  });

  it("rejects incorrect saved, UNKNOWN and byte totals", async () => {
    const result = await receipt();
    expect(() => validatePackReceipt({ ...result, savedCount: 2 })).toThrow();
    expect(() => validatePackReceipt({ ...result, unknownCount: 1 })).toThrow();
    expect(() => validatePackReceipt({ ...result, totalBytes: 61 })).toThrow();
  });

  it("rejects a recorded status when a cell is UNKNOWN", async () => {
    const result = await receipt();
    expect(() => validatePackReceipt({ ...result, status: "recorded" })).toThrow();
  });

  it("rejects an UNKNOWN status when every cell is saved", async () => {
    const complete = await receipt(inventory([
      inventoryCell("alpha"), inventoryCell("beta"), inventoryCell("gamma"),
    ]));
    expect(() => validatePackReceipt({ ...complete, status: "UNKNOWN" })).toThrow();
  });

  it("rejects an invalid cell date or source name", async () => {
    const result = await receipt();
    const invalidDate = result.cells.map((cell, index) => index === 0
      ? { ...cell, source: { ...cell.source, date: "2026-02-30" } } : cell);
    const invalidSource = result.cells.map((cell, index) => index === 0
      ? { ...cell, source: { ...cell.source, source: "a\nb" } } : cell);
    expect(() => validatePackReceipt({ ...result, cells: invalidDate })).toThrow();
    expect(() => validatePackReceipt({ ...result, cells: invalidSource })).toThrow();
  });

  it("detects a content edit even when the edited receipt remains structurally valid", async () => {
    const result = await receipt();
    const cells = result.cells.map((cell) => cell.id === "alpha" ? { ...cell, bytes: 11 } : cell);
    const changed = { ...result, cells, totalBytes: 61 };
    expect(validatePackReceipt(changed)).toBeTruthy();
    expect(await checkPackReceiptDigest(changed, cryptoProvider)).toBe(false);
  });

  it("detects a state edit with a matching summary but stale digest", async () => {
    const result = await receipt();
    const cells = result.cells.map((cell) => cell.id === "beta"
      ? { ...cell, state: "saved" as const, cause: "present" as const } : cell);
    const changed = { ...result, cells, savedCount: 2, unknownCount: 1 };
    expect(await checkPackReceiptDigest(changed, cryptoProvider)).toBe(false);
  });

  it("does not claim a digest proves who created a receipt", async () => {
    const result = await receipt();
    const copy = { ...result };
    expect(await checkPackReceiptDigest(copy, cryptoProvider)).toBe(true);
    expect(Object.keys(copy)).not.toContain("signature");
    expect(Object.keys(copy)).not.toContain("author");
  });
});

describe("receipt books and import boundaries", () => {
  it("starts with an empty region-scoped book", () => {
    expect(sourceBook()).toEqual({
      schema: "offline-pack-receipt-book-v1",
      regionId: "north",
      receipts: [],
    });
  });

  it("rejects a blank region when creating a book", () => {
    expect(() => emptyReceiptBook(" ")).toThrow();
  });

  it("appends captures in strictly increasing time order", async () => {
    const first = await receipt(inventory(), early);
    const second = await receipt(inventory(), middle);
    const book = appendPackReceipt(appendPackReceipt(sourceBook(), first), second);
    expect(book.receipts.map((item) => item.capturedAt)).toEqual([early, middle]);
  });

  it("rejects a receipt from another region", async () => {
    const other = await receipt(inventory(undefined, "south"), early, { ...manifest, regionId: "south" });
    expect(() => appendPackReceipt(sourceBook(), other)).toThrow();
  });

  it("rejects non-increasing capture times", async () => {
    const first = await receipt(inventory(), early);
    const same = await receipt(inventory(), early);
    const book = appendPackReceipt(sourceBook(), first);
    expect(() => appendPackReceipt(book, same)).toThrow();
  });

  it("rejects duplicate receipt digests", async () => {
    const first = await receipt(inventory(), early);
    const laterReceipt = { ...first, capturedAt: middle };
    const book = appendPackReceipt(sourceBook(), first);
    expect(() => appendPackReceipt(book, laterReceipt)).toThrow();
  });

  it("rejects a history beyond the capture limit", async () => {
    let book = sourceBook();
    for (let index = 0; index < 12; index += 1) {
      const at = new Date(Date.parse(early) + index * 60_000).toISOString();
      const captured = await receipt(inventory(), at);
      book = appendPackReceipt(book, captured);
    }
    const next = await receipt(inventory(), new Date(Date.parse(early) + 12 * 60_000).toISOString());
    expect(() => appendPackReceipt(book, next)).toThrow();
  });

  it("validates every book entry and the strict timestamp order", async () => {
    const one = await receipt(inventory(), early);
    const two = await receipt(inventory(), middle);
    const book = appendPackReceipt(appendPackReceipt(sourceBook(), one), two);
    expect(validateReceiptBook(book)).toEqual(book);
    expect(() => validateReceiptBook({ ...book, receipts: [two, one] })).toThrow();
  });

  it("rejects receipts from different regions inside one book", async () => {
    const one = await receipt();
    const two = await receipt(inventory(undefined, "south"), middle, { ...manifest, regionId: "south" });
    expect(() => validateReceiptBook({ ...sourceBook(), receipts: [one, two] })).toThrow();
  });

  it("round-trips a receipt book through JSON and recomputes every digest", async () => {
    const one = await receipt(inventory(), early);
    const two = await receipt(inventory([
      inventoryCell("alpha"), inventoryCell("beta"), inventoryCell("gamma", "missing"),
    ]), middle);
    const book = appendPackReceipt(appendPackReceipt(sourceBook(), one), two);
    const text = encodeReceiptBook(book);
    const restored = await parseReceiptBook(text, "north", cryptoProvider);
    expect(restored).toEqual(book);
  });

  it("accepts a UTF-8 BOM around a valid import", async () => {
    const one = await receipt();
    const book = appendPackReceipt(sourceBook(), one);
    const restored = await parseReceiptBook("\uFEFF" + encodeReceiptBook(book), "north", cryptoProvider);
    expect(restored).toEqual(book);
  });

  it("rejects malformed JSON and a different region", async () => {
    await expect(parseReceiptBook("{broken", "north", cryptoProvider)).rejects.toThrow();
    const one = await receipt();
    await expect(parseReceiptBook(encodeReceiptBook(appendPackReceipt(sourceBook(), one)), "south", cryptoProvider)).rejects.toThrow();
  });

  it("rejects a receipt import whose digest no longer matches its content", async () => {
    const one = await receipt();
    const book = appendPackReceipt(sourceBook(), one);
    const raw = JSON.parse(encodeReceiptBook(book)) as ReceiptBook;
    const changed = {
      ...raw,
      receipts: raw.receipts.map((item) => ({
        ...item,
        cells: item.cells.map((cell) => cell.id === "alpha" ? { ...cell, bytes: 11 } : cell),
        totalBytes: 61,
      })),
    };
    await expect(parseReceiptBook(JSON.stringify(changed), "north", cryptoProvider)).rejects.toThrow();
  });

  it("rejects a receipt import that exceeds the byte limit", async () => {
    await expect(parseReceiptBook("x".repeat(RECEIPT_MAX_BYTES + 1), "north", cryptoProvider)).rejects.toThrow();
  });

  it("does not include device identity or stored payload in a book export", async () => {
    const one = await receipt();
    const book = appendPackReceipt(sourceBook(), one);
    const text = encodeReceiptBook(book);
    expect(text).not.toContain("deviceId");
    expect(text).not.toContain("storagePath");
    expect(text).not.toContain("payloadBytes");
  });
});

describe("historical receipt comparisons", () => {
  it("compares matching readings as unchanged", async () => {
    const one = await receipt(inventory(), early);
    const two = await receipt(inventory(), middle);
    const diff = comparePackReceipts(one, two);
    expect(diff.counts.unchanged).toBe(3);
    expect(diff.status).toBe("UNKNOWN");
  });

  it("reports a newly saved cell", async () => {
    const one = await receipt(inventory(), early);
    const two = await receipt(inventory([
      inventoryCell("alpha"), inventoryCell("beta"), inventoryCell("gamma", "stale"),
    ]), middle);
    const diff = comparePackReceipts(one, two);
    expect(diff.rows.find((row) => row.id === "beta")?.change).toBe("saved");
  });

  it("reports a previously saved cell as lost only when the later cause is missing or stale", async () => {
    const complete = inventory([
      inventoryCell("alpha"), inventoryCell("beta"), inventoryCell("gamma"),
    ]);
    const one = await receipt(complete, early);
    const missing = await receipt(inventory([
      inventoryCell("alpha"), inventoryCell("beta", "missing"), inventoryCell("gamma"),
    ]), middle);
    const unreadable = await receipt(inventory([
      inventoryCell("alpha"), inventoryCell("beta", "unreadable"), inventoryCell("gamma"),
    ]), late);
    expect(comparePackReceipts(one, missing).rows.find((row) => row.id === "beta")?.change).toBe("lost");
    expect(comparePackReceipts(one, unreadable).rows.find((row) => row.id === "beta")?.change).toBe("UNKNOWN");
  });

  it("reports source and byte changes without conflating them with local storage", async () => {
    const one = await receipt(inventory([
      inventoryCell("alpha"), inventoryCell("beta"), inventoryCell("gamma"),
    ]), early);
    const sourceManifest: RegionManifest = {
      ...manifest,
      cells: manifest.cells.map((cell) => cell.id === "alpha"
        ? { ...cell, provenance: { ...cell.provenance, date: "2026-10-02" } }
        : cell),
    };
    const sourceInventory = inventory([
      inventoryCell("alpha", "present", { provenance: sourceManifest.cells[0]!.provenance }),
      inventoryCell("beta"), inventoryCell("gamma"),
    ]);
    const sourceChange = await receipt(sourceInventory, middle, sourceManifest);
    expect(comparePackReceipts(one, sourceChange).rows.find((row) => row.id === "alpha")?.change).toBe("source-changed");
    const sizeManifest: RegionManifest = {
      ...manifest,
      cells: manifest.cells.map((cell) => cell.id === "alpha" ? { ...cell, bytes: 11 } : cell),
    };
    const sizeChange = await receipt(inventory([
      inventoryCell("alpha", "present", { expectedBytes: 11 }),
      inventoryCell("beta"), inventoryCell("gamma"),
    ]), late, sizeManifest);
    expect(comparePackReceipts(one, sizeChange).rows.find((row) => row.id === "alpha")?.change).toBe("size-changed");
  });

  it("marks an unreadable later reading as UNKNOWN rather than lost", async () => {
    const one = await receipt(inventory([
      inventoryCell("alpha"), inventoryCell("beta"), inventoryCell("gamma"),
    ]), early);
    const two = await receipt(inventory([
      inventoryCell("alpha"), inventoryCell("beta", "unreadable"), inventoryCell("gamma"),
    ]), middle);
    expect(comparePackReceipts(one, two).rows.find((row) => row.id === "beta")?.change).toBe("UNKNOWN");
  });

  it("marks additions and removals when both sides are explicitly known", async () => {
    const beforeManifest: RegionManifest = { ...manifest, cells: manifest.cells.slice(0, 2) };
    const afterManifest: RegionManifest = { ...manifest, cells: [manifest.cells[0]!, manifest.cells[1]!, manifest.cells[2]!] };
    const before = await receipt(inventory([
      inventoryCell("alpha"), inventoryCell("beta"),
    ]), early, beforeManifest);
    const after = await receipt(inventory([
      inventoryCell("alpha"), inventoryCell("beta"), inventoryCell("gamma"),
    ]), middle, afterManifest);
    expect(comparePackReceipts(before, after).rows.find((row) => row.id === "gamma")?.change).toBe("added");
    expect(comparePackReceipts(after, before).rows.find((row) => row.id === "gamma")?.change).toBe("removed");
  });

  it("rejects different regions and reversed capture times", async () => {
    const one = await receipt();
    const laterReceipt = await receipt(inventory(undefined, "south"), middle, { ...manifest, regionId: "south" });
    expect(() => comparePackReceipts(one, laterReceipt)).toThrow();
    const earlier = await receipt(inventory(), early);
    const later = await receipt(inventory(), middle);
    expect(() => comparePackReceipts(later, earlier)).toThrow();
  });

  it("uses UNKNOWN status if either reading has unknown cells", async () => {
    const unknown = await receipt(null, early);
    const complete = await receipt(inventory([
      inventoryCell("alpha"), inventoryCell("beta"), inventoryCell("gamma"),
    ]), middle);
    expect(comparePackReceipts(unknown, complete).status).toBe("UNKNOWN");
  });

  it("does not infer current storage from an imported receipt", async () => {
    const historic = await receipt(inventory([
      inventoryCell("alpha"), inventoryCell("beta"), inventoryCell("gamma"),
    ]), early);
    const book = appendPackReceipt(sourceBook(), historic);
    const restored = await parseReceiptBook(encodeReceiptBook(book), "north", cryptoProvider);
    expect(restored.receipts[0]?.savedCount).toBe(3);
    expect(restored).not.toHaveProperty("currentInventory");
  });
});

describe("receipt pages and summaries", () => {
  async function sampleBook(): Promise<ReceiptBook> {
    const allSaved = inventory([
      inventoryCell("alpha"), inventoryCell("beta"), inventoryCell("gamma"),
    ]);
    const one = await receipt(allSaved, early);
    const two = await receipt(inventory([
      inventoryCell("alpha"),
      inventoryCell("beta"),
      inventoryCell("gamma", "missing"),
    ]), middle);
    return appendPackReceipt(appendPackReceipt(sourceBook(), one), two);
  }

  it("summarizes the latest receipt and latest comparison", async () => {
    const book = await sampleBook();
    const summary = summarizeReceiptBook(book);
    expect(summary).toMatchObject({
      captures: 2,
      saved: 2,
      unknown: 1,
      changed: 1,
      latestAt: middle,
      totalBytes: 60,
    });
  });

  it("returns null for the latest diff when there is only one receipt", async () => {
    const one = await receipt();
    expect(latestReceiptDiff(appendPackReceipt(sourceBook(), one))).toBeNull();
  });

  it("filters by change kind", async () => {
    const book = await sampleBook();
    const diff = latestReceiptDiff(book)!;
    const changed = pageReceiptDiff(diff, {
      search: "", filter: "changed", order: "listed", offset: 0, limit: 20,
    });
    expect(changed.total).toBe(1);
    expect(changed.rows[0]?.change).toBe("lost");
  });

  it("filters UNKNOWN rows", async () => {
    const book = await sampleBook();
    const diff = latestReceiptDiff(book)!;
    const page = pageReceiptDiff(diff, {
      search: "", filter: "UNKNOWN", order: "listed", offset: 0, limit: 20,
    });
    expect(page.rows.every((row) => row.change === "UNKNOWN")).toBe(true);
  });

  it("searches cell IDs and source names", async () => {
    const book = await sampleBook();
    const diff = latestReceiptDiff(book)!;
    const byId = pageReceiptDiff(diff, {
      search: "beta", filter: "all", order: "listed", offset: 0, limit: 20,
    });
    const bySource = pageReceiptDiff(diff, {
      search: "Regional", filter: "all", order: "listed", offset: 0, limit: 20,
    });
    expect(byId.rows.map((row) => row.id)).toEqual(["beta"]);
    expect(bySource.rows.map((row) => row.id)).toEqual(["gamma"]);
  });

  it("sorts by ID, source, change and listed bytes", async () => {
    const book = await sampleBook();
    const diff = latestReceiptDiff(book)!;
    const query = (order: ReceiptOrder) => pageReceiptDiff(diff, {
      search: "", filter: "all", order, offset: 0, limit: 20,
    });
    expect(query("id").rows.map((row) => row.id)).toEqual(["alpha", "beta", "gamma"]);
    expect(query("largest").rows[0]?.id).toBe("gamma");
    expect(query("source").rows[0]?.id).toBe("alpha");
    expect(query("change").rows).toHaveLength(3);
  });

  it("pages results with a bounded page size", async () => {
    const manyManifest: RegionManifest = {
      regionId: "north",
      cells: Array.from({ length: 45 }, (_, index) => ({
        id: "cell-" + String(index).padStart(2, "0"),
        bytes: index + 1,
        provenance: firstSource,
      })),
    };
    const rows: InventoryCell[] = manyManifest.cells.map((cell) => ({
      id: cell.id, expectedBytes: cell.bytes, provenance: cell.provenance, cause: "present", state: "saved",
    }));
    const one = await receipt(inventory(rows), early, manyManifest);
    const two = await receipt(inventory(rows.slice(0, 40).concat(rows.slice(40).map((row) => ({
      ...row, cause: "missing" as const, state: "unknown" as const,
    }))), middle), manyManifest);
    const diff = comparePackReceipts(one, two);
    const firstPage = pageReceiptDiff(diff, {
      search: "", filter: "all", order: "listed", offset: 0, limit: 20,
    });
    const secondPage = pageReceiptDiff(diff, {
      search: "", filter: "all", order: "listed", offset: 20, limit: 20,
    });
    const thirdPage = pageReceiptDiff(diff, {
      search: "", filter: "all", order: "listed", offset: 40, limit: 20,
    });
    expect(firstPage.rows).toHaveLength(20);
    expect(secondPage.rows).toHaveLength(20);
    expect(thirdPage.rows).toHaveLength(5);
    expect(firstPage.next).toBe(true);
    expect(secondPage.previous).toBe(true);
    expect(thirdPage.next).toBe(false);
  });

  it("rejects invalid page size, offset, filter and sort order", async () => {
    const diff = latestReceiptDiff(await sampleBook())!;
    const base = { search: "", filter: "all" as ReceiptFilter, order: "listed" as ReceiptOrder, offset: 0, limit: 20 };
    expect(() => pageReceiptDiff(diff, { ...base, offset: -1 })).toThrow();
    expect(() => pageReceiptDiff(diff, { ...base, limit: 0 })).toThrow();
    expect(() => pageReceiptDiff(diff, { ...base, limit: 21 })).toThrow();
    expect(() => pageReceiptDiff(diff, { ...base, filter: "future" as never })).toThrow();
    expect(() => pageReceiptDiff(diff, { ...base, order: "random" as never })).toThrow();
  });

  it("caps search length without mutating the query", async () => {
    const diff = latestReceiptDiff(await sampleBook())!;
    const search = "x".repeat(1000);
    const page = pageReceiptDiff(diff, {
      search, filter: "all", order: "listed", offset: 0, limit: 20,
    });
    expect(page.total).toBe(0);
    expect(search).toHaveLength(1000);
  });

  it("does not mutate a book while comparing or summarizing it", async () => {
    const book = await sampleBook();
    const before = JSON.stringify(book);
    latestReceiptDiff(book);
    summarizeReceiptBook(book);
    expect(JSON.stringify(book)).toBe(before);
  });
});

describe("receipt model boundaries", () => {
  it("rejects a receipt whose region identifier contains path traversal", async () => {
    const result = await receipt();
    expect(() => validatePackReceipt({ ...result, regionId: "../north" })).toThrow();
  });

  it("rejects unsafe cell IDs", async () => {
    const result = await receipt();
    const cells = result.cells.map((cell, index) => index === 0 ? { ...cell, id: "../private" } : cell);
    expect(() => validatePackReceipt({ ...result, cells })).toThrow();
  });

  it("rejects a malformed receipt root and array root", () => {
    expect(() => validateReceiptBook(null)).toThrow();
    expect(() => validateReceiptBook([])).toThrow();
    expect(() => validateReceiptBook({ schema: "offline-pack-receipt-book-v1", regionId: "north", receipts: {} })).toThrow();
  });

  it("rejects invalid book counts and duplicate digests", async () => {
    const one = await receipt();
    expect(() => validateReceiptBook({ ...sourceBook(), receipts: Array(13).fill(one) })).toThrow();
    expect(() => validateReceiptBook({ ...sourceBook(), receipts: [one, { ...one, capturedAt: middle }] })).toThrow();
  });

  it("preserves the exact source licence and date in every cell", async () => {
    const result = await receipt();
    for (const cell of result.cells) {
      expect(cell.source).toHaveProperty("source");
      expect(cell.source).toHaveProperty("licence");
      expect(cell.source).toHaveProperty("date");
    }
  });

  it("does not add a verification tier that the manifest does not provide", async () => {
    const result = await receipt();
    expect(result.cells[0]).not.toHaveProperty("tier");
    expect(result.cells[0]).not.toHaveProperty("verified");
  });

  it("does not include coordinates or device-specific identifiers", async () => {
    const result = await receipt();
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("latitude");
    expect(serialized).not.toContain("longitude");
    expect(serialized).not.toContain("deviceAddress");
    expect(serialized).not.toContain("deviceId");
  });
});

import { describe, expect, it, vi } from "vitest";
import { valueOf, packetWith } from "./bundleTestSupport";
import { byteCap } from "./formats";
import { inspectMember, BUNDLE_LIMITS } from "./model";
import {
  comparePackingList, encodePackingList, LIST_SCHEMA, MAX_LIST_BYTES,
  readPackingList, type ListEntry,
} from "./packingList";

const file = (data: unknown) => new Blob([JSON.stringify(data)]);
const list = (...entries: unknown[]) => file({ schema: LIST_SCHEMA, entries });

function entry(n: number, overrides: Partial<ListEntry> = {}): ListEntry {
  return { digest: n.toString(16).padStart(64, "0"), kind: "guided", recordCount: 2, byteLength: 600, ...overrides };
}

describe("packing list interchange", () => {
  it("contains just the four handoff fields for each file, including the native row count", async () => {
    const source = new File([JSON.stringify(packetWith("Privé — détail de l’exemple"))], "example-original.json");
    const member = valueOf(await inspectMember(source));
    const text = encodePackingList([member]);
    expect(text).not.toMatch(/Privé|example-original|example-pack|entry-A|CC0|payload|observation/u);
    const result = await readPackingList(new Blob([text]));
    expect(result).toEqual({ ok: true, entries: [{
      digest: member.digest, byteLength: source.size, kind: "packet", recordCount: 2,
    }] });
    if (!result.ok) throw new Error(result.issue);
    expect(comparePackingList(result.entries, [member]).complete).toBe(true);
  });

  it("reproduces identical lists across downloads independent of the chosen file name", async () => {
    const content = JSON.stringify(packetWith("Fichier de test"));
    const a = valueOf(await inspectMember(new File([content], "draft.json")));
    const b = valueOf(await inspectMember(new File([content], "recovery-01-packet.json")));
    expect(encodePackingList([a])).toEqual(encodePackingList([b]));
  });

  it("retains zero counts, ordering, and the maximum permitted number of distinct files", async () => {
    const rows = Array.from({ length: BUNDLE_LIMITS.members }, (_, n) => entry(n, { recordCount: 0 }));
    expect(await readPackingList(list(...rows))).toEqual({ ok: true, entries: rows });
    expect(await readPackingList(list(...rows, entry(20)))).toEqual({ ok: false, issue: "format" });
  });

  it("permits the exact byte boundary including whitespace and an initial byte-order mark", async () => {
    const text = JSON.stringify({ schema: LIST_SCHEMA, entries: [entry(1)] });
    const bom = "\ufeff";
    const base = new Blob([bom, text]);
    const boundary = new Blob([base, " ".repeat(MAX_LIST_BYTES - base.size)]);
    expect(boundary.size).toBe(MAX_LIST_BYTES);
    expect(await readPackingList(boundary)).toEqual({ ok: true, entries: [entry(1)] });
    expect(await readPackingList(new Blob([boundary, " "]))).toEqual({ ok: false, issue: "size" });
  });

  it("does not initiate I/O for oversized files", async () => {
    const oversized = new Blob([new Uint8Array(MAX_LIST_BYTES + 1)]);
    const read = vi.spyOn(oversized, "arrayBuffer");
    expect(await readPackingList(oversized)).toEqual({ ok: false, issue: "size" });
    expect(read).not.toHaveBeenCalled();
  });

  it("distinguishes a failed file read from an invalid document", async () => {
    const inaccessible = list(entry(1));
    vi.spyOn(inaccessible, "arrayBuffer").mockRejectedValue(new Error("I/O"));
    expect(await readPackingList(inaccessible)).toEqual({ ok: false, issue: "read" });
    const truncated = list(entry(2));
    vi.spyOn(truncated, "arrayBuffer").mockResolvedValue(new ArrayBuffer(1));
    expect(await readPackingList(truncated)).toEqual({ ok: false, issue: "read" });
  });

  it("rejects malformed encoding even in a JSON key that might otherwise be replaced", async () => {
    const damaged = new Blob(['{"', Uint8Array.from([0xc3, 0x28]), '":0}']);
    expect(await readPackingList(damaged)).toEqual({ ok: false, issue: "format" });
  });

  it("rejects duplicate identities even when the two slots describe different counts", async () => {
    expect(await readPackingList(list(entry(7), entry(7, { recordCount: 1 }))))
      .toEqual({ ok: false, issue: "duplicate" });
  });

  it.each([
    ["missing format discriminator", { entries: [entry(1)] }],
    ["unsupported revision", { schema: LIST_SCHEMA + ".1", entries: [entry(1)] }],
    ["extension at the root", { schema: LIST_SCHEMA, entries: [entry(1)], file: "x" }],
    ["empty export", { schema: LIST_SCHEMA, entries: [] }],
    ["slot index masquerading as an array", { schema: LIST_SCHEMA, entries: { 0: entry(1) } }],
    ["array root", [entry(1)]],
    ["null root", null],
  ])("rejects %s", async (_, data) => {
    expect(await readPackingList(file(data))).toEqual({ ok: false, issue: "format" });
  });

  it.each([
    ["unknown file kind", { kind: "unregistered" }],
    ["object prototype property as file kind", { kind: "constructor" }],
    ["empty digest", { digest: "" }],
    ["noncanonical uppercase digest", { digest: "A".repeat(64) }],
    ["trailing newline in a digest", { digest: "d".repeat(63) + "\n" }],
    ["digest with a nonhex character", { digest: "d".repeat(63) + "x" }],
    ["zero bytes", { byteLength: 0 }],
    ["fractional byte count", { byteLength: 1.01 }],
    ["size over native limit", { byteLength: byteCap("guided") + 1 }],
    ["negative record count", { recordCount: -1 }],
    ["record count larger than the file", { recordCount: 601 }],
    ["fractional record count", { recordCount: 0.5 }],
    ["string byte count", { byteLength: "600" }],
    ["embedded user text", { note: "private synthetic note" }],
  ])("rejects an entry with %s", async (_, fields) => {
    expect(await readPackingList(list({ ...entry(1), ...(fields as object) })))
      .toEqual({ ok: false, issue: "format" });
  });

  it("rejects an envelope whose cumulative size exceeds the sender's bundle limit", async () => {
    const size = byteCap("packet");
    const count = Math.floor(BUNDLE_LIMITS.totalBytes / size) + 1;
    expect(count).toBeLessThanOrEqual(BUNDLE_LIMITS.members);
    const rows = Array.from({ length: count }, (_, n) => entry(n, { kind: "packet", byteLength: size }));
    expect(await readPackingList(list(...rows))).toEqual({ ok: false, issue: "format" });
  });
});

describe("file identity and position in a handoff", () => {
  const [a, b, c, d] = [entry(1), entry(2), entry(3), entry(4)] as const;
  it("pairs fingerprints even when two files have the same size, type and row counts", () => {
    expect(comparePackingList([a], [b])).toEqual({ complete: false, missing: [1], extra: [1], matched: [] });
  });
  it("retains one-based expected and received positions around a missing file", () => {
    const report = comparePackingList([a, b, c], [b, c]);
    expect(report.complete).toBe(false);
    expect(report.missing).toEqual([1]);
    expect(report.extra).toEqual([]);
    expect(report.matched).toEqual([
      { expectedSlot: 2, receivedSlot: 1, reordered: false, metadataChanges: [] },
      { expectedSlot: 3, receivedSlot: 2, reordered: false, metadataChanges: [] },
    ]);
  });
  it("flags order reversals only among entries that appear in both lists", () => {
    const report = comparePackingList([a, b, c], [d, b, a, c]);
    expect(report.extra).toEqual([1]);
    expect(report.missing).toEqual([]);
    expect(report.matched.map(row => row.reordered)).toEqual([true, true, false]);
  });
  it("reports differences in claimed metadata even when the fingerprints match", () => {
    const report = comparePackingList([a, b], [{ ...a, kind: "brief", byteLength: 123, recordCount: 1 }, b]);
    expect(report.complete).toBe(false);
    expect(report.missing).toEqual([]);
    expect(report.extra).toEqual([]);
    expect(report.matched.map(row => row.metadataChanges)).toEqual([["kind", "byteLength", "recordCount"], []]);
  });
  it("handles file substitution, reordering and an inaccurate count in one shipment", () => {
    const expected = Object.freeze([a, b, c]);
    const received = Object.freeze([c, d, { ...a, recordCount: 0 }]);
    const report = comparePackingList(expected, received);
    expect(report).toEqual({
      complete: false, missing: [2], extra: [2], matched: [
        { expectedSlot: 1, receivedSlot: 3, metadataChanges: ["recordCount"], reordered: true },
        { expectedSlot: 3, receivedSlot: 1, metadataChanges: [], reordered: true },
      ],
    });
    expect(received[0]).toBe(c);
    expect(expected[0]).toBe(a);
  });
});

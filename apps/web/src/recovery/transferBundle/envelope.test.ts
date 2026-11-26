import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyReceiptDocument } from "../recoveryReceiptLedger";
import { emptyPacket, importPacket } from "../recoveryEvidencePacket";
import { byteCap } from "./formats";
import {
  BUNDLE_LIMITS, BUNDLE_SCHEMA, encodeBundle, inspectMember, openBundle,
  type BundleProblemCode,
} from "./model";
import { bundleFile, packetWith, valueOf, wireEntry } from "./bundleTestSupport";

const originalPacket = JSON.stringify(packetWith("État inconnu\u00a0!"));
const packetEntry = wireEntry(originalPacket);
const receiptText = JSON.stringify(emptyReceiptDocument());
const receiptEntry = wireEntry(receiptText, "receipt");

function jsonFile(input: unknown): Blob {
  return new Blob([JSON.stringify(input)]);
}

async function checkProblem(file: Blob, code: BundleProblemCode, slot?: number): Promise<void> {
  const result = await openBundle(file);
  expect(result).toStrictEqual({
    ok: false,
    problem: slot === undefined ? { code } : { code, slot },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("transfer bundle interchange", () => {
  it("opens an independently encoded envelope with a BOM, CRLF and multibyte originals", async () => {
    const native = packetWith("Transfert\u00a0: «\u00a0à revoir\u00a0»");
    const nativeBytes = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(JSON.stringify(native, null, 2).replaceAll("\n", "\r\n") + "\r\n"),
    ]);
    const external = {
      entries: [wireEntry(nativeBytes), receiptEntry],
      schema: BUNDLE_SCHEMA,
    };
    const file = new Blob(["\ufeff", JSON.stringify(external, null, 2)]);
    const [packet, receipt] = valueOf(await openBundle(file));
    expect(packet?.kind).toBe("packet");
    expect(packet?.recordCount).toBe(2);
    expect(receipt?.kind).toBe("receipt");
    expect(receipt?.recordCount).toBe(0);
    if (!packet || !receipt) throw new Error("Expected both files");
    expect(Buffer.from(await packet.file.arrayBuffer())).toEqual(nativeBytes);
    expect(Buffer.from(await receipt.file.arrayBuffer()).toString()).toBe(receiptText);
    const reopened = importPacket(await packet.file.text());
    expect(reopened.ok && reopened.value).toEqual(native);
  });

  it("emits only the envelope fields needed to verify and recover the original", async () => {
    const named = new File([originalPacket], "local-filename.json", {
      lastModified: 9_000_000,
      type: "application/octet-stream",
    });
    const member = valueOf(await inspectMember(named));
    const output = valueOf(encodeBundle([member]));
    expect(output.type).toBe("application/json");
    const text = await output.text();
    expect(JSON.parse(text)).toEqual({ schema: BUNDLE_SCHEMA, entries: [packetEntry] });
    expect(text).not.toContain(named.name);
    expect(text).not.toContain("retrievedOn");
    expect(text).not.toContain("recordCount");
    expect(text).not.toContain("lastModified");
  });

  it("re-exports a selected subset in a new order, preserving independent digests", async () => {
    const third = wireEntry(JSON.stringify(emptyPacket()));
    const members = valueOf(await openBundle(bundleFile(packetEntry, receiptEntry, third)));
    const [original, , empty] = members;
    if (!original || !empty) throw new Error("Expected three files");
    const selected = valueOf(encodeBundle([empty, original]));
    const entries = valueOf(await openBundle(selected));
    expect(entries.map(entry => entry.digest)).toEqual([third.digest, packetEntry.digest]);
    expect(entries.map(entry => entry.recordCount)).toEqual([0, 2]);
    expect(members.map(entry => entry.digest)).toEqual([packetEntry.digest, receiptEntry.digest, third.digest]);
    expect(await entries[1]?.file.text()).toBe(originalPacket);
  });

  it("keeps native optional metadata that the reader does not display", async () => {
    const packet = { ...packetWith("Unchanged"), extension: { revision: 1, flags: [true, false] } };
    const text = JSON.stringify(packet, null, "\t");
    const [member] = valueOf(await openBundle(bundleFile(wireEntry(text))));
    expect(await member?.file.text()).toBe(text);
  });

  it("requires no network calls while reading, validating, or saving the bundle", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetch);
    const members = valueOf(await openBundle(bundleFile(packetEntry, receiptEntry)));
    const restored = valueOf(await openBundle(valueOf(encodeBundle(members))));
    expect(restored.map(entry => entry.digest)).toEqual([packetEntry.digest, receiptEntry.digest]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("outer envelope boundaries", () => {
  it("accepts a document padded with whitespace to the envelope limit", async () => {
    const body = await bundleFile(receiptEntry).text();
    const exact = new Blob([body.padEnd(BUNDLE_LIMITS.envelopeBytes)]);
    expect(exact.size).toBe(BUNDLE_LIMITS.envelopeBytes);
    expect(valueOf(await openBundle(exact))[0]?.digest).toBe(receiptEntry.digest);
  });

  it("declines an oversized input before reading its contents", async () => {
    const file = new Blob([new Uint8Array(BUNDLE_LIMITS.envelopeBytes + 1)]);
    const read = vi.spyOn(file, "arrayBuffer");
    await checkProblem(file, "bundle-size");
    expect(read).not.toHaveBeenCalled();
  });

  it("distinguishes an empty file from ill-formed JSON", async () => {
    await checkProblem(new Blob([]), "empty");
    await checkProblem(new Blob(["   "]), "envelope");
    await checkProblem(new Blob(["{"]), "envelope");
  });

  it("rejects malformed UTF-8 in the envelope before invoking JSON parsing", async () => {
    const file = new Blob(['{"schema":"', Uint8Array.of(0xed, 0xa0, 0x80), '","entries":[]}']);
    await checkProblem(file, "encoding");
  });

  it.each([
    ["an array", []],
    ["null", null],
    ["a primitive", false],
    ["a missing schema", { entries: [receiptEntry] }],
    ["a numeric schema", { schema: 1, entries: [receiptEntry] }],
    ["a missing entries list", { schema: BUNDLE_SCHEMA }],
    ["a non-list entries value", { schema: BUNDLE_SCHEMA, entries: {} }],
    ["an extra metadata field", { entries: [receiptEntry], schema: BUNDLE_SCHEMA, label: "local" }],
  ])("rejects %s at document level", async (_label, input) => {
    await checkProblem(jsonFile(input), "envelope");
  });

  it("returns a version problem for an unsupported envelope schema", async () => {
    await checkProblem(jsonFile({ schema: "the-app.recovery-transfer-bundle.v2", entries: [] }), "version");
    await checkProblem(new Blob([originalPacket]), "version");
  });

  it("requires at least one entry and enforces the count before checking entry bodies", async () => {
    await checkProblem(bundleFile(), "empty");
    await checkProblem(bundleFile(...Array.from({ length: BUNDLE_LIMITS.members + 1 }, () => null)), "member-count");
  });

  it("rejects an aggregate claim above the raw byte cap before decoding the first payload", async () => {
    const quarter = BUNDLE_LIMITS.totalBytes / 4;
    const entries = Array.from({ length: 4 }, (_, i) => ({
      ...packetEntry,
      byteLength: quarter + (i === 3 ? 1 : 0),
      payload: "!",
    }));
    await checkProblem(bundleFile(...entries), "total-size", 4);
  });
});

describe("checking entry declarations", () => {
  it.each([
    ["operator-supplied count", { ...receiptEntry, recordCount: 9 }],
    ["missing digest", { kind: "receipt", byteLength: 1, payload: "YQ==" }],
    ["extra label replacing a required key", { kind: "receipt", byteLength: 1, digest: receiptEntry.digest, label: "" }],
    ["numeric kind", { ...receiptEntry, kind: 3 }],
    ["numeric payload", { ...receiptEntry, payload: 0 }],
    ["digest object", { ...receiptEntry, digest: {} }],
    ["short digest", { ...receiptEntry, digest: receiptEntry.digest.slice(1) }],
    ["uppercase digest", { ...receiptEntry, digest: receiptEntry.digest.toUpperCase() }],
    ["non-hex digest", { ...receiptEntry, digest: "Z".repeat(64) }],
    ["negative byte length", { ...receiptEntry, byteLength: -7 }],
    ["zero byte length", { ...receiptEntry, byteLength: 0 }],
    ["fractional byte length", { ...receiptEntry, byteLength: 1.5 }],
    ["unsafe integer", { ...receiptEntry, byteLength: 2 ** 54 }],
    ["string byte length", { ...receiptEntry, byteLength: String(receiptEntry.byteLength) }],
    ["array entry", []],
    ["null entry", null],
  ])("locates the entry containing %s", async (_label, invalid) => {
    await checkProblem(bundleFile(receiptEntry, invalid), "envelope", 2);
  });

  it("checks the individual file size before base64 decoding", async () => {
    await checkProblem(bundleFile({ ...packetEntry, byteLength: byteCap() + 1, payload: "" }), "member-size", 1);
  });

  it("rejects a valid payload relabelled as a different native format", async () => {
    await checkProblem(bundleFile({ ...packetEntry, kind: "receipt" }), "integrity", 1);
    await checkProblem(bundleFile({ ...receiptEntry, kind: "other" }), "integrity", 1);
  });
});

describe("binding encoded bytes to their native contents", () => {
  it.each([
    ["non-zero trailing bits", "YR==", 1],
    ["non-zero trailing bits for two bytes", "YWJ=", 2],
    ["an invalid character", "????", 3],
    ["URL-safe alphabet", "____", 3],
    ["missing padding", "YQ", 1],
    ["embedded space", "Y Q==", 1],
    ["an unpadded empty string", "", 1],
    ["a data URL", "data:;base64,YQ==", 1],
  ])("refuses %s before any content is considered restorable", async (_label, payload, byteLength) => {
    await checkProblem(bundleFile({ ...receiptEntry, byteLength, payload }), "payload", 1);
  });

  it("checks actual byte length even when the base64 length looks correct", async () => {
    await checkProblem(bundleFile({ ...wireEntry("a"), byteLength: 2 }), "integrity", 1);
  });

  it("does not accept a changed payload with a checksum copied from the old file", async () => {
    const before = wireEntry(JSON.stringify(packetWith("jour A")));
    const after = wireEntry(JSON.stringify(packetWith("jour B")));
    expect(after.byteLength).toBe(before.byteLength);
    expect(after.digest).not.toBe(before.digest);
    await checkProblem(bundleFile({ ...after, digest: before.digest }), "integrity", 1);
  });

  it("rejects malformed UTF-8 even when its declared digest and length are accurate", async () => {
    const bytes = Buffer.concat([Buffer.from(originalPacket), Buffer.from([0xc0, 0xaf])]);
    await checkProblem(bundleFile(receiptEntry, wireEntry(bytes)), "encoding", 2);
  });

  it("requires native validation even when all byte checks pass", async () => {
    const native = packetWith("sample");
    const orphan = { ...native, events: native.events.map(event => ({ ...event, entryId: "absent" })) };
    await checkProblem(bundleFile(wireEntry(JSON.stringify(orphan))), "native-format", 1);
  });

  it("refuses a nested transfer bundle with a correct checksum", async () => {
    const inner = await bundleFile(receiptEntry).text();
    await checkProblem(bundleFile(wireEntry(inner)), "native-format", 1);
  });

  it("returns no partial members when validation fails in the last slot", async () => {
    const good = Array.from({ length: BUNDLE_LIMITS.members - 1 }, (_, i) =>
      wireEntry(JSON.stringify(packetWith(`entry-${i}`))));
    const bad = { ...receiptEntry, digest: "0".repeat(64) };
    await checkProblem(bundleFile(...good, bad), "integrity", 12);
    const retry = valueOf(await openBundle(bundleFile(...good, receiptEntry)));
    expect(retry).toHaveLength(12);
    expect(retry[11]?.digest).toBe(receiptEntry.digest);
  });

  it("locates a duplicate byte stream even if other entries separate the copies", async () => {
    await checkProblem(bundleFile(receiptEntry, packetEntry, receiptEntry), "duplicate", 3);
  });

  it("reports a verification failure at the affected slot if the digest provider disappears", async () => {
    vi.stubGlobal("crypto", undefined);
    await checkProblem(bundleFile(receiptEntry), "crypto", 1);
  });
});

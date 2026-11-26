import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyPacket, importPacket } from "../recoveryEvidencePacket";
import { emptyReceiptDocument } from "../recoveryReceiptLedger";
import { byteCap } from "./formats";
import {
  appendMembers, BUNDLE_LIMITS, BUNDLE_SCHEMA, encodeBundle,
  inspectMember, openBundle, type BundleMember,
} from "./model";
import { packetWith, valueOf, wireEntry } from "./bundleTestSupport";

const emptyText = JSON.stringify(emptyPacket());

async function member(text: string): Promise<BundleMember> {
  return valueOf(await inspectMember(new Blob([text])));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reading an original recovery export", () => {
  it("uses the native document and the original bytes independently of the filename and MIME type", async () => {
    const body = JSON.stringify(packetWith("État du transfert"), null, 2);
    const original = new File([body], "receipt.csv", {
      type: "text/csv",
      lastModified: 1_357_000,
    });
    const result = valueOf(await inspectMember(original));
    expect(result.kind).toBe("packet");
    expect(result.recordCount).toBe(2);
    expect(result.byteLength).toBe(new TextEncoder().encode(body).byteLength);
    expect(result.digest).toBe(wireEntry(body).digest);
    expect(result.file.type).toBe("application/json");
    expect(result.file).not.toHaveProperty("name");
    expect(result.file).not.toHaveProperty("lastModified");
    expect(await result.file.arrayBuffer()).toEqual(await original.arrayBuffer());
  });

  it("preserves the source, licence, date, verification tier and the unknown observation", async () => {
    const native = packetWith("Exemple d’observation");
    const reviewed = await member(JSON.stringify(native));
    const output = importPacket(await reviewed.file.text());
    expect(output.ok).toBe(true);
    if (!output.ok) throw new Error(output.issue);
    expect(output.value.entries[0]?.source).toEqual(native.entries[0]?.source);
    expect(output.value.entries[0]?.observation).toEqual({
      condition: "UNKNOWN",
      note: "Exemple d’observation",
      bytes: null,
      digest: null,
    });
    expect(output.value.events).toEqual(native.events);
  });

  it("accepts a valid empty ledger as one file containing zero records", async () => {
    const ledger = await member(JSON.stringify(emptyReceiptDocument()));
    expect(ledger.kind).toBe("receipt");
    expect(ledger.recordCount).toBe(0);
    expect(ledger.byteLength).toBeGreaterThan(0);
  });

  it("rejects a zero-length file before decoding", async () => {
    const original = new Blob([]);
    const read = vi.spyOn(original, "arrayBuffer");
    expect(await inspectMember(original)).toEqual({ ok: false, problem: { code: "empty" } });
    expect(read).not.toHaveBeenCalled();
  });

  it("rejects malformed UTF-8 even inside a free-text field", async () => {
    const text = JSON.stringify(packetWith("REPLACE"));
    const [left, right] = text.split("REPLACE");
    const corrupt = new Blob([left!, new Uint8Array([0xc3, 0x28]), right!]);
    expect(await inspectMember(corrupt)).toEqual({ ok: false, problem: { code: "encoding" } });
  });

  it("keeps a literal replacement character from correctly encoded original text", async () => {
    const body = JSON.stringify(packetWith("\uFFFD"));
    expect(await (await member(body)).file.text()).toBe(body);
  });

  it("rejects a supported schema if its native record references are invalid", async () => {
    const packet = packetWith("sample");
    const danglingEvent = { ...packet.events[0], entryId: "missing" };
    const invalid = { ...packet, events: [danglingEvent] };
    expect(await inspectMember(new Blob([JSON.stringify(invalid)]))).toEqual({
      ok: false, problem: { code: "native-format" },
    });
  });

  it.each([
    ["invalid JSON", "{"],
    ["plain text", "a written note"],
    ["a primitive", "true"],
    ["an unsupported document", '{"schema":"other","entries":[]}'],
    ["an outer bundle in the native-file picker", JSON.stringify({ schema: BUNDLE_SCHEMA, entries: [] })],
  ])("rejects %s", async (_case, body) => {
    expect(await inspectMember(new Blob([body]))).toEqual({
      ok: false, problem: { code: "native-format" },
    });
  });

  it("refuses a file that cannot be read", async () => {
    const original = new Blob([emptyText]);
    vi.spyOn(original, "arrayBuffer").mockRejectedValue(new Error("unavailable"));
    expect(await inspectMember(original)).toEqual({ ok: false, problem: { code: "read" } });
  });

  it("refuses a truncated read when the browser reported more bytes", async () => {
    const original = new Blob([emptyText]);
    vi.spyOn(original, "arrayBuffer").mockResolvedValue(new ArrayBuffer(1));
    expect(await inspectMember(original)).toEqual({ ok: false, problem: { code: "read" } });
  });

  it("refuses a non-finite advertised size before issuing the read", async () => {
    const original = new Blob([emptyText]);
    Object.defineProperty(original, "size", { value: Number.NaN });
    const read = vi.spyOn(original, "arrayBuffer");
    expect(await inspectMember(original)).toEqual({ ok: false, problem: { code: "read" } });
    expect(read).not.toHaveBeenCalled();
  });

  it("requires an available SHA-256 implementation", async () => {
    vi.stubGlobal("crypto", undefined);
    expect(await inspectMember(new Blob([emptyText]))).toEqual({
      ok: false, problem: { code: "crypto" },
    });
  });

  it("handles the browser rejecting a digest operation", async () => {
    vi.stubGlobal("crypto", { subtle: { digest: vi.fn().mockRejectedValue(new Error("blocked")) } });
    expect(await inspectMember(new Blob([emptyText]))).toEqual({
      ok: false, problem: { code: "crypto" },
    });
  });

  it("applies the global member bound before reading or hashing oversized files", async () => {
    const tooBig = new Blob([new Uint8Array(byteCap() + 1)]);
    const read = vi.spyOn(tooBig, "arrayBuffer");
    expect(await inspectMember(tooBig)).toEqual({ ok: false, problem: { code: "member-size" } });
    expect(read).not.toHaveBeenCalled();
  });

  it("counts UTF-8 bytes, including the BOM, against the native format's smaller cap", async () => {
    const bom = Uint8Array.of(0xef, 0xbb, 0xbf);
    const body = JSON.stringify(packetWith("été"));
    const remaining = byteCap("packet") - new TextEncoder().encode(body).length - bom.length;
    const exact = new Blob([bom, body, " ".repeat(remaining)]);
    const withinLimit = valueOf(await inspectMember(exact));
    expect(withinLimit.byteLength).toBe(byteCap("packet"));
    expect(await withinLimit.file.arrayBuffer()).toEqual(await exact.arrayBuffer());
    expect(await inspectMember(new Blob([exact, " "]))).toEqual({
      ok: false, problem: { code: "member-size" },
    });
  });
});

describe("assembling a local draft", () => {
  it("adds a batch in the user's order, leaving the prior draft intact", async () => {
    const ledger = await member(JSON.stringify(emptyReceiptDocument()));
    const first = await member(JSON.stringify(packetWith("before")));
    const second = await member(JSON.stringify(packetWith("after")));
    const old = valueOf(appendMembers([], [ledger]));
    const result = valueOf(appendMembers(old, [second, first]));
    expect(result.map(entry => entry.digest)).toEqual([ledger.digest, second.digest, first.digest]);
    expect(old).toEqual([ledger]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("reports the position of a duplicate with a different local filename", async () => {
    const first = valueOf(await inspectMember(new File([emptyText], "before.json")));
    const second = valueOf(await inspectMember(new File([emptyText], "copy.json")));
    const old = [first];
    expect(appendMembers(old, [second])).toEqual({ ok: false, problem: { code: "duplicate", slot: 2 } });
    expect(old).toEqual([first]);
  });

  it("discards an entire append when the last file repeats an earlier file in the same batch", async () => {
    const old = [await member(emptyText)];
    const extra = await member(JSON.stringify(packetWith("another observation")));
    expect(appendMembers(old, [extra, extra])).toEqual({
      ok: false, problem: { code: "duplicate", slot: 3 },
    });
    expect(old).toHaveLength(1);
  });

  it("keeps differently formatted originals distinct when their native records match", async () => {
    const compact = await member(emptyText);
    const indented = await member(JSON.stringify(emptyPacket(), null, 2));
    expect(compact.digest).not.toBe(indented.digest);
    expect(compact.recordCount).toBe(indented.recordCount);
    expect(valueOf(appendMembers([], [compact, indented]))).toHaveLength(2);
  });

  it("allows an empty draft but requires a file to write a bundle", () => {
    expect(valueOf(appendMembers([], []))).toEqual([]);
    expect(encodeBundle([])).toEqual({ ok: false, problem: { code: "empty" } });
  });

  it("rejects a forged member that alters the metadata of a valid file", async () => {
    const first = await member(emptyText);
    const forged = { ...first, recordCount: 900 };
    expect(appendMembers([first], [forged])).toEqual({ ok: false, problem: { code: "payload", slot: 2 } });
    expect(encodeBundle([forged])).toEqual({ ok: false, problem: { code: "payload", slot: 1 } });
  });

  it("keeps exactly twelve distinct originals and refuses an additional one", async () => {
    const members = await Promise.all(Array.from({ length: BUNDLE_LIMITS.members }, (_, i) =>
      member(emptyText + " ".repeat(i))));
    const draft = valueOf(appendMembers([], members));
    const saved = valueOf(encodeBundle(draft));
    expect(valueOf(await openBundle(saved))).toHaveLength(BUNDLE_LIMITS.members);
    const extra = await member(JSON.stringify(packetWith("next export")));
    expect(appendMembers(draft, [extra])).toEqual({ ok: false, problem: { code: "member-count" } });
  });

  it("enforces the aggregate raw-byte cap independently of per-file sizes", async () => {
    const quarter = BUNDLE_LIMITS.totalBytes / 4;
    const bodies = Array.from({ length: 4 }, (_, i) =>
      JSON.stringify(packetWith(`copy-${i}`)).padEnd(quarter, " "));
    const members = await Promise.all(bodies.map(member));
    const draft = valueOf(appendMembers([], members));
    const bundle = valueOf(encodeBundle(draft));
    expect(bundle.size).toBeLessThanOrEqual(BUNDLE_LIMITS.envelopeBytes);
    const reopened = valueOf(await openBundle(bundle));
    expect(reopened.map(x => x.digest)).toEqual(members.map(x => x.digest));
    const replacement = await member(bodies[3] + " ");
    expect(appendMembers(members.slice(0, 3), [replacement])).toEqual({
      ok: false, problem: { code: "total-size", slot: 4 },
    });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { packetWith, valueOf } from "../bundleTestSupport";
import { inspectMember, type BundleMember } from "../model";
import {
  createTransferSet, openTransferSet, SET_LIMITS, SET_SCHEMA,
  transferSetMembers, transferSetReceipt, type SetProblemCode, type SetResult,
} from "./model";

function setValueOf<T>(result: SetResult<T>): T {
  if (!result.ok) throw new Error(`Expected success, received ${result.problem.code}`);
  return result.value;
}

async function makeMember(index: number): Promise<BundleMember> {
  return valueOf(await inspectMember(new Blob([JSON.stringify(packetWith(`record-${index}`))])));
}

async function manyMembers(count: number): Promise<BundleMember[]> {
  const result: BundleMember[] = [];
  for (let index = 0; index < count; index++) result.push(await makeMember(index));
  return result;
}

function expectProblem(result: Awaited<ReturnType<typeof openTransferSet>>, code: SetProblemCode): void {
  expect(result).toMatchObject({ ok: false, problem: { code } });
}

afterEach(() => vi.unstubAllGlobals());

describe("multi-part transfer set creation", () => {
  it("refuses an empty selection", async () => {
    expect(await createTransferSet([])).toEqual({ ok: false, problem: { code: "empty" } });
  });

  it("requires at least two ordinary bundles", async () => {
    expect(await createTransferSet([await makeMember(1)])).toEqual({ ok: false, problem: { code: "part-count" } });
  });

  it("splits a selection above the ordinary per-bundle member limit", async () => {
    const members = await manyMembers(13);
    const created = setValueOf(await createTransferSet(members));
    const opened = setValueOf(await openTransferSet(created));
    expect(opened.parts).toHaveLength(2);
    expect(opened.parts[0]?.members).toHaveLength(12);
    expect(opened.parts[1]?.members).toHaveLength(1);
    expect(opened.memberCount).toBe(13);
  });

  it("preserves the input order across all numbered parts", async () => {
    const members = await manyMembers(27);
    const opened = setValueOf(await openTransferSet(setValueOf(await createTransferSet(members))));
    expect(transferSetMembers(opened).map(member => member.digest)).toEqual(members.map(member => member.digest));
    expect(opened.parts.map(part => part.index)).toEqual([1, 2, 3]);
    expect(opened.parts.map(part => part.count)).toEqual([3, 3, 3]);
  });

  it("retains each member's original bytes, including UTF-8 accents and a BOM", async () => {
    const body = JSON.stringify(packetWith("État — transfert"), null, 2);
    const source = new File([Uint8Array.of(0xef, 0xbb, 0xbf), body], "original.json");
    const first = valueOf(await inspectMember(source));
    const second = await makeMember(2);
    const opened = setValueOf(await openTransferSet(setValueOf(await createTransferSet([first, second]))));
    expect(await opened.parts[0]?.members[0]?.file.arrayBuffer()).toEqual(await source.arrayBuffer());
  });

  it("rejects repeated original bytes across different filenames", async () => {
    const body = JSON.stringify(packetWith("same"));
    const first = valueOf(await inspectMember(new File([body], "one.json")));
    const second = valueOf(await inspectMember(new File([body], "two.json")));
    expect(await createTransferSet([first, second])).toEqual({ ok: false, problem: { code: "duplicate", slot: 2 } });
  });

  it("creates an envelope that is distinct from an ordinary bundle", async () => {
    const members = await manyMembers(13);
    const set = setValueOf(await createTransferSet(members));
    const document = JSON.parse(await set.text()) as { schema: string; parts: unknown[] };
    expect(document.schema).toBe(SET_SCHEMA);
    expect(document.parts).toHaveLength(2);
    expect(set.type).toBe("application/json");
    expect(set.size).toBeLessThanOrEqual(SET_LIMITS.envelopeBytes);
  });

  it("returns a receipt with counts and digests but no member notes", async () => {
    const members = await manyMembers(13);
    const opened = setValueOf(await openTransferSet(setValueOf(await createTransferSet(members))));
    const receipt = transferSetReceipt(opened);
    expect(receipt).toContain(opened.setId);
    expect(receipt).toContain('"partCount": 2');
    expect(receipt).not.toContain("record-1");
    expect(receipt).not.toContain("notes");
  });
});

describe("multi-part transfer set opening", () => {
  it("opens all parts before exposing any member", async () => {
    const members = await manyMembers(25);
    const file = setValueOf(await createTransferSet(members));
    const opened = setValueOf(await openTransferSet(file));
    expect(opened.memberCount).toBe(25);
    expect(opened.parts.every(part => part.members.length > 0)).toBe(true);
  });

  it("rejects a zero-byte file before reading it", async () => {
    const empty = new Blob([]);
    const read = vi.spyOn(empty, "arrayBuffer");
    expectProblem(await openTransferSet(empty), "empty");
    expect(read).not.toHaveBeenCalled();
  });

  it("rejects a file above the envelope limit before reading it", async () => {
    const oversized = new Blob([new Uint8Array(SET_LIMITS.envelopeBytes + 1)]);
    const read = vi.spyOn(oversized, "arrayBuffer");
    expectProblem(await openTransferSet(oversized), "set-size");
    expect(read).not.toHaveBeenCalled();
  });

  it.each(["{", "null", "true", "[]", '{"schema":"other"}'])("rejects malformed or unsupported JSON (%s)", async text => {
    expectProblem(await openTransferSet(new Blob([text])), "envelope");
  });

  it("rejects a different transfer-set version", async () => {
    const file = setValueOf(await createTransferSet(await manyMembers(13)));
    const document = JSON.parse(await file.text()) as Record<string, unknown>;
    document.schema = "the-app.recovery-transfer-set.v99";
    expectProblem(await openTransferSet(new Blob([JSON.stringify(document)])), "version");
  });

  it("rejects an extra root property", async () => {
    const file = setValueOf(await createTransferSet(await manyMembers(13)));
    const document = JSON.parse(await file.text()) as Record<string, unknown>;
    document.debug = true;
    expectProblem(await openTransferSet(new Blob([JSON.stringify(document)])), "envelope");
  });

  it("rejects missing numbered parts", async () => {
    const file = setValueOf(await createTransferSet(await manyMembers(13)));
    const document = JSON.parse(await file.text()) as { parts: unknown[] };
    document.parts.pop();
    expectProblem(await openTransferSet(new Blob([JSON.stringify(document)])), "part-count");
  });

  it("rejects a part index that is not consecutive", async () => {
    const file = setValueOf(await createTransferSet(await manyMembers(13)));
    const document = JSON.parse(await file.text()) as { parts: Array<Record<string, unknown>> };
    document.parts[1]!.index = 3;
    expectProblem(await openTransferSet(new Blob([JSON.stringify(document)])), "incomplete");
  });

  it("rejects a part count that disagrees with the envelope", async () => {
    const file = setValueOf(await createTransferSet(await manyMembers(13)));
    const document = JSON.parse(await file.text()) as { parts: Array<Record<string, unknown>> };
    document.parts[0]!.count = 99;
    expectProblem(await openTransferSet(new Blob([JSON.stringify(document)])), "incomplete");
  });

  it("rejects a tampered encoded payload by its independent digest", async () => {
    const file = setValueOf(await createTransferSet(await manyMembers(13)));
    const document = JSON.parse(await file.text()) as { parts: Array<Record<string, unknown>> };
    const payload = String(document.parts[0]!.payload);
    document.parts[0]!.payload = (payload[0] === "A" ? "B" : "A") + payload.slice(1);
    expectProblem(await openTransferSet(new Blob([JSON.stringify(document)])), "digest");
  });

  it("rejects a non-canonical base64 payload", async () => {
    const file = setValueOf(await createTransferSet(await manyMembers(13)));
    const document = JSON.parse(await file.text()) as { parts: Array<Record<string, unknown>> };
    document.parts[0]!.payload = "!";
    expectProblem(await openTransferSet(new Blob([JSON.stringify(document)])), "payload");
  });

  it("rejects an incorrect aggregate set identity", async () => {
    const file = setValueOf(await createTransferSet(await manyMembers(13)));
    const document = JSON.parse(await file.text()) as Record<string, unknown>;
    document.setId = "0".repeat(64);
    expectProblem(await openTransferSet(new Blob([JSON.stringify(document)])), "identity");
  });

  it("rejects a duplicated part digest", async () => {
    const file = setValueOf(await createTransferSet(await manyMembers(13)));
    const document = JSON.parse(await file.text()) as { parts: Array<Record<string, unknown>> };
    document.parts[1]!.digest = document.parts[0]!.digest;
    expectProblem(await openTransferSet(new Blob([JSON.stringify(document)])), "digest");
  });

  it("does not expose a partial set when the last ordinary bundle is invalid", async () => {
    const file = setValueOf(await createTransferSet(await manyMembers(13)));
    const document = JSON.parse(await file.text()) as { parts: Array<Record<string, unknown>> };
    document.parts[1]!.payload = btoa("not a recovery bundle");
    document.parts[1]!.byteLength = new TextEncoder().encode("not a recovery bundle").length;
    document.parts[1]!.digest = "0".repeat(64);
    expect((await openTransferSet(new Blob([JSON.stringify(document)]))).ok).toBe(false);
  });

  it("reports unavailable crypto instead of accepting unchecked parts", async () => {
    const file = setValueOf(await createTransferSet(await manyMembers(13)));
    vi.stubGlobal("crypto", undefined);
    expectProblem(await openTransferSet(file), "crypto");
  });

  it("keeps part blobs as independently openable ordinary bundles", async () => {
    const file = setValueOf(await createTransferSet(await manyMembers(13)));
    const opened = setValueOf(await openTransferSet(file));
    for (const part of opened.parts) {
      expect((await part.file.text()).startsWith('{')).toBe(true);
      expect(part.file.size).toBe(part.byteLength);
    }
  });
});

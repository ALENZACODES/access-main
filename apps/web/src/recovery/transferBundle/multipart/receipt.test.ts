import { describe, expect, it } from "vitest";
import { packetWith, valueOf } from "../bundleTestSupport";
import { inspectMember } from "../model";
import { createTransferSet, openTransferSet, transferSetReceipt, type SetResult } from "./model";
import {
  checkTransferReceipt, compareReceiptText, compareTransferReceipt,
  exportTransferReceipt, parseTransferReceipt, RECEIPT_LIMIT_BYTES,
  SET_RECEIPT_SCHEMA, transferReceiptSummary, type ReceiptResult,
} from "./receipt";

function receiptValueOf<T>(result: ReceiptResult<T>): T {
  if (!result.ok) throw new Error(`Expected success, received ${result.issue}`);
  return result.value;
}

function setValueOf<T>(result: SetResult<T>): T {
  if (!result.ok) throw new Error(`Expected success, received ${result.problem.code}`);
  return result.value;
}

async function setOf(count: number) {
  const members = [];
  for (let index = 0; index < count; index++) {
    members.push(valueOf(await inspectMember(new Blob([JSON.stringify(packetWith(`receipt-${index}`))]))));
  }
  return setValueOf(await openTransferSet(setValueOf(await createTransferSet(members))));
}

describe("counts-only transfer receipts", () => {
  it("exports an exact receipt schema with part order and byte counts", async () => {
    const set = await setOf(13);
    const text = exportTransferReceipt(set);
    const receipt = JSON.parse(text) as Record<string, unknown>;
    expect(receipt.schema).toBe(SET_RECEIPT_SCHEMA);
    expect(receipt.setId).toBe(set.setId);
    expect(receipt.partCount).toBe(2);
    expect(receipt.memberCount).toBe(13);
    expect(checkTransferReceipt(receipt)).toBe(true);
  });

  it("round-trips a valid receipt", async () => {
    const set = await setOf(13);
    const text = exportTransferReceipt(set);
    expect(parseTransferReceipt(text)).toEqual({ ok: true, value: JSON.parse(text) });
  });

  it("uses the same canonical receipt in the bundle model and receipt exporter", async () => {
    const set = await setOf(13);
    expect(transferSetReceipt(set)).toBe(exportTransferReceipt(set));
  });

  it("matches the transfer set from which it was produced", async () => {
    const set = await setOf(13);
    const receipt = receiptValueOf(parseTransferReceipt(exportTransferReceipt(set)));
    expect(compareTransferReceipt(receipt, set)).toEqual({
      matches: true, setIdMatches: true, partsMatch: true,
      memberCountMatches: true, byteLengthMatches: true, mismatchedParts: [],
    });
  });

  it("reports a different set identity without claiming a match", async () => {
    const set = await setOf(13);
    const receipt = { ...receiptValueOf(parseTransferReceipt(exportTransferReceipt(set))), setId: "0".repeat(64) };
    const comparison = compareTransferReceipt(receipt, set);
    expect(comparison.matches).toBe(false);
    expect(comparison.setIdMatches).toBe(false);
  });

  it("identifies the exact part with a different digest", async () => {
    const set = await setOf(13);
    const receipt = receiptValueOf(parseTransferReceipt(exportTransferReceipt(set)));
    const altered = { ...receipt, parts: receipt.parts.map((part, index) => index === 1 ? { ...part, digest: "0".repeat(64) } : part) };
    const comparison = compareTransferReceipt(altered, set);
    expect(comparison.partsMatch).toBe(false);
    expect(comparison.mismatchedParts).toEqual([2]);
  });

  it("reports member-count mismatch separately", async () => {
    const set = await setOf(13);
    const receipt = { ...receiptValueOf(parseTransferReceipt(exportTransferReceipt(set))), memberCount: 12 };
    const comparison = compareTransferReceipt(receipt, set);
    expect(comparison.memberCountMatches).toBe(false);
    expect(comparison.matches).toBe(false);
  });

  it("rejects malformed JSON", () => {
    expect(parseTransferReceipt("{")).toEqual({ ok: false, issue: "format" });
  });

  it("rejects a receipt above its byte limit before parsing", () => {
    expect(parseTransferReceipt(" ".repeat(RECEIPT_LIMIT_BYTES + 1))).toEqual({ ok: false, issue: "size" });
  });

  it("rejects unexpected root fields", async () => {
    const receipt = JSON.parse(exportTransferReceipt(await setOf(13))) as Record<string, unknown>;
    receipt.note = "should not be part of a counts-only receipt";
    expect(checkTransferReceipt(receipt)).toBe(false);
  });

  it("rejects unsupported receipt schemas", async () => {
    const receipt = JSON.parse(exportTransferReceipt(await setOf(13))) as Record<string, unknown>;
    receipt.schema = "v9";
    expect(checkTransferReceipt(receipt)).toBe(false);
  });

  it("rejects a missing part", async () => {
    const receipt = JSON.parse(exportTransferReceipt(await setOf(13))) as { parts: unknown[] };
    receipt.parts.pop();
    expect(checkTransferReceipt(receipt)).toBe(false);
  });

  it("rejects a part index gap", async () => {
    const receipt = JSON.parse(exportTransferReceipt(await setOf(13))) as { parts: Array<Record<string, unknown>> };
    receipt.parts[1]!.index = 3;
    expect(checkTransferReceipt(receipt)).toBe(false);
  });

  it("rejects duplicate part fingerprints", async () => {
    const receipt = JSON.parse(exportTransferReceipt(await setOf(13))) as { parts: Array<Record<string, unknown>> };
    receipt.parts[1]!.digest = receipt.parts[0]!.digest;
    expect(checkTransferReceipt(receipt)).toBe(false);
  });

  it("rejects negative, fractional and over-limit counts", async () => {
    const receipt = JSON.parse(exportTransferReceipt(await setOf(13))) as Record<string, unknown>;
    for (const count of [-1, 1.5, 1000]) {
      expect(checkTransferReceipt({ ...receipt, memberCount: count })).toBe(false);
    }
  });

  it("rejects a part whose declared member count is zero", async () => {
    const receipt = JSON.parse(exportTransferReceipt(await setOf(13))) as { parts: Array<Record<string, unknown>> };
    receipt.parts[0]!.memberCount = 0;
    expect(checkTransferReceipt(receipt)).toBe(false);
  });

  it("rejects a root original-byte total that does not equal the per-part totals", async () => {
    const receipt = JSON.parse(exportTransferReceipt(await setOf(13))) as Record<string, unknown>;
    receipt.byteLength = Number(receipt.byteLength) + 1;
    expect(checkTransferReceipt(receipt)).toBe(false);
  });

  it("keeps the summary free of notes and raw export content", async () => {
    const set = await setOf(13);
    const receipt = receiptValueOf(parseTransferReceipt(exportTransferReceipt(set)));
    const summary = transferReceiptSummary(receipt);
    expect(summary).toContain(set.setId);
    expect(summary).not.toContain("receipt-0");
    expect(summary).not.toContain("notes");
  });

  it("returns a comparison result when parsing and comparing one receipt", async () => {
    const set = await setOf(13);
    expect(compareReceiptText(exportTransferReceipt(set), set)).toMatchObject({ ok: true, value: { matches: true } });
  });
});

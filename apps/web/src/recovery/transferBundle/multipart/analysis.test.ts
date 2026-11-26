import { describe, expect, it } from "vitest";
import { packetWith, valueOf } from "../bundleTestSupport";
import { inspectMember } from "../model";
import { createTransferSet, openTransferSet, transferSetMembers, type SetResult } from "./model";
import {
  auditTransferSet, compareExpectedMembers, expectedMembersFromSet, summarizeAudit,
} from "./analysis";

function setValueOf<T>(result: SetResult<T>): T {
  if (!result.ok) throw new Error(`Expected success, received ${result.problem.code}`);
  return result.value;
}

async function openMany(count: number) {
  const members = [];
  for (let index = 0; index < count; index++) {
    members.push(valueOf(await inspectMember(new Blob([JSON.stringify(packetWith(`audit-${index}`))]))));
  }
  return setValueOf(await openTransferSet(setValueOf(await createTransferSet(members))));
}

describe("transfer-set audit and member reconciliation", () => {
  it("reports part, member and byte totals from validated parts", async () => {
    const set = await openMany(13);
    const audit = auditTransferSet(set);
    expect(audit.partCount).toBe(2);
    expect(audit.memberCount).toBe(13);
    expect(audit.byteLength).toBe(set.byteLength);
    expect(audit.structurallyConsistent).toBe(true);
  });

  it("counts recovery export kinds and records independently", async () => {
    const set = await openMany(13);
    const audit = auditTransferSet(set);
    expect(audit.kinds).toHaveLength(1);
    expect(audit.kinds[0]).toMatchObject({ kind: "packet", members: 13, records: 26 });
  });

  it("reports each part in the received order", async () => {
    const set = await openMany(25);
    const audit = auditTransferSet(set);
    expect(audit.parts.map(part => part.index)).toEqual([1, 2, 3]);
    expect(audit.parts.map(part => part.memberCount)).toEqual([12, 12, 1]);
  });

  it("reports remaining member and byte capacity without negative values", async () => {
    const set = await openMany(13);
    const audit = auditTransferSet(set);
    expect(audit.remainingMembers).toBeGreaterThan(0);
    expect(audit.remainingBytes).toBeGreaterThan(0);
    expect(audit.remainingMembers).toBeLessThanOrEqual(audit.memberCapacity);
  });

  it("summarizes counts without embedding original notes", async () => {
    const set = await openMany(13);
    const lines = summarizeAudit(auditTransferSet(set));
    expect(lines.some(line => line.startsWith("members:13"))).toBe(true);
    expect(lines.join("\n")).not.toContain("audit-0");
  });

  it("creates an expected manifest from the original member order", async () => {
    const set = await openMany(13);
    const expected = expectedMembersFromSet(set);
    expect(expected.map(row => row.digest)).toEqual(transferSetMembers(set).map(member => member.digest));
  });

  it("matches a received set against its own expected manifest", async () => {
    const set = await openMany(13);
    const comparison = compareExpectedMembers(expectedMembersFromSet(set), transferSetMembers(set));
    expect(comparison).toMatchObject({ matches: true, expectedCount: 13, receivedCount: 13, differences: [] });
  });

  it("reports a missing member", async () => {
    const set = await openMany(13);
    const received = transferSetMembers(set).slice(1);
    const comparison = compareExpectedMembers(expectedMembersFromSet(set), received);
    expect(comparison.matches).toBe(false);
    expect(comparison.differences.some(item => item.code === "missing")).toBe(true);
  });

  it("reports an extra member", async () => {
    const set = await openMany(13);
    const extra = valueOf(await inspectMember(new Blob([JSON.stringify(packetWith("extra"))])));
    const comparison = compareExpectedMembers(expectedMembersFromSet(set), [...transferSetMembers(set), extra]);
    expect(comparison.differences.some(item => item.code === "extra")).toBe(true);
  });

  it("reports reordering even when every fingerprint is present", async () => {
    const set = await openMany(13);
    const members = [...transferSetMembers(set)];
    [members[0], members[1]] = [members[1]!, members[0]!];
    const comparison = compareExpectedMembers(expectedMembersFromSet(set), members);
    expect(comparison.differences.filter(item => item.code === "reordered")).toHaveLength(2);
  });

  it("reports metadata drift separately from missing content", async () => {
    const set = await openMany(13);
    const members = [...transferSetMembers(set)];
    members[0] = { ...members[0]!, recordCount: members[0]!.recordCount + 1 };
    const comparison = compareExpectedMembers(expectedMembersFromSet(set), members);
    expect(comparison.differences.some(item => item.code === "metadata-changed")).toBe(true);
    expect(comparison.differences.some(item => item.code === "missing")).toBe(false);
  });

  it("does not infer accuracy from matching fingerprints", async () => {
    const set = await openMany(13);
    const audit = auditTransferSet(set);
    expect("accuracyConfirmed" in audit).toBe(false);
    expect("senderIdentified" in audit).toBe(false);
  });
});

import { BUNDLE_LIMITS, type BundleMember } from "../model";
import { SET_LIMITS, type TransferSet } from "./model";

export interface KindCount {
  readonly kind: BundleMember["kind"];
  readonly members: number;
  readonly records: number;
  readonly bytes: number;
}

export interface PartAuditRow {
  readonly index: number;
  readonly memberCount: number;
  readonly bundleByteLength: number;
  readonly originalByteLength: number;
  readonly largestMemberBytes: number;
  readonly kinds: readonly BundleMember["kind"][];
  readonly digest: string;
}

export interface TransferSetAudit {
  readonly setId: string;
  readonly partCount: number;
  readonly memberCount: number;
  readonly byteLength: number;
  readonly kinds: readonly KindCount[];
  readonly parts: readonly PartAuditRow[];
  readonly maxPartBytes: number;
  readonly totalCapacityBytes: number;
  readonly remainingBytes: number;
  readonly memberCapacity: number;
  readonly remainingMembers: number;
  readonly structurallyConsistent: boolean;
}

export interface ExpectedMember {
  readonly digest: string;
  readonly kind: BundleMember["kind"];
  readonly byteLength: number;
  readonly recordCount: number;
}

export interface MemberDifference {
  readonly digest: string;
  readonly expectedIndex: number | null;
  readonly receivedIndex: number | null;
  readonly code: "missing" | "extra" | "reordered" | "metadata-changed";
}

export interface MemberComparison {
  readonly matches: boolean;
  readonly expectedCount: number;
  readonly receivedCount: number;
  readonly differences: readonly MemberDifference[];
}

const orderKinds = (a: string, b: string): number => a.localeCompare(b);

export function auditTransferSet(set: TransferSet): TransferSetAudit {
  const kindMap = new Map<BundleMember["kind"], { members: number; records: number; bytes: number }>();
  const parts: PartAuditRow[] = [];
  let memberCount = 0;
  let byteLength = 0;
  let maxPartBytes = 0;
  const seenMembers = new Set<string>();
  const seenParts = new Set<string>();
  let structurallyConsistent = set.parts.length >= 2 && set.parts.length <= SET_LIMITS.parts &&
    /^[a-f0-9]{64}$/u.test(set.setId);
  for (const [offset, part] of set.parts.entries()) {
    const kinds = new Set<BundleMember["kind"]>();
    let largestMemberBytes = 0;
    let partBytes = 0;
    for (const member of part.members) {
      if (!/^[a-f0-9]{64}$/u.test(member.digest) || seenMembers.has(member.digest) ||
          !Number.isSafeInteger(member.byteLength) || member.byteLength <= 0 ||
          member.file.size !== member.byteLength) structurallyConsistent = false;
      seenMembers.add(member.digest);
      kinds.add(member.kind);
      largestMemberBytes = Math.max(largestMemberBytes, member.byteLength);
      partBytes += member.byteLength;
      memberCount += 1;
      byteLength += member.byteLength;
      const prior = kindMap.get(member.kind) ?? { members: 0, records: 0, bytes: 0 };
      kindMap.set(member.kind, {
        members: prior.members + 1,
        records: prior.records + member.recordCount,
        bytes: prior.bytes + member.byteLength,
      });
    }
    if (part.index !== offset + 1 || part.count !== set.parts.length || part.members.length === 0 ||
        part.members.length > BUNDLE_LIMITS.members || partBytes > BUNDLE_LIMITS.totalBytes ||
        part.byteLength <= 0 || part.byteLength > SET_LIMITS.partBytes || part.file.size !== part.byteLength ||
        !/^[a-f0-9]{64}$/u.test(part.digest) || seenParts.has(part.digest)) structurallyConsistent = false;
    seenParts.add(part.digest);
    parts.push(Object.freeze({
      index: part.index,
      memberCount: part.members.length,
      bundleByteLength: part.byteLength,
      originalByteLength: partBytes,
      largestMemberBytes,
      kinds: Object.freeze([...kinds].sort(orderKinds) as BundleMember["kind"][]),
      digest: part.digest,
    }));
    maxPartBytes = Math.max(maxPartBytes, partBytes);
  }
  if (memberCount !== set.memberCount || byteLength !== set.byteLength || memberCount > SET_LIMITS.members || byteLength > SET_LIMITS.rawBytes) {
    structurallyConsistent = false;
  }
  const kinds = [...kindMap.entries()].map(([kind, counts]) => ({ kind, ...counts })).sort((a, b) => orderKinds(a.kind, b.kind));
  const totalCapacityBytes = SET_LIMITS.parts * BUNDLE_LIMITS.totalBytes;
  return Object.freeze({
    setId: set.setId,
    partCount: set.parts.length,
    memberCount,
    byteLength,
    kinds: Object.freeze(kinds),
    parts: Object.freeze(parts),
    maxPartBytes,
    totalCapacityBytes,
    remainingBytes: Math.max(0, SET_LIMITS.rawBytes - byteLength),
    memberCapacity: SET_LIMITS.members,
    remainingMembers: Math.max(0, SET_LIMITS.members - memberCount),
    structurallyConsistent,
  });
}

/** Compare ordered export fingerprints without treating matching counts as proof. */
export function compareExpectedMembers(
  expected: readonly ExpectedMember[],
  received: readonly BundleMember[],
): MemberComparison {
  const expectedIndex = new Map(expected.map((member, index) => [member.digest, { member, index }]));
  const receivedIndex = new Map(received.map((member, index) => [member.digest, { member, index }]));
  const differences: MemberDifference[] = [];
  for (const [index, item] of expected.entries()) {
    const found = receivedIndex.get(item.digest);
    if (!found) {
      differences.push({ digest: item.digest, expectedIndex: index + 1, receivedIndex: null, code: "missing" });
      continue;
    }
    if (found.index !== index) {
      differences.push({ digest: item.digest, expectedIndex: index + 1, receivedIndex: found.index + 1, code: "reordered" });
    }
    const actual = found.member;
    if (actual.kind !== item.kind || actual.byteLength !== item.byteLength || actual.recordCount !== item.recordCount) {
      differences.push({ digest: item.digest, expectedIndex: index + 1, receivedIndex: found.index + 1, code: "metadata-changed" });
    }
  }
  for (const [index, item] of received.entries()) {
    if (!expectedIndex.has(item.digest)) {
      differences.push({ digest: item.digest, expectedIndex: null, receivedIndex: index + 1, code: "extra" });
    }
  }
  return Object.freeze({
    matches: differences.length === 0 && expected.length === received.length,
    expectedCount: expected.length,
    receivedCount: received.length,
    differences: Object.freeze(differences),
  });
}

export function expectedMembersFromSet(set: TransferSet): readonly ExpectedMember[] {
  return Object.freeze(set.parts.flatMap(part => part.members.map(member => ({
    digest: member.digest,
    kind: member.kind,
    byteLength: member.byteLength,
    recordCount: member.recordCount,
  }))));
}

export function summarizeAudit(audit: TransferSetAudit): string[] {
  return [
    `parts:${audit.partCount}`,
    `members:${audit.memberCount}`,
    `bytes:${audit.byteLength}`,
    `remaining-bytes:${audit.remainingBytes}`,
    `remaining-members:${audit.remainingMembers}`,
    ...audit.kinds.map(row => `kind:${row.kind}:${row.members}:${row.records}:${row.bytes}`),
  ];
}

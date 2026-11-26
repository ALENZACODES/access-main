import { CHAIN_LIMITS, checkChainDocument, emptyChain } from "../recoveryHandoffChain";
import { DRILL_LIMITS, checkDrillDocument, emptyDrillDocument } from "../recoveryDrillRun";
import { PACKET_LIMITS, checkPacketDocument, emptyPacket } from "../recoveryEvidencePacket";
import { GUIDED_LIMITS, checkGuidedDocument, emptyGuidedDocument } from "../recoveryGuidedReview";
import { RECEIPT_LIMITS, emptyReceiptDocument, validateReceiptDocument } from "../recoveryReceiptLedger";
import { RECONCILIATION_LIMITS, checkReconciliationDocument, newReconciliationDocument } from "../recoveryReconciliation";
import { REFRESH_LIMITS, REFRESH_SCHEMA, checkRefreshDocument } from "../recoverySourceRefresh";
import { BRIEF_LIMITS, emptyBriefDocument, validBriefDocument } from "../recoverySupportBrief";
import { WITNESS_LIMITS, WITNESS_SCHEMA, validateWitnessDocument } from "../recoveryTransferWitness";

export type RecoveryKind =
  | "receipt" | "witness" | "chain" | "reconciliation" | "drill"
  | "packet" | "guided" | "brief" | "refresh";

export interface MemberSummary {
  readonly kind: RecoveryKind;
  /** All rows, including events and subordinate items. Empty exports are valid. */
  readonly recordCount: number;
}

interface Format {
  readonly schema: string;
  readonly bytes: number;
  readonly count: (document: unknown) => number | null;
}

// Use each tool's native reader. It owns the meaning of its schema, including
// relationships between records. Extra keys accepted by that reader remain in
// the original bytes. The bundle view only receives a kind and a row count.
const formats: Readonly<Record<RecoveryKind, Format>> = {
  receipt: {
    schema: emptyReceiptDocument().schema,
    bytes: RECEIPT_LIMITS.bytes,
    count(document) {
      const checked = validateReceiptDocument(document);
      return checked.ok ? checked.value.entries.length + checked.value.events.length : null;
    },
  },
  witness: {
    schema: WITNESS_SCHEMA,
    bytes: WITNESS_LIMITS.bytes,
    count(document) {
      const checked = validateWitnessDocument(document);
      return checked.ok ? checked.value.transfers.length + checked.value.events.length : null;
    },
  },
  chain: {
    schema: emptyChain().schema,
    bytes: CHAIN_LIMITS.bytes,
    count(document) {
      const checked = checkChainDocument(document);
      return checked.ok
        ? checked.value.nodes.length + checked.value.links.length + checked.value.events.length
        : null;
    },
  },
  reconciliation: {
    schema: newReconciliationDocument().schema,
    bytes: RECONCILIATION_LIMITS.bytes,
    count(document) {
      const checked = checkReconciliationDocument(document);
      return checked.ok
        ? checked.value.cases.length + checked.value.observations.length + checked.value.events.length
        : null;
    },
  },
  drill: {
    schema: emptyDrillDocument().schema,
    bytes: DRILL_LIMITS.bytes,
    count(document) {
      const checked = checkDrillDocument(document);
      return checked.ok
        ? checked.value.runs.length + checked.value.steps.length + checked.value.events.length
        : null;
    },
  },
  packet: {
    schema: emptyPacket().schema,
    bytes: PACKET_LIMITS.bytes,
    count(document) {
      const checked = checkPacketDocument(document);
      return checked.ok ? checked.value.entries.length + checked.value.events.length : null;
    },
  },
  guided: {
    schema: emptyGuidedDocument().schema,
    bytes: GUIDED_LIMITS.bytes,
    count(document) {
      return checkGuidedDocument(document)
        ? document.cases.length + document.steps.length + document.events.length
        : null;
    },
  },
  brief: {
    schema: emptyBriefDocument().schema,
    bytes: BRIEF_LIMITS.bytes,
    count(document) {
      return validBriefDocument(document)
        ? document.briefs.length + document.observations.length + document.questions.length + document.events.length
        : null;
    },
  },
  refresh: {
    schema: REFRESH_SCHEMA,
    bytes: REFRESH_LIMITS.bytes,
    count(document) {
      return checkRefreshDocument(document)
        ? document.subjects.length + document.observations.length + document.reviews.length
        : null;
    },
  },
};

const bySchema = new Map(
  (Object.keys(formats) as RecoveryKind[]).map(kind => [formats[kind].schema, kind]),
);
const largestExport = Math.max(...Object.values(formats).map(format => format.bytes));

export function isRecoveryKind(value: unknown): value is RecoveryKind {
  return typeof value === "string" && Object.hasOwn(formats, value);
}

export function byteCap(kind?: RecoveryKind): number {
  return kind === undefined ? largestExport : formats[kind].bytes;
}

export function classifyRecoveryText(text: string, originalByteLength?: number): MemberSummary | "member-size" | null {
  if (text.length === 0) return null;
  if (text.length > largestExport) return "member-size";
  // JSON.parse does not consume the optional UTF-8 byte-order mark. Leave the
  // original file intact for hashing and extraction.
  const json = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  let document: unknown;
  try {
    document = JSON.parse(json) as unknown;
  } catch {
    return null;
  }
  if (typeof document !== "object" || document === null || !("schema" in document)
    || typeof document.schema !== "string") return null;
  const kind = bySchema.get(document.schema);
  if (kind === undefined) return null;
  const format = formats[kind];
  const size = originalByteLength ?? new TextEncoder().encode(text).byteLength;
  if (size > format.bytes) return "member-size";
  const count = format.count(document);
  return count === null ? null : { kind, recordCount: count };
}

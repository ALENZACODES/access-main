import { createHash } from "node:crypto";
import { emptyPacket, type PacketDocument } from "../recoveryEvidencePacket";
import { BUNDLE_SCHEMA, type BundleResult } from "./model";

export function valueOf<T>(result: BundleResult<T>): T {
  if (!result.ok) throw new Error(`Expected success, received ${result.problem.code}`);
  return result.value;
}

export function packetWith(note: string): PacketDocument {
  return {
    ...emptyPacket(),
    entries: [{
      id: "entry-A",
      packId: "sample-pack",
      operation: "handoff",
      stage: "draft",
      recordedAt: "2026-10-06T09:30:00Z",
      source: {
        name: "Example source",
        licence: "CC0",
        retrievedOn: "2026-10-05",
        tier: "UNKNOWN",
        reference: "example-1",
      },
      observation: { condition: "UNKNOWN", note, bytes: null, digest: null },
    }],
    events: [{
      id: "event-A",
      entryId: "entry-A",
      action: "noted",
      at: "2026-10-06T10:00:00Z",
      note: "Sample handoff",
    }],
  };
}

export interface TestWireEntry {
  kind: string;
  byteLength: number;
  digest: string;
  payload: string;
}

export function wireEntry(content: string | Uint8Array, kind = "packet"): TestWireEntry {
  const bytes = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
  return {
    kind,
    byteLength: bytes.length,
    digest: createHash("sha256").update(bytes).digest("hex"),
    payload: bytes.toString("base64"),
  };
}

export function bundleFile(...entries: readonly unknown[]): Blob {
  return new Blob([JSON.stringify({ schema: BUNDLE_SCHEMA, entries })], { type: "application/json" });
}

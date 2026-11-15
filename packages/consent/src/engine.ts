import type { ConsentStore, StoredState } from "./store.ts";
import {
  STORE_SCHEMA_VERSION,
  type AuditAction,
  type AuditEntry,
  type ConsentEvent,
  type ConsentRecord,
  type ConsentRevocation,
  type ConsentState,
  type Purpose,
} from "./types.ts";
import { validateAuditEntry, validateConsentEvent, validatePurpose } from "./validators.ts";

export type ConsentErrorCode =
  | "invalid_purpose"
  | "duplicate_purpose"
  | "unknown_purpose"
  | "version_mismatch"
  | "already_granted"
  | "already_refused"
  | "currently_granted"
  | "not_granted"
  | "invalid_event"
  | "storage_failed";

export class ConsentError extends Error {
  readonly code: ConsentErrorCode;
  constructor(code: ConsentErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ConsentError";
    this.code = code;
  }
}

export interface ConsentEngineOptions {
  purposes: readonly Purpose[];
  store: ConsentStore;
  /** Injected for tests. */
  now?: () => Date;
}

export interface ConsentEngine {
  readonly persistent: boolean;
  listPurposes(): Purpose[];
  /** The caller passes the purpose version the person was shown. A different current version is refused. */
  grant(purposeId: string, acceptedVersion: number): ConsentRecord;
  refuse(purposeId: string): ConsentRecord;
  revoke(purposeId: string): ConsentRevocation;
  currentState(purposeId: string): ConsentState;
  auditLog(purposeId?: string): AuditEntry[];
  /** Problems found when stored data was read. Not empty means every stored grant was dropped (fail closed). */
  integrityIssues(): string[];
}

interface Loaded {
  events: ConsentEvent[];
  audit: AuditEntry[];
  nextSeq: number;
  issues: string[];
}

function loadState(raw: unknown): Loaded {
  const empty: Loaded = { events: [], audit: [], nextSeq: 1, issues: [] };
  if (raw === null || raw === undefined) return empty;
  const issues: string[] = [];
  const shape = raw as { schema_version?: unknown; events?: unknown; audit?: unknown };
  if (typeof raw !== "object" || shape.schema_version !== STORE_SCHEMA_VERSION || !Array.isArray(shape.events) || !Array.isArray(shape.audit)) {
    return { ...empty, issues: ["store_unreadable"] };
  }
  const events: ConsentEvent[] = [];
  const seen = new Set<number>();
  shape.events.forEach((item: unknown, index) => {
    const result = validateConsentEvent(item);
    const seq = (item as ConsentEvent | null)?.seq;
    if (!result.valid || seen.has(seq as number)) {
      issues.push(`event_${index}_invalid`);
    } else {
      seen.add(seq as number);
      events.push(item as ConsentEvent);
    }
  });
  const audit: AuditEntry[] = [];
  shape.audit.forEach((item: unknown, index) => {
    if (validateAuditEntry(item).valid) audit.push(item as AuditEntry);
    else issues.push(`audit_${index}_invalid`);
  });
  const maxSeq = Math.max(0, ...events.map((e) => e.seq), ...audit.map((a) => a.seq));
  // Fail closed. A dropped revocation must never bring an older grant back.
  return { events: issues.length > 0 ? [] : events.sort((a, b) => a.seq - b.seq), audit: audit.sort((a, b) => a.seq - b.seq), nextSeq: maxSeq + 1, issues };
}

export function createConsentEngine(options: ConsentEngineOptions): ConsentEngine {
  const now = options.now ?? (() => new Date());
  const purposes = new Map<string, Purpose>();
  for (const purpose of options.purposes) {
    const result = validatePurpose(purpose);
    if (!result.valid) throw new ConsentError("invalid_purpose", `${String(purpose?.id)}: ${result.errors.join("; ")}`);
    if (purposes.has(purpose.id)) throw new ConsentError("duplicate_purpose", purpose.id);
    purposes.set(purpose.id, structuredClone(purpose));
  }

  const loaded = loadState(options.store.load());
  let events = loaded.events;
  let audit = loaded.audit;
  let nextSeq = loaded.nextSeq;
  const issues = loaded.issues;

  function purposeOrThrow(id: string): Purpose {
    const purpose = purposes.get(id);
    if (!purpose) throw new ConsentError("unknown_purpose", id);
    return purpose;
  }

  function lastEvent(id: string): ConsentEvent | undefined {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const event = events[i];
      if (event && event.purpose_id === id) return event;
    }
    return undefined;
  }

  function derive(purpose: Purpose): ConsentState {
    const base = { purposeId: purpose.id, currentVersion: purpose.version };
    const last = lastEvent(purpose.id);
    if (!last) return { ...base, status: "not_asked", granted: false, decidedVersion: null, decidedAt: null };
    if (last.record_type === "consent_revocation") {
      return { ...base, status: "revoked", granted: false, decidedVersion: last.purpose_version, decidedAt: last.revoked_at };
    }
    if (last.decision === "refused") {
      return { ...base, status: "refused", granted: false, decidedVersion: last.purpose_version, decidedAt: last.decided_at };
    }
    const current = last.purpose_version === purpose.version;
    return {
      ...base,
      status: current ? "granted" : "outdated",
      granted: current,
      decidedVersion: last.purpose_version,
      decidedAt: last.decided_at,
    };
  }

  function commit<T extends ConsentEvent>(action: AuditAction, build: (seq: number, at: string) => T): T {
    const seq = nextSeq;
    const at = now().toISOString();
    const event = build(seq, at);
    const entry: AuditEntry = {
      record_type: "audit_entry",
      schema_version: "audit-entry-1.0.0",
      seq,
      at,
      action,
      purpose_id: event.purpose_id,
      purpose_version: event.purpose_version,
    };
    const checked = validateConsentEvent(event);
    if (!checked.valid || !validateAuditEntry(entry).valid) throw new ConsentError("invalid_event", checked.errors.join("; "));
    const next: StoredState = { schema_version: STORE_SCHEMA_VERSION, events: [...events, event], audit: [...audit, entry] };
    try {
      options.store.save(next);
    } catch {
      throw new ConsentError("storage_failed");
    }
    events = next.events;
    audit = next.audit;
    nextSeq = seq + 1;
    return { ...event };
  }

  return {
    persistent: options.store.persistent,
    listPurposes: () => [...purposes.values()].map((p) => structuredClone(p)),
    currentState: (id) => derive(purposeOrThrow(id)),
    auditLog: (id) => audit.filter((entry) => id === undefined || entry.purpose_id === id).map((entry) => ({ ...entry })),
    integrityIssues: () => [...issues],
    grant(id, acceptedVersion) {
      const purpose = purposeOrThrow(id);
      if (acceptedVersion !== purpose.version) throw new ConsentError("version_mismatch", `${id}: shown ${acceptedVersion}, current ${purpose.version}`);
      if (derive(purpose).granted) throw new ConsentError("already_granted", id);
      return commit("grant", (seq, at): ConsentRecord => ({
        record_type: "consent_record",
        schema_version: "consent-record-1.0.0",
        seq,
        purpose_id: id,
        purpose_version: purpose.version,
        decision: "granted",
        decided_at: at,
      }));
    },
    refuse(id) {
      const purpose = purposeOrThrow(id);
      const state = derive(purpose);
      if (state.granted) throw new ConsentError("currently_granted", id);
      if (state.status === "refused" && state.decidedVersion === purpose.version) throw new ConsentError("already_refused", id);
      return commit("refuse", (seq, at): ConsentRecord => ({
        record_type: "consent_record",
        schema_version: "consent-record-1.0.0",
        seq,
        purpose_id: id,
        purpose_version: purpose.version,
        decision: "refused",
        decided_at: at,
      }));
    },
    revoke(id) {
      purposeOrThrow(id);
      const last = lastEvent(id);
      if (!last || last.record_type !== "consent_record" || last.decision !== "granted") throw new ConsentError("not_granted", id);
      return commit("revoke", (seq, at): ConsentRevocation => ({
        record_type: "consent_revocation",
        schema_version: "consent-revocation-1.0.0",
        seq,
        purpose_id: id,
        purpose_version: last.purpose_version,
        revokes_seq: last.seq,
        revoked_at: at,
      }));
    },
  };
}

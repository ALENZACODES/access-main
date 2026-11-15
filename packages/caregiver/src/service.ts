import { validateProfile, type UserProfile } from "@access/shared";
import { emptyState, type GrantStore } from "./store.ts";
import {
  AUDIT_SCHEMA_VERSION,
  GRANT_SCHEMA_VERSION,
  SNAPSHOT_FIELDS,
  VIEW_SCHEMA_VERSION,
  type AuditEntry,
  type AuditReason,
  type CaregiverView,
  type Grant,
  type GrantRow,
  type GrantState,
  type GrantStatus,
  type Issue,
  type Scope,
  type ScopeInput,
  type SnapshotField,
  type EquipmentSnapshot,
} from "./types.ts";
import { assertValidState, validateAuditEntry, validateGrant, validateView } from "./validate.ts";

export type ErrorCode =
  | "invalid_input"
  | "profile_invalid"
  | "not_found"
  | "already_revoked"
  | "not_narrowable"
  | "not_a_narrowing"
  | "would_be_empty"
  | "revoked"
  | "expired"
  | "wrong_caregiver"
  | "unknown_grant";

export type Result<T> = { ok: true; value: T } | { ok: false; code: ErrorCode; issues: Issue[] };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (code: ErrorCode, issues: Issue[] = []): Result<never> => ({ ok: false, code, issues });

export interface GrantInput {
  caregiver_label: string;
  scope: ScopeInput;
  /** ISO date-time. Null or missing means the grant lasts until it is revoked. */
  expires_at?: string | null;
}

export interface NarrowInput {
  remove_fields?: readonly SnapshotField[];
  /** A new end time. Must be in the future and earlier than the current one. */
  expires_at?: string;
}

export interface ServiceOptions {
  store: GrantStore;
  now?: () => Date;
  newId?: () => string;
}

export function normaliseLabel(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
}

function labelKey(value: string): string {
  return normaliseLabel(value).toLowerCase();
}

export function statusOf(grant: Grant, nowMs: number): GrantStatus {
  if (grant.revoked_at !== null) return "revoked";
  if (grant.expires_at !== null && Date.parse(grant.expires_at) <= nowMs) return "expired";
  return "active";
}

function defaultId(): string {
  const raw = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID().replace(/-/g, "")
    : Math.random().toString(16).slice(2).padEnd(16, "0");
  return `g-${raw.slice(0, 16)}`;
}

function cloneScope(scope: Scope): Scope {
  return JSON.parse(JSON.stringify(scope)) as Scope;
}

function buildScope(input: ScopeInput, profile: UserProfile): Result<Scope> {
  switch (input.kind) {
    case "journey_reference":
      return ok({ kind: "journey_reference", journey_ref: input.journey_ref, label: input.label.trim() });
    case "check_in_receipt":
      return ok({ kind: "check_in_receipt", receipt_id: input.receipt_id, label: input.label.trim(), recorded_at: input.recorded_at });
    case "equipment_snapshot": {
      const fields = [...new Set(input.fields)];
      if (fields.length === 0) return fail("invalid_input", [{ path: "/scope/fields", code: "empty" }]);
      const unknown = fields.filter((field) => !(SNAPSHOT_FIELDS as readonly string[]).includes(field));
      if (unknown.length > 0) return fail("invalid_input", unknown.map((field) => ({ path: `/scope/fields/${field}`, code: "not_shareable" })));
      const snapshot: Record<string, string | number | boolean | null> = {};
      for (const field of fields) snapshot[field] = profile[field] ?? null;
      return ok({ kind: "equipment_snapshot", snapshot: snapshot as EquipmentSnapshot });
    }
    default:
      return fail("invalid_input", [{ path: "/scope/kind", code: "unknown_scope" }]);
  }
}

function pad(n: number): string {
  return String(n).padStart(8, "0");
}

type EntryFields = Pick<AuditEntry, "action" | "outcome" | "reason" | "grant_id" | "caregiver_label" | "scope_kind" | "fields_removed" | "expires_at">;

function withEntry(state: GrantState, at: string, fields: EntryFields): GrantState {
  const seq = state.audit.length + 1;
  const entry: AuditEntry = {
    record_type: "caregiver_audit_entry",
    schema_version: AUDIT_SCHEMA_VERSION,
    entry_id: `a-${pad(seq)}`,
    seq,
    at,
    ...fields,
  };
  if (validateAuditEntry(entry).length > 0) throw new Error("caregiver_audit_entry_invalid");
  return { grants: state.grants, audit: [...state.audit, entry] };
}

function replaceGrant(state: GrantState, updated: Grant): GrantState {
  return { grants: state.grants.map((grant) => (grant.grant_id === updated.grant_id ? updated : grant)), audit: state.audit };
}

/**
 * The only way to read or change grants. Default deny: a caregiver sees nothing
 * unless an active grant names them. Every change and every use is logged.
 */
export class CaregiverService {
  private readonly store: GrantStore;
  private readonly now: () => Date;
  private readonly newId: () => string;
  private queue: Promise<void> = Promise.resolve();

  constructor(options: ServiceOptions) {
    this.store = options.store;
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? defaultId;
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async read(): Promise<GrantState> {
    const state = (await this.store.load()) ?? emptyState();
    assertValidState(state);
    return state;
  }

  createGrant(input: GrantInput, profile: UserProfile): Promise<Result<Grant>> {
    return this.enqueue(async () => {
      const state = await this.read();
      const now = this.now();
      if (validateProfile(profile).length > 0) return fail("profile_invalid");
      const scope = buildScope(input.scope, profile);
      if (!scope.ok) return scope;
      const grant: Grant = {
        record_type: "caregiver_grant",
        schema_version: GRANT_SCHEMA_VERSION,
        grant_id: this.newId(),
        caregiver_label: normaliseLabel(input.caregiver_label),
        scope: scope.value,
        created_at: now.toISOString(),
        expires_at: input.expires_at ?? null,
        revoked_at: null,
      };
      const issues = validateGrant(grant);
      if (issues.length > 0) return fail("invalid_input", issues);
      if (grant.expires_at !== null && Date.parse(grant.expires_at) <= now.getTime()) {
        return fail("invalid_input", [{ path: "/expires_at", code: "not_in_future" }]);
      }
      if (state.grants.some((existing) => existing.grant_id === grant.grant_id)) return fail("invalid_input", [{ path: "/grant_id", code: "duplicate" }]);
      const next = withEntry({ grants: [...state.grants, grant], audit: state.audit }, grant.created_at, {
        action: "grant_created",
        outcome: "allowed",
        reason: null,
        grant_id: grant.grant_id,
        caregiver_label: grant.caregiver_label,
        scope_kind: grant.scope.kind,
        fields_removed: [],
        expires_at: grant.expires_at,
      });
      await this.store.save(next);
      return ok(grant);
    });
  }

  /** Narrowing only removes access: fewer equipment fields, or an earlier end. Widening needs a new grant. */
  narrowGrant(grantId: string, change: NarrowInput): Promise<Result<Grant>> {
    return this.enqueue(async () => {
      const state = await this.read();
      const now = this.now();
      const current = state.grants.find((grant) => grant.grant_id === grantId);
      if (!current) return fail("not_found");
      const status = statusOf(current, now.getTime());
      if (status !== "active") return fail(status);
      const remove = [...new Set(change.remove_fields ?? [])];
      let scope = current.scope;
      let expires = current.expires_at;
      if (remove.length > 0) {
        if (scope.kind !== "equipment_snapshot") return fail("not_narrowable");
        const kept: EquipmentSnapshot = { ...scope.snapshot };
        for (const field of remove) {
          if (!(field in kept)) return fail("not_a_narrowing", [{ path: `/remove_fields/${field}`, code: "not_shared" }]);
          delete kept[field];
        }
        if (Object.keys(kept).length === 0) return fail("would_be_empty");
        scope = { kind: "equipment_snapshot", snapshot: kept };
      }
      if (change.expires_at !== undefined) {
        const end = Date.parse(change.expires_at);
        if (Number.isNaN(end) || end <= now.getTime()) return fail("invalid_input", [{ path: "/expires_at", code: "not_in_future" }]);
        if (expires !== null && end >= Date.parse(expires)) return fail("not_a_narrowing", [{ path: "/expires_at", code: "not_earlier" }]);
        expires = new Date(end).toISOString();
      }
      if (remove.length === 0 && change.expires_at === undefined) return fail("invalid_input", [{ path: "/", code: "no_change" }]);
      const updated: Grant = { ...current, scope, expires_at: expires };
      const issues = validateGrant(updated);
      if (issues.length > 0) return fail("invalid_input", issues);
      const next = withEntry(replaceGrant(state, updated), now.toISOString(), {
        action: "grant_narrowed",
        outcome: "allowed",
        reason: null,
        grant_id: updated.grant_id,
        caregiver_label: updated.caregiver_label,
        scope_kind: updated.scope.kind,
        fields_removed: remove,
        expires_at: updated.expires_at,
      });
      await this.store.save(next);
      return ok(updated);
    });
  }

  revokeGrant(grantId: string): Promise<Result<Grant>> {
    return this.enqueue(async () => {
      const state = await this.read();
      const current = state.grants.find((grant) => grant.grant_id === grantId);
      if (!current) return fail("not_found");
      if (current.revoked_at !== null) return fail("already_revoked");
      const at = this.now().toISOString();
      const updated: Grant = { ...current, revoked_at: at };
      const next = withEntry(replaceGrant(state, updated), at, {
        action: "grant_revoked",
        outcome: "allowed",
        reason: null,
        grant_id: updated.grant_id,
        caregiver_label: updated.caregiver_label,
        scope_kind: updated.scope.kind,
        fields_removed: [],
        expires_at: updated.expires_at,
      });
      await this.store.save(next);
      return ok(updated);
    });
  }

  /** Use one grant by id, as a caregiver. A revoked, ended, unknown or someone else's grant is refused and logged. */
  useGrant(grantId: string, caregiverLabel: string): Promise<Result<Scope>> {
    return this.enqueue(async () => {
      const state = await this.read();
      const at = this.now();
      const presented = normaliseLabel(caregiverLabel).slice(0, 60) || "?";
      const grant = state.grants.find((candidate) => candidate.grant_id === grantId);
      let reason: AuditReason | null = null;
      if (!grant) reason = "unknown_grant";
      else if (labelKey(grant.caregiver_label) !== labelKey(caregiverLabel)) reason = "wrong_caregiver";
      else {
        const status = statusOf(grant, at.getTime());
        if (status !== "active") reason = status;
      }
      const base = {
        grant_id: grant?.grant_id ?? null,
        caregiver_label: presented,
        scope_kind: grant?.scope.kind ?? null,
        fields_removed: [] as SnapshotField[],
        expires_at: grant?.expires_at ?? null,
      };
      if (reason !== null || !grant) {
        const denied = reason ?? "unknown_grant";
        await this.store.save(withEntry(state, at.toISOString(), { ...base, action: "access_denied", outcome: "denied", reason: denied }));
        return fail(denied);
      }
      await this.store.save(withEntry(state, at.toISOString(), { ...base, action: "grant_viewed", outcome: "allowed", reason: null }));
      return ok(cloneScope(grant.scope));
    });
  }

  /** Everything one caregiver may see. With no active grant it is empty and says so. */
  caregiverView(caregiverLabel: string): Promise<CaregiverView> {
    return this.enqueue(async () => {
      let state = await this.read();
      const at = this.now();
      const key = labelKey(caregiverLabel);
      const active = key
        ? state.grants.filter((grant) => labelKey(grant.caregiver_label) === key && statusOf(grant, at.getTime()) === "active")
        : [];
      for (const grant of active) {
        state = withEntry(state, at.toISOString(), {
          action: "grant_viewed",
          outcome: "allowed",
          reason: null,
          grant_id: grant.grant_id,
          caregiver_label: grant.caregiver_label,
          scope_kind: grant.scope.kind,
          fields_removed: [],
          expires_at: grant.expires_at,
        });
      }
      if (active.length > 0) await this.store.save(state);
      const view: CaregiverView = {
        record_type: "caregiver_view",
        schema_version: VIEW_SCHEMA_VERSION,
        caregiver_label: normaliseLabel(caregiverLabel) || "?",
        generated_at: at.toISOString(),
        empty: active.length === 0,
        empty_reason: active.length === 0 ? "no_active_grants" : null,
        items: active.map((grant) => ({ grant_id: grant.grant_id, expires_at: grant.expires_at, scope: cloneScope(grant.scope) })),
      };
      if (validateView(view).length > 0) throw new Error("caregiver_view_invalid");
      return view;
    });
  }

  /** Owner only: every grant, including revoked and ended ones, with its current status. */
  listGrants(): Promise<GrantRow[]> {
    return this.enqueue(async () => {
      const state = await this.read();
      const nowMs = this.now().getTime();
      return state.grants.map((grant) => ({ ...grant, status: statusOf(grant, nowMs) }));
    });
  }

  /** Owner only: the whole log, oldest first. */
  auditLog(): Promise<AuditEntry[]> {
    return this.enqueue(async () => (await this.read()).audit);
  }

  /** Names the owner has entered, once each. */
  caregiverLabels(): Promise<string[]> {
    return this.enqueue(async () => {
      const seen = new Map<string, string>();
      for (const grant of (await this.read()).grants) {
        if (!seen.has(labelKey(grant.caregiver_label))) seen.set(labelKey(grant.caregiver_label), grant.caregiver_label);
      }
      return [...seen.values()].sort((a, b) => a.localeCompare(b));
    });
  }
}

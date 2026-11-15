import Ajv2020 from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { findForbiddenKeys, looksLikeContact } from "@access/shared";
import auditSchema from "./schemas/audit-entry-1.0.0.schema.json";
import grantSchema from "./schemas/grant-1.0.0.schema.json";
import scopeSchema from "./schemas/scope-1.0.0.schema.json";
import viewSchema from "./schemas/view-1.0.0.schema.json";
import type { GrantState, Issue } from "./types.ts";

export const SCHEMAS = { scope: scopeSchema, grant: grantSchema, audit: auditSchema, view: viewSchema } as const;

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
ajv.addSchema(scopeSchema);
const grantValidator = ajv.compile(grantSchema);
const auditValidator = ajv.compile(auditSchema);
const viewValidator = ajv.compile(viewSchema);
const scopeValidator = ajv.getSchema(scopeSchema.$id) as ValidateFunction;

function run(validator: ValidateFunction, value: unknown): Issue[] {
  if (validator(value)) return [];
  return (validator.errors ?? []).map((error: ErrorObject) => ({ path: error.instancePath || "/", code: error.keyword }));
}

function forbidden(value: unknown): Issue[] {
  return findForbiddenKeys(value).map((issue) => ({ path: `/${issue.field}`, code: issue.code }));
}

export function validateScope(value: unknown): Issue[] {
  return [...run(scopeValidator, value), ...forbidden(value)];
}

/** Schema check plus the rules JSON Schema cannot state: no contact details in labels, sane dates. */
export function validateGrant(value: unknown): Issue[] {
  const issues = [...run(grantValidator, value), ...forbidden(value)];
  if (issues.length > 0) return issues;
  const grant = value as {
    caregiver_label: string;
    scope: { label?: string };
    created_at: string;
    expires_at: string | null;
    revoked_at: string | null;
  };
  if (looksLikeContact(grant.caregiver_label)) issues.push({ path: "/caregiver_label", code: "looks_like_contact" });
  if (typeof grant.scope.label === "string" && looksLikeContact(grant.scope.label)) {
    issues.push({ path: "/scope/label", code: "looks_like_contact" });
  }
  const created = Date.parse(grant.created_at);
  if (grant.expires_at !== null && Date.parse(grant.expires_at) <= created) {
    issues.push({ path: "/expires_at", code: "expires_before_created" });
  }
  if (grant.revoked_at !== null && Date.parse(grant.revoked_at) < created) {
    issues.push({ path: "/revoked_at", code: "revoked_before_created" });
  }
  return issues;
}

export function validateAuditEntry(value: unknown): Issue[] {
  return [...run(auditValidator, value), ...forbidden(value)];
}

export function validateView(value: unknown): Issue[] {
  return [...run(viewValidator, value), ...forbidden(value)];
}

/** Stored state must be whole. A bad grant or a gap in the log is refused, never repaired. */
export function assertValidState(state: GrantState): void {
  const bad =
    !state ||
    !Array.isArray(state.grants) ||
    !Array.isArray(state.audit) ||
    state.grants.some((grant) => validateGrant(grant).length > 0) ||
    state.audit.some((entry, index) => validateAuditEntry(entry).length > 0 || entry.seq !== index + 1);
  if (bad) throw new Error("caregiver_state_invalid");
}

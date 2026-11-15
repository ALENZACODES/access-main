import Ajv2020 from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";
import auditSchema from "../schemas/audit-entry.schema.json";
import recordSchema from "../schemas/consent-record.schema.json";
import purposeSchema from "../schemas/purpose.schema.json";
import revocationSchema from "../schemas/revocation.schema.json";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
const purposeValidator = ajv.compile(purposeSchema);
const recordValidator = ajv.compile(recordSchema);
const revocationValidator = ajv.compile(revocationSchema);
const auditValidator = ajv.compile(auditSchema);

export const SCHEMAS = {
  purpose: purposeSchema,
  consentRecord: recordSchema,
  revocation: revocationSchema,
  auditEntry: auditSchema,
} as const;

function describe(error: ErrorObject): string {
  const where = error.instancePath || "/";
  const extra = error.keyword === "additionalProperties" ? ` (${String(error.params.additionalProperty)})` : "";
  return `${where} ${error.message ?? "is invalid"}${extra}`;
}

function run(validate: ValidateFunction, value: unknown): ValidationResult {
  const valid = validate(value) as boolean;
  return { valid, errors: valid ? [] : (validate.errors ?? []).map(describe) };
}

export const validatePurpose = (value: unknown): ValidationResult => run(purposeValidator, value);
export const validateConsentRecord = (value: unknown): ValidationResult => run(recordValidator, value);
export const validateRevocation = (value: unknown): ValidationResult => run(revocationValidator, value);
export const validateAuditEntry = (value: unknown): ValidationResult => run(auditValidator, value);

/** Validates a consent record or a revocation by its record_type. */
export function validateConsentEvent(value: unknown): ValidationResult {
  const type = typeof value === "object" && value !== null ? (value as { record_type?: unknown }).record_type : undefined;
  if (type === "consent_record") return validateConsentRecord(value);
  if (type === "consent_revocation") return validateRevocation(value);
  return { valid: false, errors: ["/record_type must be consent_record or consent_revocation"] };
}

/**
 * French typography check. U+00A0 goes before : ; ? ! and inside « ».
 * Returns a short description for each place that breaks the rule.
 */
export function frenchTypographyIssues(text: string): string[] {
  const issues: string[] = [];
  const checks: Array<[RegExp, string]> = [
    [/ [:;?!»]/g, "regular space before : ; ? ! or »"],
    [/« /g, "regular space after «"],
    [/\S:(?=\s|$)/g, "missing no-break space before :"],
    [/[^\s\u00a0;?!][;?!]/g, "missing no-break space before ; ? or !"],
    [/«(?!\u00a0)/g, "missing no-break space after «"],
    [/(?<!\u00a0)»/g, "missing no-break space before »"],
  ];
  for (const [pattern, label] of checks) {
    if (pattern.test(text)) issues.push(label);
  }
  return issues;
}

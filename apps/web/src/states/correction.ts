/**
 * Suggest-a-correction form model. A suggestion is a report from a person; it is queued
 * on the device and never changes the details the App shows. Contact details are
 * optional, stored only when the person consents, and never logged.
 */
import { FEATURE_IDS, type FeatureId, type Reported } from "./dataStatus";
import { isPlaceId } from "./placeRecord";
import type { MessageId } from "./messages";

export type SuggestedValue = Reported | "unknown";
export const SUGGESTED_VALUES: readonly SuggestedValue[] = ["yes", "no", "partial", "unknown"];

export const MAX_NOTE_LENGTH = 500;
export const MAX_EMAIL_LENGTH = 254;

export type CorrectionField = "place" | "feature" | "suggested" | "note" | "contact" | "consent";

export interface CorrectionValues {
  readonly placeId: string;
  readonly feature: string;
  readonly suggested: string;
  readonly note: string;
  readonly contact: string;
  readonly consent: boolean;
}

export type FieldErrors = Partial<Record<CorrectionField, MessageId>>;

export const FIELD_ORDER: readonly CorrectionField[] = ["place", "feature", "suggested", "note", "contact", "consent"];

export const FIELD_ERROR_MESSAGES: Readonly<Record<CorrectionField, MessageId>> = {
  place: "report.err.place",
  feature: "report.err.feature",
  suggested: "report.err.suggested",
  note: "report.err.note",
  contact: "report.err.contact",
  consent: "report.err.consent",
};

export type CorrectionResult =
  | { readonly ok: true; readonly value: CorrectionValues & { readonly feature: FeatureId; readonly suggested: SuggestedValue } }
  | { readonly ok: false; readonly values: CorrectionValues; readonly errors: FieldErrors };

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(s: string | undefined): string {
  return (s ?? "").replace(CONTROL, "").trim();
}

export function isTruthyForm(v: string | undefined): boolean {
  return v === "on" || v === "1" || v === "true";
}

export function validateCorrection(
  raw: Readonly<Record<string, string | undefined>>,
  knownPlaceIds: ReadonlySet<string>,
): CorrectionResult {
  const values: CorrectionValues = {
    placeId: clean(raw.placeId),
    feature: clean(raw.feature),
    suggested: clean(raw.suggested),
    note: clean(raw.note),
    contact: clean(raw.contact),
    consent: isTruthyForm(raw.consent),
  };
  const errors: FieldErrors = {};
  const fail = (f: CorrectionField): void => void (errors[f] = FIELD_ERROR_MESSAGES[f]);

  if (!isPlaceId(values.placeId) || !knownPlaceIds.has(values.placeId)) fail("place");
  if (!(FEATURE_IDS as readonly string[]).includes(values.feature)) fail("feature");
  if (!(SUGGESTED_VALUES as readonly string[]).includes(values.suggested)) fail("suggested");
  if (values.note.length > MAX_NOTE_LENGTH) fail("note");
  if (values.contact !== "") {
    if (values.contact.length > MAX_EMAIL_LENGTH || !EMAIL.test(values.contact)) fail("contact");
    else if (!values.consent) fail("consent");
  }
  if (Object.keys(errors).length > 0) return { ok: false, values, errors };
  return { ok: true, value: values as CorrectionValues & { feature: FeatureId; suggested: SuggestedValue } };
}

export interface Submission {
  readonly id: string;
  readonly createdOn: string;
  readonly status: "pending" | "rejected";
  readonly attempts: number;
  /** Epoch milliseconds before which a retry should not be attempted; 0 means now. */
  readonly nextAttemptAt: number;
  readonly payload: {
    readonly placeId: string;
    readonly feature: FeatureId;
    readonly suggested: SuggestedValue;
    readonly note: string;
    readonly contact: string | null;
  };
}

const SUBMISSION_ID = /^[a-zA-Z0-9-]{8,64}$/;
export const isSubmissionId = (s: unknown): s is string => typeof s === "string" && SUBMISSION_ID.test(s);

export function buildSubmission(
  v: Extract<CorrectionResult, { ok: true }>["value"],
  meta: { readonly id: string; readonly createdOn: string },
): Submission {
  if (!isSubmissionId(meta.id)) throw new Error("Invalid submission id");
  return {
    id: meta.id,
    createdOn: meta.createdOn,
    status: "pending",
    attempts: 0,
    nextAttemptAt: 0,
    payload: {
      placeId: v.placeId,
      feature: v.feature,
      suggested: v.suggested,
      note: v.note,
      // contact is kept only with consent
      contact: v.contact !== "" && v.consent ? v.contact : null,
    },
  };
}

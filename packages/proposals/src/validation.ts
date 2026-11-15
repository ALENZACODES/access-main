import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "./schema.json";
import type { UnverifiedDraft } from "./types";

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);

const validate = ajv.compile<UnverifiedDraft>(schema);

export function isUnverifiedDraft(
  value: unknown,
): value is UnverifiedDraft {
  if (!validate(value)) return false;

  const draft = value as UnverifiedDraft;

  if (
    draft.status === "accepted" &&
    (!draft.personNote?.trim() || !draft.reviewedAt || !draft.source)
  ) {
    return false;
  }

  if (
    draft.status === "rejected" &&
    (!draft.rejectionReason?.trim() || !draft.reviewedAt)
  ) {
    return false;
  }

  if (
    draft.status === "pending" &&
    (draft.personNote !== undefined ||
      draft.rejectionReason !== undefined ||
      draft.reviewedAt !== undefined)
  ) {
    return false;
  }

  return true;
}

export function assertUnverifiedDraft(
  value: unknown,
): asserts value is UnverifiedDraft {
  if (!isUnverifiedDraft(value)) {
    throw new Error("Invalid unverified draft");
  }
}

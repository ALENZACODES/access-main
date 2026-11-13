import type { FieldIssue } from "./provenance.ts";

/**
 * One directory contract, shared with access-tools `packages/navigator`
 * at 06c9d4b.
 *
 * The record is `directory-record-1.0.0` and carries
 * `verificationTier: "administrator_page"`. That field is not a second tier
 * list. A stored copy uses canonical provenance tier `E`.
 *
 * `directory-record-1.1.0` and a payload field named `tier` are not this
 * contract. The fact-shaped benefits record stays in packages/schema.
 * A directory link is not an eligibility decision.
 */
export const DIRECTORY_SCHEMA_VERSION = "directory-record-1.0.0";

export const DIRECTORY_CATEGORIES = ["benefits", "funding", "equipment", "employment", "housing", "services"] as const;
export type DirectoryCategory = (typeof DIRECTORY_CATEGORIES)[number];

export const DIRECTORY_GEOGRAPHIES = [
  "canada",
  "ontario",
  "toronto",
  "london",
  "hamilton",
  "thunder_bay",
  "sudbury",
] as const;
export type DirectoryGeography = (typeof DIRECTORY_GEOGRAPHIES)[number];

export const DIRECTORY_CONTEXTS = ["newly_injured", "rehabilitation", "early_community", "long_term", "any"] as const;
export type DirectoryReadingContext = (typeof DIRECTORY_CONTEXTS)[number];

export interface DirectoryText {
  en: string;
  fr: string;
}

export interface DirectoryFigure {
  statement: DirectoryText;
  qualifier: DirectoryText;
  sourceUrls: string[];
  retrievedOn: string;
}

export interface DirectoryRecord {
  schemaVersion: typeof DIRECTORY_SCHEMA_VERSION;
  id: string;
  category: DirectoryCategory;
  topics: string[];
  readingContexts: DirectoryReadingContext[];
  name: DirectoryText;
  administrator: DirectoryText;
  geography: DirectoryGeography;
  summary: DirectoryText;
  doesNot?: DirectoryText;
  officialUrl: string;
  frenchOfficialUrl?: string;
  phone?: string;
  phoneNote?: DirectoryText;
  figure?: DirectoryFigure;
  sourceName: string;
  retrievedOn: string;
  nextReviewOn: string;
  verificationTier: "administrator_page";
  verificationPlain: DirectoryText;
  neverMeans: DirectoryText;
  licenceNote: DirectoryText;
  notEligibilityAdvice: true;
  framing: DirectoryText;
  placeFacts?: "none";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is DirectoryText {
  if (!isRecord(value)) return false;
  return typeof value.en === "string" && value.en.trim().length > 0 && typeof value.fr === "string" && value.fr.trim().length > 0;
}

function isMember(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === "string" && allowed.includes(value);
}

export function validateDirectoryRecord(value: unknown): FieldIssue[] {
  if (!isRecord(value)) return [{ field: "payload", code: "invalid_directory" }];
  const issues: FieldIssue[] = [];
  if (value.schemaVersion !== DIRECTORY_SCHEMA_VERSION) issues.push({ field: "payload.schemaVersion", code: "invalid_directory" });
  if (typeof value.id !== "string" || !value.id.trim()) issues.push({ field: "payload.id", code: "missing_id" });
  if (!isMember(value.category, DIRECTORY_CATEGORIES)) issues.push({ field: "payload.category", code: "invalid_enum" });
  if (!Array.isArray(value.topics) || value.topics.some((topic) => typeof topic !== "string")) {
    issues.push({ field: "payload.topics", code: "invalid_directory" });
  }
  if (
    !Array.isArray(value.readingContexts) ||
    value.readingContexts.some((context) => !isMember(context, DIRECTORY_CONTEXTS))
  ) {
    issues.push({ field: "payload.readingContexts", code: "invalid_enum" });
  }
  if (!isText(value.name)) issues.push({ field: "payload.name", code: "invalid_directory" });
  if (!isText(value.administrator)) issues.push({ field: "payload.administrator", code: "invalid_directory" });
  if (!isMember(value.geography, DIRECTORY_GEOGRAPHIES)) issues.push({ field: "payload.geography", code: "invalid_enum" });
  if (!isText(value.summary)) issues.push({ field: "payload.summary", code: "invalid_directory" });
  if (typeof value.officialUrl !== "string" || !value.officialUrl.startsWith("https://")) {
    issues.push({ field: "payload.officialUrl", code: "invalid_url" });
  }
  if (value.frenchOfficialUrl !== undefined && (typeof value.frenchOfficialUrl !== "string" || !value.frenchOfficialUrl.startsWith("https://"))) {
    issues.push({ field: "payload.frenchOfficialUrl", code: "invalid_url" });
  }
  if (typeof value.sourceName !== "string" || !value.sourceName.trim()) {
    issues.push({ field: "payload.sourceName", code: "missing_source" });
  }
  if (typeof value.retrievedOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.retrievedOn)) {
    issues.push({ field: "payload.retrievedOn", code: "invalid_date" });
  }
  if (value.verificationTier !== "administrator_page") {
    issues.push({ field: "payload.verificationTier", code: "invalid_tier" });
  }
  if ("tier" in value) {
    issues.push({ field: "payload.tier", code: "invalid_tier" });
  }
  if (value.notEligibilityAdvice !== true) issues.push({ field: "payload.notEligibilityAdvice", code: "eligibility_advice" });
  for (const field of ["verificationPlain", "neverMeans", "licenceNote", "framing"] as const) {
    if (!isText(value[field])) issues.push({ field: `payload.${field}`, code: "invalid_directory" });
  }
  if (value.placeFacts !== undefined && value.placeFacts !== "none") {
    issues.push({ field: "payload.placeFacts", code: "invalid_enum" });
  }
  return issues;
}

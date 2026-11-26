import Ajv2020 from "ajv/dist/2020.js";

export const licences = ["CC BY 4.0", "CC BY-SA 4.0"] as const;
export type Licence = (typeof licences)[number];
export const COMMUNITY_TIER = "community-reported (tier 1, unreviewed)" as const;

export interface Change {
  value: string | number | boolean | "UNKNOWN";
  unit?: string;
}
export interface PhotoReference {
  id: string;
  name: string;
  licence: Licence;
  mime: "image/jpeg";
}
export interface Draft {
  version: 1;
  id: string;
  target: string;
  kind: "new-place" | "correction" | "audit";
  observed: string;
  changes: Record<string, Change>;
  note: string;
  event?: string;
  photos: PhotoReference[];
  tier: typeof COMMUNITY_TIER;
}

export const draftSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["version", "id", "target", "kind", "observed", "changes", "note", "photos", "tier"],
  properties: {
    version: { const: 1 },
    id: { type: "string", minLength: 1, maxLength: 100 },
    target: { type: "string", minLength: 1, maxLength: 200 },
    kind: { enum: ["new-place", "correction", "audit"] },
    observed: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    note: { type: "string", maxLength: 5000 },
    event: { type: "string", minLength: 1, maxLength: 150 },
    tier: { const: COMMUNITY_TIER },
    changes: {
      type: "object", minProperties: 1, maxProperties: 100,
      propertyNames: { pattern: "^[a-z][a-z0-9_]{0,79}$" },
      additionalProperties: {
        type: "object", additionalProperties: false, required: ["value"],
        properties: {
          value: { anyOf: [{ type: "string", maxLength: 1000 }, { type: "number" }, { type: "boolean" }] },
          unit: { type: "string", minLength: 1, maxLength: 40 },
        },
      },
    },
    photos: {
      type: "array", maxItems: 20, items: {
        type: "object", additionalProperties: false, required: ["id", "name", "licence", "mime"],
        properties: {
          id: { type: "string", minLength: 1, maxLength: 100 },
          name: { type: "string", minLength: 1, maxLength: 200 },
          licence: { enum: licences },
          mime: { const: "image/jpeg" },
        },
      },
    },
  },
} as const;

const ajv = new Ajv2020({ allErrors: true });
const check = ajv.compile(draftSchema);
const forbidden = /^(diagnosis|injurylevel|ais|aisgrade|completeness|bladder|bowel|prescription|medication|medications|healthcard|ohip|locationhistory|password|token|apikey|secret)$/i;

export function isPrivateChangeKey(key: string): boolean {
  return forbidden.test(key.replace(/_/g, ""));
}

export function validateDraft(input: unknown): input is Draft {
  if (!check(input)) return false;
  const d = input as Draft;
  if (d.kind === "new-place" ? d.target !== "new place" : d.target === "new place") return false;
  if (Number.isNaN(Date.parse(`${d.observed}T00:00:00Z`)) || new Date(`${d.observed}T00:00:00Z`).toISOString().slice(0, 10) !== d.observed) return false;
  if (d.observed > new Date().toISOString().slice(0, 10)) return false;
  return !Object.keys(d.changes).some(isPrivateChangeKey);
}

export function assertDraft(input: unknown): asserts input is Draft {
  if (!validateDraft(input)) throw new Error("Invalid contribution draft");
}

export function makeDraft(): Draft {
  return {
    version: 1, id: crypto.randomUUID(), target: "new place", kind: "new-place",
    observed: new Date().toISOString().slice(0, 10), changes: {}, note: "", photos: [], tier: COMMUNITY_TIER,
  };
}

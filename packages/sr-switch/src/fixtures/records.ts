import Ajv from "ajv/dist/2020.js";

/** All entries here are invented UI specimens, not observations of actual places. */
export interface DemoRecord {
  id: "recordOne" | "recordTwo";
  source: string | null;
  licence: string | null;
  date: string | null;
  tier: 0 | 1 | null;
  prototypeLabel: "PROTOTYPE-UNVERIFIED" | "SEEDED-OPEN-DATA" | null;
}

const schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["id", "source", "licence", "date", "tier", "prototypeLabel"],
    properties: {
      id: { enum: ["recordOne", "recordTwo"] },
      source: { type: ["string", "null"] },
      licence: { type: ["string", "null"] },
      date: { anyOf: [{ type: "string", format: "date" }, { type: "null" }] },
      tier: { enum: [0, 1, null] },
      prototypeLabel: { enum: ["PROTOTYPE-UNVERIFIED", "SEEDED-OPEN-DATA", null] },
    },
    allOf: [
      { if: { properties: { tier: { const: null } } }, then: { properties: { prototypeLabel: { const: null } } } },
      { if: { properties: { prototypeLabel: { const: "SEEDED-OPEN-DATA" } } }, then: { properties: { tier: { const: 0 } } } },
    ],
  },
} as const;

// Ajv's core 2020 build does not include a date format plugin; check ISO dates below.
const ajv = new Ajv({ strict: true, validateFormats: false });
const validate = ajv.compile(schema);

export function validateDemoRecords(value: unknown): value is DemoRecord[] {
  if (!validate(value)) return false;
  return (value as DemoRecord[]).every((record) =>
    record.date === null || /^\d{4}-\d{2}-\d{2}$/.test(record.date) &&
      !Number.isNaN(Date.parse(`${record.date}T00:00:00Z`)) &&
      new Date(`${record.date}T00:00:00Z`).toISOString().slice(0, 10) === record.date,
  );
}

const fixtures: DemoRecord[] = [
  {
    id: "recordOne",
    source: "demoSource",
    licence: "demoLicence",
    date: "2026-11-15",
    tier: 0,
    prototypeLabel: "PROTOTYPE-UNVERIFIED",
  },
  { id: "recordTwo", source: null, licence: null, date: null, tier: null, prototypeLabel: null },
];
if (!validateDemoRecords(fixtures)) throw new Error("Invalid demonstration fixtures");
export const records: readonly DemoRecord[] = fixtures;

import { FIELD_FACT_ID, PROVENANCE_ID, canonicalSchemaId } from "./catalog/index.js";
import { UNKNOWN_TOKENS, type FieldDef, type RecordDef, type ValueKind } from "./catalog/types.js";

export function fieldFactSchema(): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: FIELD_FACT_ID,
    title: "FieldFact",
    description:
      "One field value with source, licence, retrieval date, and verification tier. unknown and UNKNOWN mean the source did not state the fact. They are not zeroes and they do not count unless tri_state_observation is true and method, observed_at, and source are present.",
    type: "object",
    additionalProperties: false,
    required: ["value", "source_id", "licence", "retrieved_at", "tier"],
    properties: {
      value: {
        description: "Published value, an unparsed source token, or an explicit unknown token.",
        anyOf: [
          { type: "string" },
          { type: "number" },
          { type: "boolean" },
          { type: "array", items: { type: "string" }, minItems: 1 },
          {
            type: "array",
            minItems: 1,
            items: {
              type: "array",
              prefixItems: [{ type: "number" }, { type: "number" }],
              items: false,
              minItems: 2,
              maxItems: 2,
            },
          },
        ],
      },
      unit: {
        anyOf: [{ enum: ["mm", "m", "kg", "percent", "degrees", "ratio"] }, { type: "null" }],
      },
      method: { type: ["string", "null"] },
      observed_at: { type: "string", format: "date" },
      source_id: { type: "string", minLength: 1 },
      licence: { type: "string", minLength: 1 },
      retrieved_at: { type: "string", format: "date" },
      tier: { enum: [0, 1, 2, 3, 4, "E"] },
      source_name: { type: "string", minLength: 1 },
      source_key: { type: "string" },
      import_field: {
        type: "string",
        description: "access-maps field name when this fact was migrated. Not a separate piece.",
      },
      raw: { anyOf: [{ type: "string" }, { type: "number" }, { type: "null" }] },
      derived: { type: "boolean" },
      tri_state_observation: {
        type: "boolean",
        description: "True only when unknown itself was observed and recorded with method and date.",
      },
      evidence: { $ref: "#/$defs/evidence" },
    },
    allOf: [
      {
        if: {
          properties: { tier: { const: 3 } },
          required: ["tier"],
        },
        then: {
          required: ["evidence", "method", "observed_at"],
          properties: {
            evidence: {
              required: ["protocol_version", "verifier_role", "method", "observed_at"],
              properties: {
                protocol_version: true,
                verifier_role: true,
                method: true,
                observed_at: true,
              },
            },
            method: true,
            observed_at: true,
          },
        },
      },
      {
        if: {
          properties: { tri_state_observation: { const: true } },
          required: ["tri_state_observation"],
        },
        then: {
          required: ["method", "observed_at", "source_id"],
          properties: { method: true, observed_at: true, source_id: true },
        },
      },
    ],
    $defs: {
      evidence: {
        type: "object",
        additionalProperties: false,
        required: ["protocol_version", "verifier_role", "method", "observed_at"],
        properties: {
          protocol_version: { type: "string", minLength: 1 },
          verifier_role: {
            enum: ["trained_verifier", "peer", "operator", "importer", "desk_reviewer"],
          },
          method: { type: "string", minLength: 1 },
          observed_at: { type: "string", format: "date" },
          photo_ids: { type: "array", items: { type: "string", minLength: 1 } },
        },
      },
    },
  };
}

export function provenanceSchema(): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: PROVENANCE_ID,
    title: "Provenance",
    description:
      "Record-level source, licence, dates, and tier. Tier 3 and the prototype label VERIFIED require evidence. A prototype record cannot carry VERIFIED or tier 3.",
    type: "object",
    additionalProperties: false,
    required: ["tier", "source_name", "source_id", "source_date", "record_date", "licence_id", "retrieved_at"],
    properties: {
      tier: { enum: [0, 1, 2, 3, 4, "E"] },
      prototype_label: {
        enum: ["PROTOTYPE-UNVERIFIED", "SEEDED-OPEN-DATA", "COMMUNITY-REPORTED", "VERIFIED"],
      },
      source_name: { type: "string", minLength: 1 },
      source_id: { type: "string", minLength: 1 },
      source_date: { type: "string", format: "date" },
      record_date: { type: "string", format: "date" },
      licence_id: { type: "string", minLength: 1 },
      retrieved_at: { type: "string", format: "date" },
      evidence: {
        type: "object",
        additionalProperties: false,
        required: ["protocol_version", "verifier_role", "method", "observed_at"],
        properties: {
          protocol_version: { type: "string", minLength: 1 },
          verifier_role: { enum: ["trained_verifier", "peer", "operator", "importer", "desk_reviewer"] },
          method: { type: "string", minLength: 1 },
          observed_at: { type: "string", format: "date" },
          photo_ids: { type: "array", items: { type: "string", minLength: 1 } },
        },
      },
    },
    allOf: [
      {
        if: { properties: { tier: { const: 3 } }, required: ["tier"] },
        then: {
          required: ["evidence"],
          properties: {
            evidence: {
              required: ["protocol_version", "verifier_role", "method", "observed_at"],
              properties: {
                protocol_version: true,
                verifier_role: true,
                method: true,
                observed_at: true,
              },
            },
          },
        },
      },
      {
        if: { properties: { prototype_label: { const: "VERIFIED" } }, required: ["prototype_label"] },
        then: {
          required: ["evidence"],
          properties: { evidence: true, tier: { const: 3 } },
        },
      },
      {
        if: { properties: { prototype_label: { const: "SEEDED-OPEN-DATA" } }, required: ["prototype_label"] },
        then: { properties: { tier: { const: 0 } } },
      },
      {
        if: { properties: { prototype_label: { const: "COMMUNITY-REPORTED" } }, required: ["prototype_label"] },
        then: { properties: { tier: { const: 2 } } },
      },
      {
        if: {
          properties: { prototype_label: { const: "PROTOTYPE-UNVERIFIED" } },
          required: ["prototype_label"],
        },
        then: { properties: { tier: { enum: [0, 1] } } },
      },
    ],
  };
}

function unknownEnum(values: string[]): Record<string, unknown> {
  return { enum: [...values, ...UNKNOWN_TOKENS] };
}

function factValueSchema(value: ValueKind): Record<string, unknown> {
  switch (value.type) {
    case "string":
    case "url":
      return { anyOf: [{ type: "string" }, { enum: [...UNKNOWN_TOKENS] }] };
    case "number":
      return { anyOf: [{ type: "number" }, { type: "string" }, { enum: [...UNKNOWN_TOKENS] }] };
    case "measurement":
      return { anyOf: [{ type: "number" }, { type: "string" }, { enum: [...UNKNOWN_TOKENS] }] };
    case "boolean":
      return { anyOf: [{ type: "boolean" }, { enum: [...UNKNOWN_TOKENS] }] };
    case "enum":
      return unknownEnum(value.values);
    case "string_array":
      return {
        anyOf: [{ type: "array", items: { type: "string" }, minItems: 1 }, { enum: [...UNKNOWN_TOKENS] }],
      };
    case "date":
    case "timestamp":
      return { anyOf: [{ type: "string", minLength: 1 }, { enum: [...UNKNOWN_TOKENS] }] };
    case "id_array":
      return { type: "array", items: { type: "string" } };
    default:
      return { type: "string" };
  }
}

function measurementAllOf(field: FieldDef): unknown[] {
  if (field.value?.type !== "measurement") return [];
  const unit = field.value.unit;
  return [
    {
      if: {
        properties: { value: { type: "number" } },
        required: ["value"],
      },
      then: {
        required: ["unit"],
        properties: { unit: { const: unit } },
      },
    },
  ];
}

function factProperty(field: FieldDef): Record<string, unknown> {
  const valueSchema = field.value ? factValueSchema(field.value) : { type: "string" };
  const narrowed: Record<string, unknown> = {
    description: field.description,
    properties: { value: valueSchema },
  };
  const extra = measurementAllOf(field);
  if (extra.length > 0) narrowed.allOf = extra;
  return {
    allOf: [{ $ref: FIELD_FACT_ID }, narrowed],
  };
}

function envelopeProperty(field: FieldDef): Record<string, unknown> {
  const schema: Record<string, unknown> = { description: field.description };
  if (!field.value) {
    schema.type = "string";
    return schema;
  }
  switch (field.value.type) {
    case "string":
    case "url":
      schema.type = "string";
      break;
    case "number":
    case "measurement":
      schema.type = "number";
      break;
    case "boolean":
      schema.type = "boolean";
      break;
    case "enum":
      schema.enum = field.value.values;
      break;
    case "date":
      schema.type = "string";
      schema.format = "date";
      break;
    case "timestamp":
      schema.type = "string";
      schema.format = "date-time";
      break;
    case "string_array":
    case "id_array":
      schema.type = "array";
      schema.items = { type: "string" };
      break;
    default:
      schema.type = "string";
  }
  return schema;
}

function privilegeRule(): unknown {
  return {
    if: {
      type: "object",
      required: ["facts"],
      properties: {
        facts: {
          type: "object",
          required: ["privilege_details"],
          properties: {
            privilege_details: {
              type: "object",
              required: ["value"],
              properties: {
                value: { not: { enum: ["unknown", "UNKNOWN", ""] } },
              },
            },
          },
        },
      },
    },
    then: {
      properties: {
        facts: {
          type: "object",
          required: ["privilege_municipality", "privilege_source"],
          properties: {
            privilege_municipality: {
              type: "object",
              required: ["value"],
              properties: { value: { not: { enum: ["unknown", "UNKNOWN", ""] } } },
            },
            privilege_source: {
              type: "object",
              required: ["value"],
              properties: { value: { not: { enum: ["unknown", "UNKNOWN", ""] } } },
            },
          },
        },
      },
    },
  };
}

function washroomTier3Photos(): unknown {
  return {
    if: {
      type: "object",
      required: ["provenance"],
      properties: { provenance: { type: "object", required: ["tier"], properties: { tier: { const: 3 } } } },
    },
    then: {
      properties: {
        provenance: {
          type: "object",
          required: ["evidence"],
          properties: {
            evidence: {
              type: "object",
              required: ["photo_ids"],
              properties: { photo_ids: { type: "array", minItems: 1, items: { type: "string" } } },
            },
          },
        },
      },
    },
  };
}

export function recordSchema(record: RecordDef): Record<string, unknown> {
  const factFields = record.fields.filter((field) => field.placement === "facts");
  const envelopeFields = record.fields.filter((field) => field.placement === "envelope");
  const factProperties: Record<string, unknown> = {};
  for (const field of factFields) factProperties[field.property] = factProperty(field);
  const envelopeProperties: Record<string, unknown> = {};
  for (const field of envelopeFields) envelopeProperties[field.property] = envelopeProperty(field);
  envelopeProperties.schema_version = { const: record.schemaVersion, description: "Schema version. Does not count." };

  const publishedRequired = factFields.filter((field) => field.requirement === "required").map((field) => field.property);

  const allOf: unknown[] = [
    {
      if: {
        properties: { publication_context: { const: "prototype" } },
        required: ["publication_context"],
      },
      then: {
        properties: {
          provenance: {
            type: "object",
            required: ["prototype_label"],
            properties: {
              prototype_label: { enum: ["PROTOTYPE-UNVERIFIED", "SEEDED-OPEN-DATA"] },
              tier: { enum: [0, 1] },
            },
          },
        },
      },
    },
  ];
  if (publishedRequired.length > 0) {
    allOf.push({
      if: {
        properties: { record_status: { const: "published" } },
        required: ["record_status"],
      },
      then: {
        properties: {
          facts: {
            type: "object",
            required: publishedRequired,
            properties: Object.fromEntries(publishedRequired.map((name) => [name, true])),
          },
        },
      },
    });
  }
  if (envelopeFields.some((field) => field.property === "place_id")) {
    allOf.push({
      if: {
        properties: { record_status: { const: "published" } },
        required: ["record_status"],
      },
      then: { required: ["place_id"], properties: { place_id: true } },
    });
  }
  if (record.recordType === "parking") allOf.push(privilegeRule());
  if (record.recordType === "washroom") allOf.push(washroomTier3Photos());

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: canonicalSchemaId(record.recordType),
    title: record.title,
    description: `${record.description} ${record.planRef}.`,
    type: "object",
    additionalProperties: false,
    required: [
      "record_type",
      "schema_version",
      "id",
      "record_status",
      "publication_context",
      "provenance",
      ...(envelopeFields.some((field) => field.property === "asset_id") ? ["asset_id"] : []),
    ],
    properties: {
      record_type: { const: record.recordType },
      example: {
        type: "boolean",
        description: "True on a synthetic fixture. The counter excludes example records from the headline.",
      },
      publication_context: { enum: ["canonical", "prototype"] },
      provenance: { $ref: PROVENANCE_ID },
      ...envelopeProperties,
      facts: {
        type: "object",
        additionalProperties: false,
        properties: factProperties,
        description: "Plan fields. Absent means not collected. unknown means collected as unknown.",
      },
      imported_facts: {
        type: "object",
        additionalProperties: { $ref: FIELD_FACT_ID },
        description:
          "Original access-maps keys that have no safe canonical rename. Counted once. Not a second copy of facts.",
      },
    },
    allOf,
  };
}

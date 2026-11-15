import type { OutboxItem as SharedOutboxItem } from "@access/shared";

/**
 * Ajv JSON Schema for an on-device correction report. This is the source of
 * truth for the TypeScript type below. Reports stay on the device; this
 * prototype never uploads them.
 */
export const outboxItemSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "created_at",
    "kind",
    "based_on_record_id",
    "note",
    "observed_at",
    "made_offline",
    "status",
  ],
  properties: {
    id: { type: "string", minLength: 1 },
    created_at: { type: "string", format: "date-time" },
    kind: { const: "correction-report" },
    based_on_record_id: { type: ["string", "null"] },
    note: { type: "string", minLength: 1, maxLength: 500 },
    observed_at: { type: "string", format: "date-time" },
    made_offline: { type: "boolean" },
    status: { const: "queued-on-device" },
  },
} as const;

type OutboxProperties = typeof outboxItemSchema.properties;

type SchemaPropType<P> = P extends { const: infer C }
  ? C
  : P extends { type: "boolean" }
    ? boolean
    : P extends { type: readonly ["string", "null"] }
      ? string | null
      : P extends { type: "string" }
        ? string
        : never;

/** Derived from `outboxItemSchema`, including kind, based_on_record_id, and queued-on-device status. */
export type OutboxItem = {
  -readonly [K in keyof OutboxProperties]: SchemaPropType<OutboxProperties[K]>;
};

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const sharedMatchesSchema: Equal<OutboxItem, SharedOutboxItem> = true;
void sharedMatchesSchema;

const defaults: OutboxItem = {
  id: "demo-note",
  created_at: "2026-01-01T00:00:00Z",
  kind: outboxItemSchema.properties.kind.const,
  based_on_record_id: "demo-record",
  note: "Demonstration correction only",
  observed_at: "2026-01-01T00:00:00Z",
  made_offline: false,
  status: outboxItemSchema.properties.status.const,
};

/** Build a complete on-device report. Tests and fixtures must go through this helper. */
export function outboxItem(overrides: Partial<OutboxItem> = {}): OutboxItem {
  return { ...defaults, ...overrides };
}

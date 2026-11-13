import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RECORDS } from "../src/catalog/index.js";
import { fieldFactSchema, provenanceSchema, recordSchema } from "../src/schema-build.js";
import { flatSchemas, freshnessPolicyDocument, freshnessPolicySchema } from "../src/flat-schemas.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaDir = path.join(root, "schema");

function write(relative: string, value: unknown): void {
  const file = path.join(schemaDir, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

write("common/field-fact.schema.json", fieldFactSchema());
write("common/provenance.schema.json", provenanceSchema());
for (const record of RECORDS) {
  write(`canonical/${record.recordType}.schema.json`, recordSchema(record));
}

const catalog = RECORDS.map((record) => ({
  recordType: record.recordType,
  schemaVersion: record.schemaVersion,
  shape: record.shape,
  counting: record.counting,
  planRef: record.planRef,
  fields: record.fields,
}));
write("catalog.json", { records: catalog });
for (const [relative, value] of Object.entries(flatSchemas())) write(relative, value);
write("common/freshness-policy.schema.json", freshnessPolicySchema());
write("freshness-policy.json", freshnessPolicyDocument());

console.log(`emitted ${RECORDS.length} canonical schemas`);

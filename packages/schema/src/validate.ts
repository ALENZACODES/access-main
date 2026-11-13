import { createRequire } from "node:module";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { Ajv2020, type ErrorObject, type Plugin, type ValidateFunction } from "ajv/dist/2020.js";

const require = createRequire(import.meta.url);
const addFormats = require("ajv-formats") as Plugin<string[] | { keywords?: boolean }>;
import { canonicalSchemaId, IMPORT_SCHEMA_IDS } from "./catalog/index.js";
import { schemaDir } from "./paths.js";

export interface ValidationIssue {
  instancePath: string;
  message: string;
  schemaPath: string;
}

export interface ValidationResult {
  ok: boolean;
  schemaId: string;
  errors: ValidationIssue[];
}

export class SchemaValidator {
  private readonly ajv: Ajv2020;
  private readonly byId = new Map<string, ValidateFunction>();

  constructor(directory = schemaDir()) {
    // strictTypes rejects if/then branches that narrow an object the parent schema already types.
    this.ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false });
    addFormats(this.ajv);
    const ids: string[] = [];
    for (const file of walk(directory)) {
      if (!file.endsWith(".schema.json")) continue;
      const schema = JSON.parse(readFileSync(file, "utf8")) as { $id?: string };
      if (!schema.$id) throw new Error(`schema has no $id: ${file}`);
      this.ajv.addSchema(schema);
      ids.push(schema.$id);
    }
    for (const id of ids) {
      const validate = this.ajv.getSchema(id);
      if (!validate) throw new Error(`schema did not compile: ${id}`);
      this.byId.set(id, validate);
    }
  }

  schemaIds(): string[] {
    return [...this.byId.keys()].sort();
  }

  validate(schemaId: string, data: unknown): ValidationResult {
    const validate = this.byId.get(schemaId);
    if (!validate) {
      return { ok: false, schemaId, errors: [{ instancePath: "", message: `unknown schema ${schemaId}`, schemaPath: "" }] };
    }
    const ok = validate(data) === true;
    return { ok, schemaId, errors: ok ? [] : formatErrors(validate.errors) };
  }

  /** Pick the schema from the record shape. Import records keep their access-maps schema ids. */
  validateDetected(data: unknown): ValidationResult {
    const schemaId = detectSchemaId(data);
    if (!schemaId) {
      return {
        ok: false,
        schemaId: "",
        errors: [{ instancePath: "", message: "no schema matches this record", schemaPath: "" }],
      };
    }
    return this.validate(schemaId, data);
  }
}

export function detectSchemaId(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (row.tranche === "venue") return IMPORT_SCHEMA_IDS.venue;
  if (row.tranche === "washroom") return IMPORT_SCHEMA_IDS.washroom;
  if (row.tranche === "path") return IMPORT_SCHEMA_IDS.path;
  if (row.tranche === "transit") return IMPORT_SCHEMA_IDS.transit;
  if (typeof row.record_type === "string") {
    if (row.record_type === "game_definition") return canonicalSchemaId("game-definition");
    if (row.record_type === "game_session") return canonicalSchemaId("game-session");
    if (row.record_type === "user_profile") return canonicalSchemaId("user-profile");
    if (row.record_type === "city_skeleton") return canonicalSchemaId("city-skeleton");
    if (row.record_type === "correction_report") return canonicalSchemaId("correction-report");
    return canonicalSchemaId(row.record_type);
  }
  if (typeof row.licence_id === "string" && typeof row.kind === "string" && typeof row.download_url === "string") {
    return IMPORT_SCHEMA_IDS.source;
  }
  if (typeof row.confirmation_status === "string" && typeof row.attribution === "string" && !row.kind) {
    return canonicalSchemaId("licence");
  }
  return null;
}

export function formatErrors(errors: ErrorObject[] | null | undefined): ValidationIssue[] {
  return (errors ?? []).map((error) => ({
    instancePath: error.instancePath || "/",
    message: error.message ?? "invalid",
    schemaPath: error.schemaPath,
  }));
}

function walk(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) found.push(...walk(full));
    else found.push(full);
  }
  return found;
}

let shared: SchemaValidator | undefined;

export function getValidator(): SchemaValidator {
  shared ??= new SchemaValidator();
  return shared;
}

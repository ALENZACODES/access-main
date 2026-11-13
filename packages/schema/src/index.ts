export {
  ILLUSTRATIVE_TOTAL,
  ILLUSTRATIVE_TRANCHE_TARGETS,
  IMPORT_SCHEMA_IDS,
  RECONCILIATION_LINES,
  RECONCILIATION_TARGET,
  RECORDS,
  canonicalSchemaId,
  recordByType,
} from "./catalog/index.js";
export type { FactClass, FieldDef, RecordDef } from "./catalog/types.js";
export { PIECE_DEFINITION, RecordCounter, accessibilityFactFieldDefinitions, countRecords } from "./count.js";
export type { CountReport, TypeSlice } from "./count.js";
export { HEADLINE_MAX_AGE_DAYS, STATUS_SNAPSHOT_DAYS, judgeFreshness } from "./freshness.js";
export { GAME_NAMES, NO_MEDICAL_CLAIMS_NOTICE } from "./flat-schemas.js";
export {
  PATH_ACCESS_KEYS,
  TRANSIT_ACCESS_KEYS,
  VENUE_ACCESS_KEYS,
  VENUE_ENTRANCE_KEYS,
  VENUE_PLACE_KEYS,
  WASHROOM_ACCESS_KEYS,
} from "./import-class.js";
export { migrateImportRecord, odblShareAlikeMissing } from "./migrate.js";
export type { ImportRecord, SourceName } from "./migrate.js";
export { SchemaValidator, detectSchemaId, getValidator } from "./validate.js";
export type { ValidationIssue, ValidationResult } from "./validate.js";
export { runCli } from "./cli.js";
export type {
  CanonicalRecord,
  FieldEvidence,
  FieldFact,
  FieldValue,
  GameName,
  PrototypeLabel,
  Provenance,
  VerificationTier,
} from "./generated/types.js";

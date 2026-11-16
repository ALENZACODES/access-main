/** Consented reports: protected tables, the evidence pack built from them, and logic-model indicators. */
export * from "./types.ts";
export { isCoarsePeriod, looksLikePrecisePlace, monthOf, periodKey } from "./coarsen.ts";
export { CONSENT_PROBLEMS, checkConsent, type ConsentFinding, type ConsentProblem } from "./consent.ts";
export { exposedCells, feasibleSlack, suppressTable, type SuppressionMask } from "./disclosure.ts";
export { indexRegions, rowFor, type RegionIndex, type RegionTableIssue } from "./regions.ts";
export {
  DEFAULT_MIN_CELL_SIZE,
  MIN_CELL_SIZE_FLOOR,
  buildProtectedTables,
  checkMinimumCellSize,
  type ProtectedTables,
  type TableDiagnostics,
  type TableOptions,
} from "./tables.ts";
export {
  buildReportEvidencePack,
  fingerprintOf,
  packFiles,
  packMarkdown,
  provenanceCsv,
  serialiseReportPack,
  tablesCsv,
  type PackFile,
  type RefusalCode,
  type RefusalReason,
  type ReportPackInput,
  type ReportPackOptions,
  type ReportPackResult,
} from "./pack.ts";
export {
  INDICATORS,
  KPI_MEASURES,
  KPI_STAGES,
  computeIndicators,
  logicModel,
  validateIndicator,
  type CitationRecord,
  type IncidentReview,
  type IndicatorDefinition,
  type KpiMeasure,
  type KpiOptions,
  type KpiRecords,
  type KpiResult,
  type KpiStage,
  type PackDelivery,
} from "./kpi.ts";
export { validateConsentEntry, validateInputSet, validateRegion, validateReport } from "./validate.ts";
export { consentEntrySchema, inputSetSchema, regionSchema, reportSchema } from "./schemas.ts";
export {
  DEMO_CITATIONS,
  DEMO_CONSENT_LEDGER,
  DEMO_DELIVERIES,
  DEMO_INPUT_SETS,
  DEMO_PURPOSE,
  DEMO_REGIONS,
  DEMO_REPORTS,
  DEMO_REPORT_AS_OF,
  DEMO_REVIEWS,
} from "./demo.ts";

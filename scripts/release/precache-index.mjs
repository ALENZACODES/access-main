/** Release-only barrel: explicit exports keep accidental policy changes visible. */
export {
  PRECACHE_CONTRACT_VERSION, PRECACHE_CHUNK_LIMIT, PRECACHE_MAX_DOCUMENT_BYTES,
  PRECACHE_MAX_ITEMS, PRECACHE_MAX_REFERENCES, PRECACHE_MAX_ASSET_BYTES,
  PRECACHE_STATES, PRECACHE_KINDS, PRECACHE_GROUPS, PRECACHE_LOCALES,
  plainObject, safeIdentifier, safeAssetPath, safeSourceUrl, safeLabel,
  frenchCopyIssues, privateKeyIssues, exactDay, isKnownTier, assetIssues,
  inspectPrecache, parsePrecache, canonicalPrecache, precacheFingerprint,
} from './precache-contract.mjs';
export {
  FILE_SCAN_VERSION, FILE_SCAN_CONCURRENCY, fileStatus, scanTotals,
  inspectFile, auditFiles, loadManifest,
} from './precache-files.mjs';
export {
  PRECACHE_CHANGES, differencesForAsset, comparePrecache, affectedDependents,
  releaseImpact, policyDelta,
} from './precache-delta.mjs';
export {
  PRECACHE_FORMATS, PRECACHE_REPORT_MAX_BYTES, reportWords,
  htmlEscape, csvCell, colon, assetReportRows, textReport, csvReport,
  htmlReport, jsonReport, renderReport, changeReport,
} from './precache-report.mjs';
export { CLI_ACTIONS, parseArgs, runPrecacheCli } from './precache-cli.mjs';

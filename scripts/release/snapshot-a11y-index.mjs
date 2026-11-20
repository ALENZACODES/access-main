/** Public entry point for the manual snapshot interaction audit. */
export * from './snapshot-a11y-contract.mjs';
export * from './snapshot-a11y-analysis.mjs';
export * from './snapshot-a11y-report.mjs';
export { parseCliArgs, readSnapshotFile, runSnapshotCli, safeOutputPath, COMMANDS, FORMATS } from './snapshot-a11y-cli.mjs';

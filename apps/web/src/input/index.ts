export { formatIssue, type IssueKind, type Locale } from "./voiceAudit.messages.ts";
export {
  MIN_TARGET_PX,
  auditControls,
  describeIssues,
  labelInName,
  normalizeLabel,
  type AuditIssue,
  type ControlDescriptor,
} from "./voiceAudit.ts";
export { contextualName } from "./contextualName.ts";

// Device-local keyboard and switch rehearsal contracts and reports.
export * from "./rehearsal/model.ts";
export * from "./rehearsal/scanner.ts";
export * from "./rehearsal/semantics.ts";
export * from "./rehearsal/report.ts";
export * from "./rehearsal/copy.ts";

// Keyboard and switch workbench: explicit named exports avoid collisions with rehearsal contracts.
export { defaultControl as workbenchDefaultControl, defaultProject as workbenchDefaultProject, reviewProject as reviewWorkbenchProject, projectIssues as auditWorkbenchProject } from "./switch-workbench/model.ts";
export { initialMachine as initialWorkbenchMachine, stepMachine as stepWorkbenchMachine, replay as replayWorkbench } from "./switch-workbench/engine.ts";
export { buildReport as buildWorkbenchReport, exportCsv as exportWorkbenchCsv, exportJson as exportWorkbenchJson } from "./switch-workbench/report.ts";
export { workbenchCopy } from "./switch-workbench/copy.ts";

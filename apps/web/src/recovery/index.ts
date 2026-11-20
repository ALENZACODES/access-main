/** Recovery states never imply that partial data is complete. */
export type RecoveryLocale = "en" | "fr";
/** Public error-recovery API consumed by offline and feature screens. */
export { classifyRecoveryError, classifyPackDownloadError, runRecoverable } from "./classify.ts";
export type { RecoveryResult } from "./classify.ts";
export { RecoveryNotice } from "./RecoveryNotice.tsx";
export type { RecoveryNoticeProps } from "./RecoveryNotice.tsx";

export type RecoveryOperation = "pack" | "download" | "export";
export type RecoveryReason = "offline" | "quota" | "permission" | "interrupted" | "invalid-data" | "unknown";
export type RecoveryAction = "retry" | "free-space" | "check-input";
export interface RecoverySource {
  readonly name: string;
  readonly licence: string;
  readonly date: string;
}
export interface RecoveryFailure {
  readonly operation: RecoveryOperation;
  readonly reason: RecoveryReason;
  readonly source?: RecoverySource;
}
export interface RecoveryMessage {
  readonly title: string;
  readonly description: string;
  readonly actionLabel: string;
  readonly dismissLabel: string;
  readonly action: RecoveryAction;
}
type MessageCopy = Pick<RecoveryMessage, "title" | "description" | "actionLabel" | "action">;
type CopyTable = Readonly<Record<RecoveryOperation, Readonly<Record<RecoveryReason, MessageCopy>>>>;
const EN: CopyTable = {
  pack: {
    offline: { title: "Pack unavailable", description: "The pack could not be opened offline. Reconnect and try again.", actionLabel: "Try again", action: "retry" },
    quota: { title: "Not enough storage", description: "The pack was not saved. Free up device space before trying again.", actionLabel: "Storage guidance", action: "free-space" },
    permission: { title: "Pack access blocked", description: "The pack could not be accessed. Check browser or device permissions.", actionLabel: "Try again", action: "retry" },
    interrupted: { title: "Pack interrupted", description: "The pack operation did not finish. Do not use it as a complete pack.", actionLabel: "Try again", action: "retry" },
    "invalid-data": { title: "Pack could not be read", description: "The pack data is not in the expected format. Check the source file.", actionLabel: "Check file", action: "check-input" },
    unknown: { title: "Pack operation failed", description: "The cause is unknown. The pack has not been confirmed complete.", actionLabel: "Try again", action: "retry" },
  },
  download: {
    offline: { title: "Download unavailable", description: "The download did not finish offline. Reconnect and try again.", actionLabel: "Try again", action: "retry" },
    quota: { title: "Not enough storage", description: "The download was not saved. Free up device space before trying again.", actionLabel: "Storage guidance", action: "free-space" },
    permission: { title: "Download blocked", description: "The file could not be saved. Check download permissions.", actionLabel: "Try again", action: "retry" },
    interrupted: { title: "Download interrupted", description: "The download did not finish. Do not use a partial file as a complete file.", actionLabel: "Try again", action: "retry" },
    "invalid-data": { title: "Download failed its checks", description: "The downloaded data did not match its expected size, fingerprint or record count. Nothing from it was saved.", actionLabel: "Try again", action: "retry" },
    unknown: { title: "Download failed", description: "The cause is unknown. The file has not been confirmed complete.", actionLabel: "Try again", action: "retry" },
  },
  export: {
    offline: { title: "Export unavailable", description: "The export did not finish. Check the connection if one is needed.", actionLabel: "Try again", action: "retry" },
    quota: { title: "Not enough storage", description: "The export was not saved. Free up device space before trying again.", actionLabel: "Storage guidance", action: "free-space" },
    permission: { title: "Export blocked", description: "The export could not be saved. Check file access permissions.", actionLabel: "Try again", action: "retry" },
    interrupted: { title: "Export interrupted", description: "The export did not finish. Do not share a partial file.", actionLabel: "Try again", action: "retry" },
    "invalid-data": { title: "Export data could not be read", description: "The data to export is not in the expected format. Correct it, then export again.", actionLabel: "Correct the data", action: "check-input" },
    unknown: { title: "Export failed", description: "The cause is unknown. No complete export has been confirmed.", actionLabel: "Try again", action: "retry" },
  },
};
const FR: CopyTable = {
  pack: {
    offline: { title: "Ensemble indisponible", description: "L’ensemble n’a pas pu être ouvert hors ligne. Rétablissez la connexion et réessayez.", actionLabel: "Réessayer", action: "retry" },
    quota: { title: "Espace de stockage insuffisant", description: "L’ensemble n’a pas été enregistré. Libérez de l’espace avant de réessayer.", actionLabel: "Conseils de stockage", action: "free-space" },
    permission: { title: "Accès à l’ensemble bloqué", description: "L’ensemble est inaccessible. Contrôlez les autorisations du navigateur ou de l’appareil.", actionLabel: "Réessayer", action: "retry" },
    interrupted: { title: "Opération interrompue", description: "L’opération sur l’ensemble est inachevée. Ne l’utilisez pas comme ensemble complet.", actionLabel: "Réessayer", action: "retry" },
    "invalid-data": { title: "Lecture de l’ensemble impossible", description: "Les données ne respectent pas le format attendu. Contrôlez le fichier source.", actionLabel: "Contrôler le fichier", action: "check-input" },
    unknown: { title: "Échec de l’opération", description: "La cause est inconnue. L’ensemble n’a pas été confirmé comme complet.", actionLabel: "Réessayer", action: "retry" },
  },
  download: {
    offline: { title: "Téléchargement indisponible", description: "Le téléchargement est inachevé hors ligne. Rétablissez la connexion et réessayez.", actionLabel: "Réessayer", action: "retry" },
    quota: { title: "Espace de stockage insuffisant", description: "Le téléchargement n’a pas été enregistré. Libérez de l’espace avant de réessayer.", actionLabel: "Conseils de stockage", action: "free-space" },
    permission: { title: "Téléchargement bloqué", description: "Le fichier n’a pas été enregistré. Contrôlez les autorisations de téléchargement.", actionLabel: "Réessayer", action: "retry" },
    interrupted: { title: "Téléchargement interrompu", description: "Le téléchargement est inachevé. N’utilisez pas un fichier partiel comme fichier complet.", actionLabel: "Réessayer", action: "retry" },
    "invalid-data": { title: "Échec des contrôles du téléchargement", description: "Les données téléchargées ne correspondent pas à la taille, à l’empreinte ou au nombre de fiches attendus. Rien n’a été enregistré.", actionLabel: "Réessayer", action: "retry" },
    unknown: { title: "Échec du téléchargement", description: "La cause est inconnue. L’intégrité du fichier n’a pas été confirmée.", actionLabel: "Réessayer", action: "retry" },
  },
  export: {
    offline: { title: "Exportation indisponible", description: "L’exportation est inachevée. Contrôlez la connexion si elle est nécessaire.", actionLabel: "Réessayer", action: "retry" },
    quota: { title: "Espace de stockage insuffisant", description: "L’exportation n’a pas été enregistrée. Libérez de l’espace avant de réessayer.", actionLabel: "Conseils de stockage", action: "free-space" },
    permission: { title: "Exportation bloquée", description: "L’exportation n’a pas été enregistrée. Contrôlez les autorisations d’accès aux fichiers.", actionLabel: "Réessayer", action: "retry" },
    interrupted: { title: "Exportation interrompue", description: "L’exportation est inachevée. Ne partagez pas un fichier partiel.", actionLabel: "Réessayer", action: "retry" },
    "invalid-data": { title: "Données à exporter illisibles", description: "Les données à exporter ne respectent pas le format attendu. Corrigez-les, puis relancez l’exportation.", actionLabel: "Corriger les données", action: "check-input" },
    unknown: { title: "Échec de l’exportation", description: "La cause est inconnue. Aucune exportation complète n’a été confirmée.", actionLabel: "Réessayer", action: "retry" },
  },
};
export function getRecoveryMessage(failure: RecoveryFailure, locale: RecoveryLocale): RecoveryMessage {
  return { ...(locale === "fr" ? FR : EN)[failure.operation][failure.reason], dismissLabel: locale === "fr" ? "Fermer" : "Dismiss" };
}

export { browserSha256, checkPackIntegrity, checkStoredPackParts, packIntegrityCopy, redownloadPack } from "./packIntegrity";
export type { PackCheck, PackManifest, PackRedownloadResult, Sha256, StoredPackPart } from "./packIntegrity";
export { CorruptPackNotice } from "./CorruptPackNotice";
export type { CorruptPackNoticeProps } from "./CorruptPackNotice";
export { RecoveryCenter } from "./RecoveryCenter";
export type { RecoveryCenterProps } from "./RecoveryCenter";
export { canOpenPack, inspectInstalledPacks, inspectPack, inventoryCopy, isSafePackId, knownPackIds, openCheckedPack } from "./packInventory";
export type { LocalPackRecord, LocalPackState, LocalPackStore, PackAvailability, PackProblem, StoredPack, OpenPackResult } from "./packInventory";
export { DEFAULT_MAX_PACK_BYTES, PackDownloadSession, downloadCopy } from "./downloadSession";
export type { ChunkSource, DownloadOutcome, DownloadPhase, DownloadSnapshot, SessionOptions } from "./downloadSession";
export { createRecoveryExport, exportCopy, saveRecoveryExport } from "./recoveryExport";
export type { RecoveryExportEnvelope, RecoveryExportRecord, RecoveryExportResult, SaveTextFile } from "./recoveryExport";

export { RecoveryWorkbench } from "./RecoveryWorkbench";
export type { RecoveryWorkbenchProps } from "./RecoveryWorkbench";
export { diagnoseInventory, diagnosticsCopy, isOpenLicence, parseCalendarDate, sourceDiagnostics } from "./recoveryDiagnostics";
export type { DiagnosticCode, DiagnosticFinding, DiagnosticOptions, DiagnosticSeverity, DiagnosticSummary } from "./recoveryDiagnostics";
export { actionsCopy, actionEligibleForDownload, proposeRecoveryActions, reconcileRecoveryActions, transitionRecoveryAction } from "./recoveryActions";
export type { ActionKind, ActionPlan, ActionPriority, ActionStatus, ActionTransition, RecoveryActionItem } from "./recoveryActions";
export { appendReviewEvent, clearReviewLog, compareInspections, comparisonCopy, emptyReviewLog } from "./recoveryComparison";
export type { ChangeKind, LocalReviewLog, PackChange, PackComparison, ReviewEvent } from "./recoveryComparison";
export { RecoveryQueuePanel } from "./RecoveryQueuePanel";
export type { RecoveryQueuePanelProps } from "./RecoveryQueuePanel";

export { planPackRepairs, repairPolicyCopy } from "./recoveryPolicy";
export type { RepairPolicyOptions, RepairPolicyResult, RepairRecommendation, RepairPriority, RepairKind, PolicyFinding, PolicyFlag } from "./recoveryPolicy";
export { calculateStorageBudget, countBatchStages, createRecoveryBatch, parseQuotaInput, reconcileRecoveryBatch, recoveryBatchCopy, updateRecoveryBatch } from "./recoveryBatch";
export type { BatchStage, BatchDecision, BatchItem, RecoveryBatch, BatchTransition, BatchUpdate, StorageBudget } from "./recoveryBatch";
export { appendLedgerEvent, emptyRecoveryLedger, recoveryLedgerCopy, summarizeLedger, validLedger } from "./recoveryLedger";
export type { RecoveryLedger, LedgerAction, LedgerOutcome } from "./recoveryLedger";
export { createLocalPlanExport, planExportCopy, saveLocalPlanExport } from "./recoveryPlanExport";
export type { LocalPlanDocument, LocalPlanEntry, PlanExportResult, SaveRecoveryPlan } from "./recoveryPlanExport";
export { inspectRecoveryPlan, planImportCopy } from "./recoveryPlanImport";
export type { ImportIssue, ImportFinding, ImportResult, ImportLimits } from "./recoveryPlanImport";
export { compareRecoveryPlan, filterPlanDeltas, planComparisonCopy, summarizePlanChanges } from "./recoveryPlanCompare";
export type { PlanComparison, PlanDelta, PlanChange, ComparisonFilter } from "./recoveryPlanCompare";
export { buildRecoverySteps, filterRecoverySteps, recoveryStepCopy } from "./recoveryPlanSteps";
export { makePlanDiffExport, planDiffCopy, savePlanDiff } from "./recoveryPlanDiffExport";
export { RecoveryPlanReview } from "./RecoveryPlanReview";
export type { RecoveryPlanReviewProps } from "./RecoveryPlanReview";

export { RecoveryEvidenceNotebook } from "./RecoveryEvidenceNotebook";
export type { RecoveryEvidenceNotebookProps } from "./RecoveryEvidenceNotebook";
export { evidenceCopy } from "./recoveryEvidenceCopy";
export { emptyEvidenceNotebook, parseEvidenceNotebook, validateEvidenceNotebook, addEvidenceEntry, reviewEvidenceEntry, summarizeEvidenceNotebook, previewEvidenceMerge, mergeEvidenceNotebook, exportEvidenceNotebook } from "./recoveryEvidenceNotebook";
export type { EvidenceEntry, EvidenceNotebook, EvidenceDraft, EvidenceSummary, EvidenceMergePreview } from "./recoveryEvidenceNotebook";
export { RecoveryDryRunPanel } from "./RecoveryDryRunPanel";
export type { RecoveryDryRunPanelProps } from "./RecoveryDryRunPanel";
export { calculateRecoveryDryRun, exportRecoveryDryRun } from "./recoveryDryRun";
export type { DryRunInput, DryRunEntry, DryRunResult, DryRunEnvelope } from "./recoveryDryRun";
export { recoveryDryRunCopy } from "./recoveryDryRunCopy";
export { RecoveryCaseJournal } from "./RecoveryCaseJournal";
export type { RecoveryCaseJournalProps } from "./RecoveryCaseJournal";
export { RecoveryTaskBoard } from "./RecoveryTaskBoard";
export type { RecoveryTaskBoardProps } from "./RecoveryTaskBoard";
export { appendCaseEvent, caseCounts, caseViewCopy, changeCasePhase, currentPackOutcome, effectiveCaseOutcome, newCaseDocument, parseCaseDocument, serializeCaseDocument, startCase, validCalendarDay, validCaseEvidence } from "./recoveryCaseJournal";
export type { CaseDocument, CaseEvent, CaseIssue, CaseKind, CaseOutcome, CasePhase } from "./recoveryCaseJournal";
export { compareCaseDocuments, journalCompareCopy, mergeCaseDocuments } from "./recoveryJournalCompare";
export { addRecoveryTask, applyTaskMerge, assessRecoveryTasks, countTaskStates, exportTaskBoard, newTaskBoard, parseTaskBoard, previewTaskMerge, updateRecoveryTask } from "./recoveryTaskBoard";
export type { RecoveryTask, TaskBoard, TaskKind, TaskProvenance } from "./recoveryTaskBoard";
export { taskBoardCopy } from "./recoveryTaskCopy";
export { RecoveryRepairAttempts } from "./RecoveryRepairAttempts";
export type { RecoveryRepairAttemptsProps } from "./RecoveryRepairAttempts";
export { ATTEMPT_COPY, addRecoveryAttempt, emptyAttemptDocument, exportRecoveryAttempts, isAttemptProvenance, mergeRecoveryAttempts, parseRecoveryAttempts, previewAttemptMerge, replaceRecoveryAttempt, summarizeRecoveryAttempts, validateAttempt, validateAttemptDocument } from "./recoveryRepairReceipt";
export type { AttemptDocument, AttemptIssue, AttemptKind, AttemptMergePreview, AttemptOutcome, AttemptProvenance, AttemptResult, AttemptSummary, RecoveryAttempt } from "./recoveryRepairReceipt";

export { RecoveryTransferPreflight } from "./RecoveryTransferPreflight";
export type { RecoveryTransferPreflightProps } from "./RecoveryTransferPreflight";
export {
  EVIDENCE_TIERS, PREFLIGHT_LIMITS, TRANSFER_CONDITIONS, TRANSFER_KINDS, TRANSFER_STAGES,
  TRANSFER_LICENCES, appendTransferCandidate, assessTransferCandidate, assessTransferDocument,
  decodeTransferDocument, encodeTransferDocument, filterTransferCandidates, mergeTransferDocuments,
  newTransferDocument, summarizeTransferDocument, transferPackSummaries, transferPreviewMerge,
  transitionTransferCandidate, validTransferProvenance, validateTransferCandidate, validateTransferDocument,
} from "./recoveryTransferPreflight";
export type {
  EvidenceTier, TransferCondition, TransferKind, TransferStage, TransferIssue, TransferDecision,
  TransferReadiness, TransferProvenance, TransferCandidate, TransferDocument, TransferResult,
  PreflightFinding, PreflightOverview, PreflightFilter, PreflightMergePreview,
} from "./recoveryTransferPreflight";
export { recoveryTransferCopy } from "./recoveryTransferCopy";
export type { PreflightCopy } from "./recoveryTransferCopy";
export {
  HISTORY_LIMIT, HISTORY_BYTE_LIMIT, emptyHistory, validateHistoryEvent, validateHistory,
  appendHistoryEvent, amendHistoryEvent, historyForCandidate, countHistoryActions,
  validateTransferBundle, prepareTransferBundle, serializeTransferBundle, parseTransferBundle,
  previewTransferBundleMerge, mergeTransferBundles, reconcileTransferHistory, candidateLatestCondition,
  transferBundleHasCandidate,
} from "./recoveryTransferHistory";
export type {
  TransferHistoryAction, TransferHistoryEvent, TransferHistory, HistoryIssue, HistoryResult,
  TransferBundle, TransferBundleMerge,
} from "./recoveryTransferHistory";

export { RecoveryFailureChecklist } from "./RecoveryFailureChecklist";
export type { RecoveryFailureChecklistProps } from "./RecoveryFailureChecklist";
export { CHECKLIST_STEPS, FAILURE_CHECKLIST_COPY, changeChecklistStep, checklistCounts, defaultChecklist, exportChecklist, importChecklist, previewChecklistReplacement, validChecklistProvenance, validateChecklist } from "./recoveryFailureChecklist";
export type { ChecklistState, ChecklistItem, ChecklistProvenance, FailureChecklist, FailureCause, FailureKind } from "./recoveryFailureChecklist";
export { RecoveryProvenanceLedger } from "./RecoveryProvenanceLedger";
export type { RecoveryProvenanceLedgerProps } from "./RecoveryProvenanceLedger";
export { provenanceCopy } from "./recoveryProvenanceCopy";
export { LEDGER_LIMITS, LEDGER_LICENCES, LEDGER_PHASES, LEDGER_TIERS, LEDGER_VALUES, appendLedgerStatement, fieldOverviews, filterLedger, ledgerConflicts, ledgerIds, ledgerSummary, loadLedger, mergeLedgerDocuments, newLedgerDocument, nextLedgerId, previewLedgerMerge, reviewLedgerStatement, saveLedger } from "./recoveryProvenanceLedger";
export type { LedgerDocument, LedgerFilter, LedgerPhase, LedgerStatement, LedgerTier, LedgerValue } from "./recoveryProvenanceLedger";

export { RecoveryHandoffPanel } from "./RecoveryHandoffPanel";
export type { RecoveryHandoffPanelProps } from "./RecoveryHandoffPanel";
export { handoffCopy } from "./recoveryHandoffCopy";
export type { HandoffCopy } from "./recoveryHandoffCopy";
export { HANDOFF_LIMITS, HANDOFF_LICENCES, HANDOFF_OPERATIONS, HANDOFF_CONDITIONS, HANDOFF_DECISIONS, HANDOFF_TIERS, appendHandoffCase, appendHandoffEvent, currentHandoffDecision, exportHandoffDocument, filterHandoffCases, handoffForPack, handoffSummary, handoffUpdatedAt, mergeHandoffDocuments, newHandoffDocument, nextEventId, nextHandoffId, parseHandoffDocument, previewHandoffMerge, validHandoffSource, validateHandoffCase, validateHandoffDocument, validateHandoffEvent } from "./recoveryHandoff";
export type { HandoffOperation, HandoffCondition, HandoffDecision, HandoffTier, HandoffIssue, HandoffSource, HandoffEvent, HandoffCase, HandoffDocument, HandoffResult, HandoffMergePreview, HandoffFilter, HandoffSummary, HandoffPackCoverage } from "./recoveryHandoff";

export { RecoverySessionTracePanel } from "./RecoverySessionTracePanel";
export type { RecoverySessionTracePanelProps } from "./RecoverySessionTracePanel";
export { TRACE_LIMITS, TRACE_LICENCES, TRACE_OPERATIONS, TRACE_OUTCOMES, TRACE_STAGES, TRACE_TIERS, appendTrace, appendTraceMoment, changeTraceOutcome, filterTraces, mergeTraces, newTraceDocument, nextMomentId, nextTraceId, summarizeTraces, traceBytes, traceExport, traceId, traceImport, traceInstant, tracePreview, traceSource, validateMoment, validateTrace, validateTraceDocument } from "./recoverySessionTrace";
export type { TraceOperation, TraceOutcome, TraceStage, TraceTier, TraceIssue, TraceSource, TraceMoment, TraceCase, TraceDocument, TraceResult, TracePreview, TraceCounts, TraceFilter } from "./recoverySessionTrace";
export { assessTrace, assessTraceDocument, compareTraceDocuments, findingsByCode, findingsForTrace, summarizeTracePacks, traceRecommendations, traceSequence } from "./recoverySessionAnalysis";
export type { TraceFinding, TraceAssessmentStatus, TraceNextStep, TraceFindingItem, TraceAssessment, TraceSequencePoint, TracePackOverview, TraceComparison, TraceReport } from "./recoverySessionAnalysis";
export { sessionCopy } from "./recoverySessionCopy";
export type { SessionCopy } from "./recoverySessionCopy";

export { RecoveryCheckpointPanel } from "./RecoveryCheckpointPanel";
export type { RecoveryCheckpointPanelProps } from "./RecoveryCheckpointPanel";
export * from "./recoveryCheckpoint";
export * from "./recoveryCheckpointAnalysis";
export * from "./recoveryCheckpointTimeline";
export * from "./recoveryCheckpointCopy";
export * from "./recoveryCheckpointPlan";
export { RecoveryDecisionMatrix } from "./RecoveryDecisionMatrix";
export type { RecoveryDecisionMatrixProps } from "./RecoveryDecisionMatrix";
export * from "./recoveryDecisionMatrix";
export * from "./recoveryDecisionCoverage";
export * from "./recoveryDecisionCopy";



// User-controlled recovery transfer witness records, with no readiness inference.
export { RecoveryTransferWitnessPanel } from "./RecoveryTransferWitnessPanel";
export type { RecoveryTransferWitnessPanelProps } from "./RecoveryTransferWitnessPanel";
export * from "./recoveryTransferWitness";
export * from "./recoveryTransferWitnessAnalysis";
export { recoveryTransferWitnessCopy } from "./recoveryTransferWitnessCopy";
export type { WitnessCopy } from "./recoveryTransferWitnessCopy";

// Manual recovery evidence packets: never change installed pack readiness.
export { RecoveryEvidencePacketPanel } from "./RecoveryEvidencePacketPanel";
export type { RecoveryEvidencePacketPanelProps } from "./RecoveryEvidencePacketPanel";
export * from "./recoveryEvidencePacket";
export * from "./recoveryEvidenceAnalysis";
export { recoveryEvidencePacketCopy } from "./recoveryEvidencePacketCopy";
export type { PacketCopy } from "./recoveryEvidencePacketCopy";

// Manual local recovery handoff chain; no inferred pack readiness.
export { RecoveryHandoffChainPanel } from "./RecoveryHandoffChainPanel";
export type { RecoveryHandoffChainPanelProps } from "./RecoveryHandoffChainPanel";
export * from "./recoveryHandoffChain";
export * from "./recoveryHandoffChainAnalysis";
export * from "./recoveryHandoffChainPlan";
export { recoveryHandoffChainCopy } from "./recoveryHandoffChainCopy";
export type { ChainCopy } from "./recoveryHandoffChainCopy";

// Manual offline recovery rehearsal: records never authorize pack use.
export { RecoveryDrillPanel } from "./RecoveryDrillPanel";
export type { RecoveryDrillPanelProps } from "./RecoveryDrillPanel";
export {
  DRILL_CONDITIONS, DRILL_EVENTS, DRILL_KINDS, DRILL_LIMITS, DRILL_OUTCOMES,
  DRILL_PHASES, DRILL_TIERS, addDrillRun, appendDrillEvent, changeDrillPhase,
  checkDrillDocument, checkDrillEvent, checkDrillProvenance, checkDrillRun,
  checkDrillStep, drillContentReady, emptyDrillDocument, eventsForDrill,
  filterDrillRuns, mergeDrillDocuments, nextDrillId, parseDrills,
  previewDrillMerge, recordDrillStep, serializeDrills, stepsForDrill,
  summarizeDrills,
} from "./recoveryDrillRun";
export type {
  DrillCondition, DrillDocument, DrillEvent, DrillEventKind, DrillFilter,
  DrillIssue, DrillKind, DrillLocale, DrillMergePreview, DrillOutcome, DrillPhase,
  DrillProvenance, DrillResult, DrillRun, DrillStep, DrillSummary, DrillTier,
} from "./recoveryDrillRun";
export {
  compareDrillPacks, createDrillReport, drillDailyRollups, drillFindings,
  drillNarrative, drillOperationRollups, drillPackRollups, drillSourceRollups,
  drillSuggestedReviews, reviewDrill,
} from "./recoveryDrillAnalysis";
export type {
  DrillComparison, DrillDailyRollup, DrillFinding, DrillFindingCode,
  DrillNextAction, DrillOperationRollup, DrillPackRollup, DrillReport,
  DrillReview, DrillSourceRollup,
} from "./recoveryDrillAnalysis";
export { recoveryDrillCopy } from "./recoveryDrillCopy";
export type { DrillCopy } from "./recoveryDrillCopy";

// Manual recovery reconciliation; observations never authorize pack use.
export { RecoveryReconciliationPanel } from "./RecoveryReconciliationPanel";
export type { RecoveryReconciliationPanelProps } from "./RecoveryReconciliationPanel";
export * from "./recoveryReconciliation";
export * from "./recoveryReconciliationAnalysis";
export { reconciliationCopy } from "./recoveryReconciliationCopy";
export type { ReconciliationCopy } from "./recoveryReconciliationCopy";

// User-controlled recovery receipt documentation.
export { RecoveryReceiptLedgerPanel } from "./RecoveryReceiptLedgerPanel";
export type { RecoveryReceiptLedgerPanelProps } from "./RecoveryReceiptLedgerPanel";
export * from "./recoveryReceiptLedger";
export * from "./recoveryReceiptAnalysis";
export { recoveryReceiptCopy } from "./recoveryReceiptCopy";
export type { ReceiptCopy } from "./recoveryReceiptCopy";

import type { RecoveryLocale } from "./index";
import type { TraceOperation, TraceOutcome, TraceStage, TraceTier } from "./recoverySessionTrace";
import type { TraceFinding, TraceNextStep } from "./recoverySessionAnalysis";

/** All interface text is bilingual; status tokens intentionally stay UNKNOWN. */
export interface SessionCopy {
  readonly heading: string;
  readonly intro: string;
  readonly pack: string;
  readonly operation: string;
  readonly outcome: string;
  readonly expectedBytes: string;
  readonly unknownBytes: string;
  readonly source: string;
  readonly licence: string;
  readonly sourceDate: string;
  readonly tier: string;
  readonly reference: string;
  readonly add: string;
  readonly select: string;
  readonly at: string;
  readonly stage: string;
  readonly observedBytes: string;
  readonly note: string;
  readonly append: string;
  readonly import: string;
  readonly export: string;
  readonly apply: string;
  readonly cancel: string;
  readonly filter: string;
  readonly all: string;
  readonly empty: string;
  readonly summary: string;
  readonly findings: string;
  readonly noChanges: string;
  readonly added: string;
  readonly unchanged: string;
  readonly conflicts: string;
  readonly invalid: string;
  readonly readFailure: string;
  readonly saved: string;
  readonly saveFailure: string;
  readonly inspectFirst: string;
  readonly manualOnly: string;
  readonly withoutEvidence: string;
  readonly current: string;
  readonly status: string;
  readonly next: string;
  readonly count: string;
  readonly operations: Readonly<Record<TraceOperation, string>>;
  readonly outcomes: Readonly<Record<TraceOutcome, string>>;
  readonly assessments: Readonly<Record<"UNKNOWN" | "attention" | "documented", string>>;
  readonly stages: Readonly<Record<TraceStage, string>>;
  readonly tiers: Readonly<Record<TraceTier, string>>;
  readonly findingsCopy: Readonly<Record<TraceFinding, string>>;
  readonly steps: Readonly<Record<TraceNextStep, string>>;
}
const EN: SessionCopy = {
  heading: "Local recovery session trace",
  intro: "Record what you observed before and after a pack, download, or export problem.",
  pack: "Pack", operation: "Operation", outcome: "Reported outcome",
  expectedBytes: "Expected bytes", unknownBytes: "Keep bytes UNKNOWN",
  source: "Source", licence: "Licence", sourceDate: "Source date", tier: "Evidence tier",
  reference: "Source reference", add: "Create local trace", select: "Select trace",
  at: "Recorded time", stage: "Observed step", observedBytes: "Observed bytes",
  note: "Observation", append: "Add observation", import: "Choose trace file",
  export: "Export local trace", apply: "Add non-conflicting traces", cancel: "Discard preview",
  filter: "Search local traces", all: "All traces", empty: "No local trace entries yet.",
  summary: "Trace summary", findings: "Items to review", noChanges: "No changes to pack data are made.",
  added: "New traces", unchanged: "Unchanged", conflicts: "Conflicts",
  invalid: "The record cannot be used. Check its fields and source information.",
  readFailure: "Could not read the selected file.", saved: "Trace file saved.",
  saveFailure: "The trace file could not be saved.",
  inspectFirst: "Inspect local packs before adding a trace.",
  manualOnly: "All notes are local and user-entered. A reported outcome does not change pack readiness.",
  withoutEvidence: "UNKNOWN", current: "Current observations", status: "Review status", next: "Possible next step", count: "Recorded traces",
  operations: { pack: "Pack", download: "Download", export: "Export" },
  outcomes: { UNKNOWN: "UNKNOWN", stopped: "Stopped", "in-progress": "In progress", "reported-complete": "Reported complete" },
  assessments: { UNKNOWN: "UNKNOWN", attention: "Needs review", documented: "Notes documented" },
  stages: { started: "Started", reading: "Reading", transferring: "Transferring", writing: "Writing", stopped: "Stopped", reviewed: "Reviewed" },
  tiers: { UNKNOWN: "UNKNOWN", "user-observation": "User observation", "source-document": "Source document", "file-metadata": "File metadata" },
  findingsCopy: {
    "no-moments": "No observations recorded", "unknown-expected-size": "Expected size is UNKNOWN",
    "unknown-observed-size": "Observed size is UNKNOWN", "observed-over-expected": "Observed size exceeds expected size",
    "reported-complete-without-evidence": "Reported completion has no review note",
    "stopped-without-stop-note": "Stopped outcome has no stop note",
    "time-gap": "Long gap between observations", "changing-size": "Observed size decreased",
    "missing-start": "First observed step is not start", "no-source-reference": "Source reference missing",
    "no-review": "No review step recorded", "reported-progress": "Progress is user-reported", uncertain: "UNKNOWN",
  },
  steps: {
    "check-source": "Review the source information", "inspect-local": "Inspect local files manually",
    "review-history": "Review the observation history", "consider-manual-retry": "Consider a user-initiated retry", none: "No suggestion",
  },
};
const FR: SessionCopy = {
  heading: "Historique local de récupération",
  intro: "Consignez les observations avant et après un problème d’ensemble, de téléchargement ou d’exportation.",
  pack: "Ensemble", operation: "Opération", outcome: "Résultat déclaré",
  expectedBytes: "Octets attendus", unknownBytes: "Conserver UNKNOWN pour les octets",
  source: "Source", licence: "Licence", sourceDate: "Date de la source", tier: "Niveau de preuve",
  reference: "Référence de la source", add: "Créer l’historique local", select: "Choisir un historique",
  at: "Heure consignée", stage: "Étape observée", observedBytes: "Octets observés",
  note: "Observation", append: "Ajouter une observation", import: "Choisir un fichier d’historique",
  export: "Exporter l’historique local", apply: "Ajouter les historiques sans conflit", cancel: "Écarter l’aperçu",
  filter: "Rechercher dans les historiques locaux", all: "Tous les historiques", empty: "Aucun historique local pour le moment.",
  summary: "Résumé des historiques", findings: "Éléments à examiner", noChanges: "Aucune donnée d’ensemble n’est modifiée.",
  added: "Nouveaux historiques", unchanged: "Sans changement", conflicts: "Conflits",
  invalid: "Le dossier ne peut pas être utilisé. Examinez ses champs et ses sources.",
  readFailure: "Impossible de lire le fichier choisi.", saved: "Fichier d’historique enregistré.",
  saveFailure: "Le fichier d’historique n’a pas pu être enregistré.",
  inspectFirst: "Examinez les ensembles locaux avant de créer un historique.",
  manualOnly: "Les notes sont locales et saisies manuellement. Un résultat déclaré ne change pas l’état de l’ensemble.",
  withoutEvidence: "UNKNOWN", current: "Observations actuelles", status: "État de l’examen", next: "Étape suivante possible", count: "Historiques consignés",
  operations: { pack: "Ensemble", download: "Téléchargement", export: "Exportation" },
  outcomes: { UNKNOWN: "UNKNOWN", stopped: "Arrêté", "in-progress": "En cours", "reported-complete": "Terminé selon la déclaration" },
  assessments: { UNKNOWN: "UNKNOWN", attention: "À examiner", documented: "Notes consignées" },
  stages: { started: "Début", reading: "Lecture", transferring: "Transfert", writing: "Écriture", stopped: "Arrêt", reviewed: "Examen" },
  tiers: { UNKNOWN: "UNKNOWN", "user-observation": "Observation personnelle", "source-document": "Document source", "file-metadata": "Métadonnées du fichier" },
  findingsCopy: {
    "no-moments": "Aucune observation consignée", "unknown-expected-size": "Taille attendue UNKNOWN",
    "unknown-observed-size": "Taille observée UNKNOWN", "observed-over-expected": "La taille observée dépasse la taille attendue",
    "reported-complete-without-evidence": "Aucune note d’examen pour la fin déclarée",
    "stopped-without-stop-note": "Aucune note d’arrêt pour le résultat déclaré",
    "time-gap": "Long intervalle entre deux observations", "changing-size": "La taille observée a diminué",
    "missing-start": "La première étape n’est pas le début", "no-source-reference": "Référence de source manquante",
    "no-review": "Aucune étape d’examen consignée", "reported-progress": "Progression déclarée par la personne", uncertain: "UNKNOWN",
  },
  steps: {
    "check-source": "Examiner les renseignements de la source", "inspect-local": "Examiner les fichiers locaux manuellement",
    "review-history": "Examiner l’historique des observations", "consider-manual-retry": "Envisager une nouvelle tentative manuelle", none: "Aucune suggestion",
  },
};
export function sessionCopy(locale: RecoveryLocale): SessionCopy {
  return locale === "fr" ? FR : EN;
}

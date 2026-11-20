import type { DrillCondition, DrillEventKind, DrillIssue, DrillKind, DrillLocale, DrillOutcome, DrillPhase, DrillTier } from "./recoveryDrillRun";

export interface DrillCopy {
  readonly heading: string;
  readonly description: string;
  readonly warning: string;
  readonly unknown: "UNKNOWN";
  readonly start: string;
  readonly record: string;
  readonly transition: string;
  readonly close: string;
  readonly pause: string;
  readonly resume: string;
  readonly reopen: string;
  readonly save: string;
  readonly open: string;
  readonly merge: string;
  readonly cancel: string;
  readonly empty: string;
  readonly saved: string;
  readonly loaded: string;
  readonly pending: string;
  readonly failed: string;
  readonly inspect: string;
  readonly pack: string;
  readonly title: string;
  readonly note: string;
  readonly source: string;
  readonly licence: string;
  readonly retrievedOn: string;
  readonly reference: string;
  readonly evidenceTier: string;
  readonly stepLabel: string;
  readonly observedAt: string;
  readonly condition: string;
  readonly outcome: string;
  readonly kind: string;
  readonly phase: string;
  readonly filter: string;
  readonly clear: string;
  readonly review: string;
  readonly summary: string;
  readonly findings: string;
  readonly stepCount: string;
  readonly runCount: string;
  readonly issueNames: Readonly<Record<DrillIssue, string>>;
  readonly kinds: Readonly<Record<DrillKind, string>>;
  readonly phases: Readonly<Record<DrillPhase, string>>;
  readonly outcomes: Readonly<Record<DrillOutcome, string>>;
  readonly conditions: Readonly<Record<DrillCondition, string>>;
  readonly tiers: Readonly<Record<DrillTier, string>>;
  readonly events: Readonly<Record<DrillEventKind, string>>;
}
const en: DrillCopy = {
  heading: "Recovery rehearsal log",
  description: "Record manual offline recovery drills and review their observations.",
  warning: "A rehearsal does not confirm a pack is usable. UNKNOWN remains UNKNOWN until another observation is recorded.",
  unknown: "UNKNOWN", start: "Start rehearsal", record: "Record step", transition: "Change phase",
  close: "Close record", pause: "Pause", resume: "Resume", reopen: "Reopen", save: "Export JSON",
  open: "Choose JSON file", merge: "Merge imported file", cancel: "Discard import", empty: "No drills recorded locally.",
  saved: "File saved", loaded: "File staged. Review conflicts before merging.", pending: "Working locally…", failed: "The operation did not finish.",
  inspect: "Inspect local packs before starting a rehearsal.", pack: "Pack identifier", title: "Rehearsal title",
  note: "Observation note", source: "Source", licence: "Licence", retrievedOn: "Retrieved on",
  reference: "Source reference", evidenceTier: "Evidence tier", stepLabel: "Step description", observedAt: "Observed at",
  condition: "Observed condition", outcome: "Observed outcome", kind: "Drill kind", phase: "Review phase",
  filter: "Filter recorded drills", clear: "Clear filter", review: "Review findings", summary: "Drill summary",
  findings: "Findings for manual review", stepCount: "Recorded steps", runCount: "Recorded drills",
  issueNames: {
    format: "File format is not supported", limit: "Local document limit exceeded",
    identity: "Identifier is invalid", duplicate: "Identifier is already used",
    reference: "A referenced record does not exist", timestamp: "The date or timestamp is invalid",
    source: "Complete source, licence, retrieval date, tier, and reference are required",
    transition: "This phase change is not allowed", conflict: "Import contains conflicting records",
    text: "Text is missing or invalid",
  },
  kinds: { inventory: "Local inventory", "offline-open": "Opening offline", interruption: "Interrupted session", handoff: "Manual handoff", export: "Manual export" },
  phases: { draft: "Draft", "in-progress": "In progress", paused: "Paused", closed: "Closed for review" },
  outcomes: { UNKNOWN: "UNKNOWN", pass: "Observed pass", fail: "Observed fail", "not-run": "Not run" },
  conditions: { UNKNOWN: "UNKNOWN", offline: "Offline", interrupted: "Interrupted", missing: "Missing", conflict: "Conflict", recovered: "Observed recovery" },
  tiers: { UNKNOWN: "UNKNOWN", "self-reported": "Self-reported", documented: "Documented", reviewed: "Reviewed" },
  events: { started: "Started", paused: "Paused", resumed: "Resumed", closed: "Closed", reopened: "Reopened", "step-recorded": "Step recorded", note: "Note" },
};
const fr: DrillCopy = {
  heading: "Journal de répétition de récupération",
  description: "L’utilisateur consigne les répétitions de récupération hors ligne et examine les observations.",
  warning: "Une répétition ne confirme pas qu’un ensemble est utilisable\u202F; UNKNOWN reste UNKNOWN sans nouvelle observation.",
  unknown: "UNKNOWN", start: "Commencer la répétition", record: "Consigner l’étape", transition: "Changer l’état",
  close: "Clore le dossier", pause: "Mettre en pause", resume: "Reprendre", reopen: "Rouvrir", save: "Exporter en JSON",
  open: "Choisir un fichier JSON", merge: "Fusionner le fichier importé", cancel: "Annuler l’importation", empty: "Aucune répétition enregistrée localement.",
  saved: "Fichier enregistré", loaded: "Fichier prêt à examiner. Examinez les conflits avant la fusion.", pending: "Opération locale en cours…", failed: "L’opération est inachevée.",
  inspect: "Inspectez les ensembles locaux avant de commencer une répétition.", pack: "Identifiant de l’ensemble", title: "Titre de la répétition",
  note: "Note d’observation", source: "Source", licence: "Licence", retrievedOn: "Récupéré le",
  reference: "Référence de la source", evidenceTier: "Niveau de preuve", stepLabel: "Description de l’étape", observedAt: "Date d’observation",
  condition: "Condition observée", outcome: "Résultat observé", kind: "Type de répétition", phase: "Étape de révision",
  filter: "Filtrer les répétitions", clear: "Effacer le filtre", review: "Examiner les constats", summary: "Résumé des répétitions",
  findings: "Constats à examiner manuellement", stepCount: "Étapes consignées", runCount: "Répétitions consignées",
  issueNames: {
    format: "Format de fichier non pris en charge", limit: "Limite de document local dépassée",
    identity: "Identifiant invalide", duplicate: "Identifiant déjà utilisé",
    reference: "Un dossier référencé est absent", timestamp: "Date ou horodatage invalide",
    source: "La source, la licence, la date de récupération, le niveau et la référence sont obligatoires",
    transition: "Ce changement d’état n’est pas autorisé", conflict: "L’importation comporte des dossiers en conflit",
    text: "Texte absent ou invalide",
  },
  kinds: { inventory: "Inventaire local", "offline-open": "Ouverture hors ligne", interruption: "Session interrompue", handoff: "Transfert manuel", export: "Exportation manuelle" },
  phases: { draft: "Brouillon", "in-progress": "En cours", paused: "En pause", closed: "Clos pour examen" },
  outcomes: { UNKNOWN: "UNKNOWN", pass: "Réussite observée", fail: "Échec observé", "not-run": "Non exécuté" },
  conditions: { UNKNOWN: "UNKNOWN", offline: "Hors ligne", interrupted: "Interrompu", missing: "Absent", conflict: "Conflit", recovered: "Récupération observée" },
  tiers: { UNKNOWN: "UNKNOWN", "self-reported": "Déclaration personnelle", documented: "Documenté", reviewed: "Examiné" },
  events: { started: "Commencé", paused: "En pause", resumed: "Repris", closed: "Clos", reopened: "Rouvert", "step-recorded": "Étape consignée", note: "Note" },
};
export function recoveryDrillCopy(locale: DrillLocale): DrillCopy { return locale === "fr" ? fr : en; }

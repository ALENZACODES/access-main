import type {
  GuidedAction, GuidedCondition, GuidedEvidence, GuidedIssue, GuidedLocale,
  GuidedOutcome, GuidedPhase, GuidedTier, GuidedTopic,
} from "./recoveryGuidedReview";
export interface GuidedCopy {
  readonly heading: string;
  readonly description: string;
  readonly caution: string;
  readonly unknown: "UNKNOWN";
  readonly pack: string;
  readonly title: string;
  readonly condition: string;
  readonly source: string;
  readonly licence: string;
  readonly retrieved: string;
  readonly reference: string;
  readonly tier: string;
  readonly topic: string;
  readonly evidence: string;
  readonly outcome: string;
  readonly note: string;
  readonly addCase: string;
  readonly addStep: string;
  readonly updatePhase: string;
  readonly chooseCase: string;
  readonly inspect: string;
  readonly noInspection: string;
  readonly review: string;
  readonly close: string;
  readonly reopen: string;
  readonly cases: string;
  readonly observations: string;
  readonly findings: string;
  readonly reviewQueue: string;
  readonly file: string;
  readonly open: string;
  readonly save: string;
  readonly saveSummary: string;
  readonly merge: string;
  readonly staged: string;
  readonly saved: string;
  readonly failed: string;
  readonly pending: string;
  readonly noFile: string;
  readonly search: string;
  readonly clear: string;
  readonly empty: string;
  readonly number: string;
  readonly unresolved: string;
  readonly priority: string;
  readonly operations: Readonly<Record<GuidedCondition, string>>;
  readonly topics: Readonly<Record<GuidedTopic, string>>;
  readonly evidenceNames: Readonly<Record<GuidedEvidence, string>>;
  readonly tiers: Readonly<Record<GuidedTier, string>>;
  readonly phases: Readonly<Record<GuidedPhase, string>>;
  readonly outcomes: Readonly<Record<GuidedOutcome, string>>;
  readonly actions: Readonly<Record<GuidedAction, string>>;
  readonly issues: Readonly<Record<GuidedIssue, string>>;
}
const en: GuidedCopy = {
  heading: "Guided offline recovery review",
  description: "Record one observation at a time and identify what still needs manual review. Nothing is sent automatically.",
  caution: "UNKNOWN means there is not enough information to describe the condition. These notes do not establish that a pack is usable.",
  unknown: "UNKNOWN", pack: "Installed pack", title: "What happened", condition: "Observed problem", source: "Source name",
  licence: "Source licence", retrieved: "Source retrieval date", reference: "Source reference", tier: "Evidence tier",
  topic: "Review topic", evidence: "Evidence status", outcome: "Manual outcome", note: "Notes",
  addCase: "Start local review", addStep: "Record observation", updatePhase: "Review actions", chooseCase: "Select review",
  inspect: "Inspect installed packs", noInspection: "Inspect local packs before beginning a new review.",
  review: "Request review", close: "Close documentation", reopen: "Reopen documentation",
  cases: "Recorded reviews", observations: "Recorded observations", findings: "Review findings", reviewQueue: "Questions needing attention",
  file: "Local review file", open: "Choose local JSON file", save: "Export JSON", saveSummary: "Export text summary", merge: "Accept conflict-free import",
  staged: "Import preview available. No records have changed.", saved: "Saved using the selected file action.",
  failed: "The file could not be read or saved.", pending: "Reading the selected file.", noFile: "Choose a file first.",
  search: "Find a recorded review", clear: "Clear search", empty: "No matching reviews.", number: "Count", unresolved: "Open", priority: "Priority",
  operations: { UNKNOWN: "UNKNOWN", interrupted: "Interrupted", "missing-data": "Missing data", permission: "Permission", storage: "Storage", integrity: "Integrity", handoff: "Handoff" },
  topics: { identify: "Identify the pack", connection: "Connection", storage: "Storage space", permissions: "Permissions", integrity: "File integrity", transfer: "Handoff details", "follow-up": "Manual follow-up" },
  evidenceNames: { UNKNOWN: "UNKNOWN", observed: "Observed locally", reported: "Reported by user", documented: "Documented", disputed: "Disputed" },
  tiers: { UNKNOWN: "UNKNOWN", "self-reported": "Self-reported", documented: "Documented", reviewed: "Reviewed" },
  phases: { draft: "Draft", review: "For review", closed: "Documentation closed" },
  outcomes: { UNKNOWN: "UNKNOWN", "needs-action": "Needs manual attention", noted: "Noted", deferred: "Deferred" },
  actions: { opened: "Opened", "step-recorded": "Observation recorded", "note-added": "Note added", "review-requested": "Review requested", reopened: "Reopened", closed: "Closed" },
  issues: {
    format: "The file or record format is not supported.", limit: "The local record limit would be exceeded.",
    identity: "Select a valid pack and identifier.", duplicate: "That identifier already exists.",
    reference: "The referenced case or observation cannot be found.", source: "Provide the source, licence, date and reference.",
    date: "Use a valid calendar date.", timestamp: "The recorded UTC time is not valid.",
    text: "A field contains invalid characters or is too long.", transition: "That review action is not available for this state.",
    conflict: "The incoming file conflicts with local records. Nothing was replaced.", order: "An observation cannot predate its review.",
  },
};
const fr: GuidedCopy = {
  heading: "Examen guidé de récupération hors ligne",
  description: "Consignez une observation à la fois et repérez les points qui nécessitent une révision manuelle. Aucune donnée n’est transmise automatiquement.",
  caution: "UNKNOWN indique que l’information ne suffit pas pour décrire l’état. Ces notes ne confirment pas qu’un ensemble est utilisable.",
  unknown: "UNKNOWN", pack: "Ensemble installé", title: "Ce qui s’est passé", condition: "Problème constaté", source: "Nom de la source",
  licence: "Licence de la source", retrieved: "Date de récupération de la source", reference: "Référence de la source", tier: "Niveau de preuve",
  topic: "Sujet de l’examen", evidence: "État de la preuve", outcome: "Résultat manuel", note: "Notes",
  addCase: "Commencer un examen local", addStep: "Consigner une observation", updatePhase: "Actions de révision", chooseCase: "Choisir un examen",
  inspect: "Examiner les ensembles installés", noInspection: "Examinez d’abord les ensembles locaux avant de commencer un nouvel examen.",
  review: "Demander une révision", close: "Terminer la documentation", reopen: "Rouvrir la documentation",
  cases: "Examens consignés", observations: "Observations consignées", findings: "Points à examiner", reviewQueue: "Questions nécessitant une attention",
  file: "Fichier de révision local", open: "Choisir un fichier JSON local", save: "Exporter le JSON", saveSummary: "Exporter un résumé textuel", merge: "Accepter l’importation sans conflit",
  staged: "Aperçu disponible. Aucun dossier n’a été modifié.", saved: "Enregistré avec l’action de fichier choisie.",
  failed: "Impossible de lire ou d’enregistrer le fichier.", pending: "Lecture du fichier choisi.", noFile: "Choisissez d’abord un fichier.",
  search: "Rechercher un examen consigné", clear: "Effacer la recherche", empty: "Aucun examen correspondant.", number: "Nombre", unresolved: "Ouverts", priority: "Priorité",
  operations: { UNKNOWN: "UNKNOWN", interrupted: "Interrompu", "missing-data": "Données manquantes", permission: "Autorisation", storage: "Stockage", integrity: "Intégrité", handoff: "Transfert" },
  topics: { identify: "Identifier l’ensemble", connection: "Connexion", storage: "Espace de stockage", permissions: "Autorisations", integrity: "Intégrité des fichiers", transfer: "Détails du transfert", "follow-up": "Suivi manuel" },
  evidenceNames: { UNKNOWN: "UNKNOWN", observed: "Observé localement", reported: "Déclaré par l’utilisateur", documented: "Documenté", disputed: "Contesté" },
  tiers: { UNKNOWN: "UNKNOWN", "self-reported": "Déclaré", documented: "Documenté", reviewed: "Examiné" },
  phases: { draft: "Brouillon", review: "À examiner", closed: "Documentation terminée" },
  outcomes: { UNKNOWN: "UNKNOWN", "needs-action": "À examiner manuellement", noted: "Noté", deferred: "Reporté" },
  actions: { opened: "Ouvert", "step-recorded": "Observation consignée", "note-added": "Note ajoutée", "review-requested": "Révision demandée", reopened: "Rouvert", closed: "Terminé" },
  issues: {
    format: "Le format du fichier ou du dossier n’est pas pris en charge.", limit: "La limite des dossiers locaux serait dépassée.",
    identity: "Choisissez un ensemble et un identifiant valides.", duplicate: "Cet identifiant existe déjà.",
    reference: "Le dossier ou l’observation de référence est introuvable.", source: "Indiquez la source, la licence, la date et la référence.",
    date: "Utilisez une date valide.", timestamp: "L’horodatage UTC n’est pas valide.",
    text: "Un champ contient des caractères interdits ou est trop long.", transition: "Cette action de révision n’est pas disponible pour cet état.",
    conflict: "Le fichier entrant est en conflit avec les dossiers locaux. Rien n’a été remplacé.", order: "Une observation ne peut pas précéder son examen.",
  },
};
export function recoveryGuidedCopy(locale: GuidedLocale): GuidedCopy {
  return locale === "fr" ? fr : en;
}

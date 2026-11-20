import type { BriefCondition, BriefEventAction, BriefIssue, BriefOperation, BriefQuestionState, BriefQuestionTopic, BriefState, BriefTier } from "./recoverySupportBrief";
export interface SupportCopy {
  readonly title: string;
  readonly intro: string;
  readonly caution: string;
  readonly unknown: "UNKNOWN";
  readonly inspect: string;
  readonly noInspection: string;
  readonly pack: string;
  readonly caseTitle: string;
  readonly operation: string;
  readonly condition: string;
  readonly source: string;
  readonly licence: string;
  readonly retrieved: string;
  readonly reference: string;
  readonly tier: string;
  readonly addCase: string;
  readonly observation: string;
  readonly observationSummary: string;
  readonly addObservation: string;
  readonly question: string;
  readonly topic: string;
  readonly response: string;
  readonly state: string;
  readonly addQuestion: string;
  readonly empty: string;
  readonly list: string;
  readonly review: string;
  readonly count: string;
  readonly unresolved: string;
  readonly search: string;
  readonly clear: string;
  readonly file: string;
  readonly open: string;
  readonly merge: string;
  readonly save: string;
  readonly saveNarrative: string;
  readonly saved: string;
  readonly failed: string;
  readonly pending: string;
  readonly staged: string;
  readonly noFile: string;
  readonly requestReview: string;
  readonly archive: string;
  readonly reopen: string;
  readonly cases: string;
  readonly findings: string;
  readonly actions: Readonly<Record<BriefEventAction, string>>;
  readonly conditions: Readonly<Record<BriefCondition, string>>;
  readonly operations: Readonly<Record<BriefOperation, string>>;
  readonly tiers: Readonly<Record<BriefTier, string>>;
  readonly states: Readonly<Record<BriefState, string>>;
  readonly questionStates: Readonly<Record<BriefQuestionState, string>>;
  readonly topics: Readonly<Record<BriefQuestionTopic, string>>;
  readonly issues: Readonly<Record<BriefIssue, string>>;
}
const commonIssues = {
  format: "The local file has an unsupported format.",
  limit: "The file or local record exceeds the allowed limit.",
  identity: "Choose a valid pack and case identifier.",
  duplicate: "This identifier already exists.",
  source: "A source, licence, retrieval date and reference are required.",
  date: "Use a valid calendar date.",
  timestamp: "The UTC time is invalid.",
  text: "A field contains unsupported characters or excessive text.",
  reference: "The selected case or observation is unavailable.",
  sequence: "The activity history is inconsistent.",
  conflict: "Conflicting records must be reviewed manually; no existing record changed.",
  transition: "This review transition is not available.",
  privacy: "Remove personal details before sharing a local export.",
} as const;
const en: SupportCopy = {
  title: "Recovery support brief",
  intro: "Prepare questions, observations and source details for a manual recovery handoff. Everything remains in this browser session unless you choose to save a local file.",
  caution: "UNKNOWN means the available record does not establish the condition. These notes cannot show that a pack is usable. Avoid recording personal or medical details.",
  unknown: "UNKNOWN", inspect: "Inspect local packs", noInspection: "Inspect packs before creating a new brief. No usable state is inferred.",
  pack: "Pack", caseTitle: "Brief title", operation: "Operation", condition: "Condition", source: "Source", licence: "Licence", retrieved: "Retrieved on", reference: "Source reference", tier: "Evidence tier", addCase: "Create brief",
  observation: "Observation", observationSummary: "What was observed", addObservation: "Record observation", question: "Question", topic: "Topic", response: "Response (optional)", state: "Review state", addQuestion: "Record question",
  empty: "No briefs recorded locally.", list: "Recorded briefs", review: "Items for manual review", count: "Records", unresolved: "Open questions", search: "Search briefs", clear: "Clear search",
  file: "Local JSON file", open: "Choose local file", merge: "Add compatible records", save: "Save JSON", saveNarrative: "Save text summary", saved: "File saved.", failed: "The file could not be saved or opened.", pending: "Reading local file…", staged: "A local file is ready for review.", noFile: "No file selected.",
  requestReview: "Request review", archive: "Archive documentation", reopen: "Reopen review", cases: "Briefs", findings: "Review findings",
  actions: { created: "Created", "question-added": "Question added", "observation-added": "Observation added", "review-requested": "Review requested", reopened: "Reopened", archived: "Archived" },
  conditions: { UNKNOWN: "UNKNOWN", interrupted: "Interrupted", missing: "Missing", conflicting: "Conflicting", unavailable: "Unavailable" },
  operations: { pack: "Pack inspection", download: "Download", storage: "Storage", transfer: "Transfer", other: "Other" },
  tiers: { UNKNOWN: "UNKNOWN", "self-reported": "Self-reported", documented: "Documented", reviewed: "Reviewed" },
  states: { draft: "Draft", review: "Needs review", archived: "Archived" },
  questionStates: { UNKNOWN: "UNKNOWN", open: "Open", answered: "Answered", deferred: "Deferred" },
  topics: { "what-happened": "What happened", "missing-evidence": "Missing evidence", source: "Source details", "next-step": "Next manual step", handoff: "Handoff" },
  issues: commonIssues,
};
const fr: SupportCopy = {
  title: "Résumé de soutien à la récupération",
  intro: "Préparez des questions, des observations et des sources pour l’envoi d’un résumé manuel. Les notes restent dans cette session, sauf si vous enregistrez un fichier local.",
  caution: "UNKNOWN reste UNKNOWN lorsque les renseignements disponibles ne permettent pas de déterminer l’état. Ces notes ne confirment pas qu’un ensemble est utilisable. Évitez toute donnée personnelle ou médicale.",
  unknown: "UNKNOWN", inspect: "Examiner les ensembles locaux", noInspection: "Examinez les ensembles avant de créer un résumé. Aucun état utilisable n’est déduit.",
  pack: "Ensemble", caseTitle: "Titre du résumé", operation: "Opération", condition: "État", source: "Source", licence: "Licence", retrieved: "Date de collecte", reference: "Référence de la source", tier: "Niveau de preuve", addCase: "Créer un résumé",
  observation: "Observation", observationSummary: "Ce qui a été observé", addObservation: "Consigner l’observation", question: "Question", topic: "Sujet", response: "Réponse (facultative)", state: "État de la révision", addQuestion: "Consigner la question",
  empty: "Aucun résumé consigné localement.", list: "Résumés consignés", review: "Éléments à examiner manuellement", count: "Dossiers", unresolved: "Questions en attente", search: "Rechercher les résumés", clear: "Effacer la recherche",
  file: "Fichier JSON local", open: "Choisir un fichier local", merge: "Ajouter les dossiers compatibles", save: "Enregistrer JSON", saveNarrative: "Enregistrer le résumé texte", saved: "Fichier enregistré.", failed: "Le fichier n’a pas pu être ouvert ou enregistré.", pending: "Lecture du fichier local…", staged: "Un fichier local est prêt à examiner.", noFile: "Aucun fichier sélectionné.",
  requestReview: "Demander une révision", archive: "Archiver les notes", reopen: "Rouvrir la révision", cases: "Résumés", findings: "Points à examiner",
  actions: { created: "Créé", "question-added": "Question ajoutée", "observation-added": "Observation ajoutée", "review-requested": "Révision demandée", reopened: "Rouvert", archived: "Archivé" },
  conditions: { UNKNOWN: "UNKNOWN", interrupted: "Interrompu", missing: "Manquant", conflicting: "Contradictoire", unavailable: "Indisponible" },
  operations: { pack: "Examen de l’ensemble", download: "Téléchargement", storage: "Stockage", transfer: "Transfert", other: "Autre" },
  tiers: { UNKNOWN: "UNKNOWN", "self-reported": "Déclaré", documented: "Documenté", reviewed: "Examiné" },
  states: { draft: "Brouillon", review: "À examiner", archived: "Archivé" },
  questionStates: { UNKNOWN: "UNKNOWN", open: "En attente", answered: "Répondu", deferred: "Reporté" },
  topics: { "what-happened": "Ce qui s’est passé", "missing-evidence": "Preuve manquante", source: "Détails de la source", "next-step": "Prochaine étape manuelle", handoff: "Transfert" },
  issues: {
    format: "Le format du fichier local n’est pas pris en charge.", limit: "Le fichier ou le dossier local dépasse la limite.", identity: "Choisissez un ensemble et un identifiant valides.", duplicate: "Cet identifiant existe déjà.",
    source: "Une source, une licence, une date et une référence sont requises.", date: "Utilisez une date valide.", timestamp: "L’heure UTC n’est pas valide.", text: "Un champ contient des caractères interdits ou trop de texte.",
    reference: "Le dossier ou l’observation sélectionné est indisponible.", sequence: "L’historique des activités est incohérent.", conflict: "Les dossiers contradictoires exigent une révision manuelle\u202F; aucun dossier existant n’a été modifié.",
    transition: "Cette transition n’est pas disponible.", privacy: "Retirez les renseignements personnels avant de partager une exportation locale.",
  },
};
export function recoverySupportCopy(locale: "en" | "fr"): SupportCopy { return locale === "fr" ? fr : en; }

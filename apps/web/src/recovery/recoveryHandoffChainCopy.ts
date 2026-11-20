import type { ChainAction, ChainIssue, ChainLocale, ChainPhase, ChainRole, ChainState, ChainTier } from "./recoveryHandoffChain";

export interface ChainCopy {
  readonly heading: string;
  readonly introduction: string;
  readonly warning: string;
  readonly pack: string;
  readonly title: string;
  readonly role: string;
  readonly state: string;
  readonly phase: string;
  readonly note: string;
  readonly source: string;
  readonly licence: string;
  readonly retrievedOn: string;
  readonly tier: string;
  readonly reference: string;
  readonly newStep: string;
  readonly newLink: string;
  readonly newEvent: string;
  readonly from: string;
  readonly to: string;
  readonly node: string;
  readonly action: string;
  readonly saved: string;
  readonly save: string;
  readonly open: string;
  readonly apply: string;
  readonly merge: string;
  readonly cancel: string;
  readonly empty: string;
  readonly noPacks: string;
  readonly inspect: string;
  readonly pending: string;
  readonly failed: string;
  readonly conflict: string;
  readonly summary: string;
  readonly review: string;
  readonly packs: string;
  readonly steps: string;
  readonly links: string;
  readonly unknown: "UNKNOWN";
  readonly disputed: string;
  readonly unresolved: string;
  readonly find: string;
  readonly all: string;
  readonly sourceDate: string;
  readonly contentDisclaimer: string;
  readonly actions: Readonly<Record<ChainAction, string>>;
  readonly roles: Readonly<Record<ChainRole, string>>;
  readonly states: Readonly<Record<ChainState, string>>;
  readonly phases: Readonly<Record<ChainPhase, string>>;
  readonly tiers: Readonly<Record<ChainTier, string>>;
  readonly issues: Readonly<Record<ChainIssue, string>>;
}
const issuesEn: Readonly<Record<ChainIssue, string>> = {
  schema: "The file does not match the expected document structure.",
  limit: "The file or record limit was exceeded.",
  identity: "A record identifier is invalid.",
  source: "Source details are incomplete or invalid.",
  date: "A source retrieval date is invalid.",
  timestamp: "A record timestamp is invalid.",
  text: "Text is invalid or too long.",
  duplicate: "An identifier already exists.",
  reference: "A record refers to an unavailable or different pack step.",
  phase: "This review phase change is not supported.",
  conflict: "The import conflicts with existing records; no changes were applied.",
  cycle: "The handoff links would create a cycle.",
  sequence: "A link or event cannot predate the steps it describes.",
};
const issuesFr: Readonly<Record<ChainIssue, string>> = {
  schema: "Le fichier ne correspond pas à la structure attendue.",
  limit: "La limite de taille ou de fiches est dépassée.",
  identity: "Un identifiant de fiche est incorrect.",
  source: "Les renseignements sur la source sont incomplets ou incorrects.",
  date: "La date de consultation de la source est incorrecte.",
  timestamp: "L’horodatage d’une fiche est incorrect.",
  text: "Le texte est incorrect ou trop long.",
  duplicate: "Un identifiant existe déjà.",
  reference: "Une fiche renvoie à une étape absente ou à un autre ensemble.",
  phase: "Ce changement de phase n’est pas pris en charge.",
  conflict: "L’importation présente un conflit : aucune modification n’a été effectuée.",
  cycle: "Les liens créeraient un cycle.",
  sequence: "Un lien ou un évènement ne peut pas précéder ses étapes.",
};
const en: ChainCopy = {
  heading: "Recovery handoff chain",
  introduction: "Document a local sequence of recovery steps, evidence and handoff acknowledgments.",
  warning: "These records never establish pack readiness or accessibility of a place.",
  pack: "Pack", title: "Step title", role: "Role", state: "Observed condition", phase: "Review phase",
  note: "Notes", source: "Source", licence: "Licence", retrievedOn: "Retrieved on", tier: "Evidence tier", reference: "Reference",
  newStep: "Add step", newLink: "Add link", newEvent: "Record event", from: "From step", to: "To step", node: "Step", action: "Event",
  saved: "File saved.", save: "Save JSON", open: "Choose JSON file", apply: "Apply staged import", merge: "Preview import", cancel: "Discard staged file",
  empty: "No local handoff steps have been recorded.", noPacks: "No inspected packs available.", inspect: "Inspect packs before adding a step.",
  pending: "Working with a local file…", failed: "The local file operation did not finish.", conflict: "Import has conflicting records and cannot be applied.",
  summary: "Local summary", review: "Review findings", packs: "Packs", steps: "Steps", links: "Links", unknown: "UNKNOWN", disputed: "Disputed", unresolved: "Unresolved",
  find: "Filter steps", all: "All steps", sourceDate: "Source retrieval date", contentDisclaimer: "The content readiness status remains UNKNOWN.",
  actions: { noted: "Note", acknowledged: "Acknowledged", disputed: "Disputed", "review-requested": "Review requested", closed: "Closed", reopened: "Reopened" },
  roles: { origin: "Origin", intermediate: "Intermediate", recipient: "Recipient" },
  states: { UNKNOWN: "UNKNOWN", observed: "Observed", interrupted: "Interrupted", missing: "Missing", disputed: "Disputed" },
  phases: { draft: "Draft", review: "In review", closed: "Closed documentation" },
  tiers: { UNKNOWN: "UNKNOWN", "self-reported": "Self-reported", documented: "Documented", reviewed: "Reviewed" },
  issues: issuesEn,
};
const fr: ChainCopy = {
  heading: "Chaîne de transfert en récupération",
  introduction: "Consignez les étapes d’un transfert local, les sources et les confirmations.",
  warning: "Ces fiches ne confirment ni la disponibilité d’un ensemble ni l’accessibilité d’un lieu ; une révision est nécessaire.",
  pack: "Ensemble", title: "Titre de l’étape", role: "Rôle", state: "Condition observée", phase: "Phase de révision",
  note: "Notes", source: "Source", licence: "Licence", retrievedOn: "Consultée le", tier: "Niveau de preuve", reference: "Référence",
  newStep: "Ajouter une étape", newLink: "Ajouter un lien", newEvent: "Consigner un évènement", from: "Étape source", to: "Étape destinataire", node: "Étape", action: "Évènement",
  saved: "Fichier enregistré.", save: "Enregistrer le JSON", open: "Choisir un fichier JSON", apply: "Appliquer l’importation", merge: "Prévisualiser l’importation", cancel: "Écarter le fichier",
  empty: "Aucune étape locale n’est consignée.", noPacks: "Aucun ensemble examiné n’est disponible.", inspect: "Examinez les ensembles avant d’ajouter une étape.",
  pending: "Traitement local du fichier…", failed: "L’opération sur le fichier local n’a pas abouti.", conflict: "L’importation contient des fiches en conflit et ne peut pas être appliquée.",
  summary: "Résumé local", review: "Points à revoir", packs: "Ensembles", steps: "Étapes", links: "Liens", unknown: "UNKNOWN", disputed: "Contesté", unresolved: "Non résolu",
  find: "Filtrer les étapes", all: "Toutes les étapes", sourceDate: "Date de consultation de la source", contentDisclaimer: "L’état de disponibilité reste UNKNOWN.",
  actions: { noted: "Note", acknowledged: "Accusé de réception", disputed: "Contesté", "review-requested": "Révision demandée", closed: "Clôturé", reopened: "Rouverte" },
  roles: { origin: "Origine", intermediate: "Intermédiaire", recipient: "Destinataire" },
  states: { UNKNOWN: "UNKNOWN", observed: "Observé", interrupted: "Interrompu", missing: "Manquant", disputed: "Contesté" },
  phases: { draft: "Brouillon", review: "En révision", closed: "Dossier clôturé" },
  tiers: { UNKNOWN: "UNKNOWN", "self-reported": "Autodéclaré", documented: "Documenté", reviewed: "Examiné" },
  issues: issuesFr,
};
export function recoveryHandoffChainCopy(locale: ChainLocale): ChainCopy { return locale === "fr" ? fr : en; }

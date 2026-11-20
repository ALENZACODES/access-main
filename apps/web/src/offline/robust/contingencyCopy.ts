import type { Language } from "./regionDownload";
import type { CheckpointKind, CheckpointSignal, FollowUp, PlanFilter, PlanSort } from "./contingencyPlan";

export const CONTINGENCY_KINDS: readonly CheckpointKind[] = [
  "arrival", "entrance", "path", "lift", "transport", "washroom", "rest", "departure", "other",
];
export const CONTINGENCY_SIGNALS: readonly CheckpointSignal[] = [
  "UNKNOWN", "noted", "issue", "changed", "not-applicable",
];
export const CONTINGENCY_FOLLOWUPS: readonly FollowUp[] = [
  "open", "question-ready", "alternative-noted", "closed-note",
];
export const CONTINGENCY_FILTERS: readonly PlanFilter[] = ["all", "open", "issue", "UNKNOWN", "closed-note"];
export const CONTINGENCY_SORTS: readonly PlanSort[] = ["listed", "recent", "kind"];

export const CONTINGENCY_COPY = {
  en: {
    title: "Offline contingency checklist",
    intro: "Prepare practical questions and possible alternatives for a journey. Every observation is entered by you.",
    caution: "This is a personal planning note, not a statement that a location or service is accessible.",
    privacy: "Notes stay in this page until you explicitly export them. Exported files can contain personal information.",
    open: "Open contingency checklist", close: "Close contingency checklist",
    empty: "No checkpoints added yet.", added: "Checkpoint added to this page.",
    updated: "Manual note updated.", sourceUpdated: "Local copy reference recorded.",
    reordered: "Checkpoint order changed.", validation: "Cannot use that entry. Review the details.",
    imported: "Notes imported as history. They do not describe current conditions.",
    exportWarning: "File prepared. Store it privately if it contains personal notes.",
    titleLabel: "Checkpoint name", kind: "Checkpoint type", question: "Question to ask",
    alternative: "Possible alternative to ask about", note: "Your notes", signal: "Your observation",
    followUp: "Follow-up note", source: "Optional saved-cell reference",
    noSource: "No source selected", add: "Add checkpoint", save: "Save manual changes",
    attach: "Record local source", before: "Move earlier", after: "Move later",
    search: "Search checkpoints", filter: "Filter checkpoints", sort: "Order checkpoints",
    select: "Choose checkpoint", count: "Checkpoints", openCount: "Notes still open",
    issueCount: "Issues noted", unknownCount: "UNKNOWN observations",
    alternatives: "Possible alternatives noted", savedCount: "Matching local copies",
    unknownSource: "UNKNOWN local sources", status: "Follow-up", evidence: "Local-copy evidence",
    sourceName: "Source name", licence: "Licence", date: "Source date",
    bytes: "Listed file bytes", previous: "Previous page", next: "Next page",
    page: "Checkpoint pages", noMatches: "No checkpoints match those filters.",
    json: "Export JSON notes", text: "Export text notes", import: "Import JSON notes",
    importNotice: "Import replaces this page's notes; it does not change saved offline cells.",
    reset: "Clear this page", resetNotice: "All unsaved notes on this page will be lost.",
    questionPrompt: "What would I ask someone about this checkpoint?",
    alternativePrompt: "Write a possible alternative to ask about. Do not assume it exists.",
    unknown: "UNKNOWN", captured: "Local file status is not a physical access condition.",
    eventCount: "Manual history entries", fileTooLarge: "The file exceeds the local import limit.",
  },
  fr: {
    title: "Liste de continuité hors ligne",
    intro: "Préparez des questions pratiques et d’éventuelles solutions de rechange pour un trajet. Chaque observation est saisie par vous.",
    caution: "Il s’agit de notes personnelles, et non d’une affirmation sur l’accessibilité d’un lieu ou d’un service.",
    privacy: "Les notes restent dans cette page jusqu’à leur exportation explicite. Les fichiers exportés peuvent contenir des renseignements personnels.",
    open: "Ouvrir la liste de continuité", close: "Fermer la liste de continuité",
    empty: "Aucun point de contrôle ajouté.", added: "Point de contrôle ajouté à cette page.",
    updated: "Note manuelle modifiée.", sourceUpdated: "Référence à la copie locale enregistrée.",
    reordered: "Ordre des points de contrôle modifié.", validation: "Cette entrée ne peut pas être utilisée. Examinez les détails.",
    imported: "Notes importées comme historique. Elles ne décrivent pas les conditions actuelles.",
    exportWarning: "Fichier préparé. Conservez-le en privé s’il contient des notes personnelles.",
    titleLabel: "Nom du point de contrôle", kind: "Type de point de contrôle", question: "Question à poser",
    alternative: "Solution de rechange éventuelle à demander", note: "Vos notes", signal: "Votre observation",
    followUp: "Note de suivi", source: "Référence facultative à une cellule enregistrée",
    noSource: "Aucune source sélectionnée", add: "Ajouter un point", save: "Enregistrer les changements manuels",
    attach: "Noter la source locale", before: "Déplacer plus tôt", after: "Déplacer plus tard",
    search: "Rechercher des points", filter: "Filtrer les points", sort: "Classer les points",
    select: "Choisir un point", count: "Points de contrôle", openCount: "Notes encore ouvertes",
    issueCount: "Problèmes notés", unknownCount: "Observations UNKNOWN",
    alternatives: "Solutions éventuelles notées", savedCount: "Copies locales concordantes",
    unknownSource: "Sources locales UNKNOWN", status: "Suivi", evidence: "Données de copie locale",
    sourceName: "Nom de la source", licence: "Licence", date: "Date de la source",
    bytes: "Octets indiqués pour le fichier", previous: "Page précédente", next: "Page suivante",
    page: "Pages de points de contrôle", noMatches: "Aucun point ne correspond aux filtres.",
    json: "Exporter les notes JSON", text: "Exporter les notes texte", import: "Importer les notes JSON",
    importNotice: "L’importation remplace les notes de cette page ; elle ne modifie pas les cellules hors ligne enregistrées.",
    reset: "Effacer cette page", resetNotice: "Toutes les notes non enregistrées de cette page seront perdues.",
    questionPrompt: "Que demanderais-je à propos de ce point de contrôle ?",
    alternativePrompt: "Notez une solution éventuelle à demander. Ne supposez pas qu’elle existe.",
    unknown: "UNKNOWN", captured: "L’état du fichier local ne décrit pas l’accessibilité physique.",
    eventCount: "Entrées dans l’historique manuel", fileTooLarge: "Le fichier dépasse la limite d’importation locale.",
  },
} as const;

const KIND_LABELS: Record<Language, Record<CheckpointKind, string>> = {
  en: {
    arrival: "Getting there", entrance: "Entrance", path: "Path or corridor", lift: "Lift or vertical access",
    transport: "Transport connection", washroom: "Washroom", rest: "Rest point", departure: "Leaving", other: "Other",
  },
  fr: {
    arrival: "Arrivée", entrance: "Entrée", path: "Passage ou corridor", lift: "Ascenseur ou accès vertical",
    transport: "Correspondance", washroom: "Toilettes", rest: "Espace de repos", departure: "Départ", other: "Autre",
  },
};
const SIGNAL_LABELS: Record<Language, Record<CheckpointSignal, string>> = {
  en: {
    UNKNOWN: "UNKNOWN", noted: "Observation noted", issue: "Possible issue noted",
    changed: "Change noted", "not-applicable": "Not applicable to my plan",
  },
  fr: {
    UNKNOWN: "UNKNOWN", noted: "Observation notée", issue: "Problème éventuel noté",
    changed: "Changement noté", "not-applicable": "Sans objet pour mon plan",
  },
};
const FOLLOWUP_LABELS: Record<Language, Record<FollowUp, string>> = {
  en: { open: "Open note", "question-ready": "Question prepared", "alternative-noted": "Alternative written", "closed-note": "Note closed" },
  fr: { open: "Note ouverte", "question-ready": "Question préparée", "alternative-noted": "Solution éventuelle notée", "closed-note": "Note fermée" },
};
const FILTER_LABELS: Record<Language, Record<PlanFilter, string>> = {
  en: { all: "All checkpoints", open: "Open notes", issue: "Issues", UNKNOWN: "UNKNOWN", "closed-note": "Closed notes" },
  fr: { all: "Tous les points", open: "Notes ouvertes", issue: "Problèmes", UNKNOWN: "UNKNOWN", "closed-note": "Notes fermées" },
};
const SORT_LABELS: Record<Language, Record<PlanSort, string>> = {
  en: { listed: "Planned order", recent: "Recently edited", kind: "Checkpoint type" },
  fr: { listed: "Ordre du plan", recent: "Modification récente", kind: "Type de point" },
};
/** These are prompts to ask, never assertions about a place. */
export const CONTINGENCY_QUESTIONS: Record<Language, Readonly<Record<CheckpointKind, readonly string[]>>> = {
  en: {
    arrival: ["Where should I plan to arrive?", "Is there a place to pause before entering?", "What could change at the arrival point?"],
    entrance: ["Which entrance should I ask about?", "What happens if the planned entrance is closed?", "Can the entrance be checked before departure?"],
    path: ["Which route section should I ask about?", "Is a different path described by the provider?", "Who can describe a temporary change to this path?"],
    lift: ["What is the reported lift status, if known?", "Who can describe an alternate vertical route?", "How would I learn about a change before leaving?"],
    transport: ["What is the planned transfer point?", "Whom can I ask about a different connection?", "Where can I review the operator's latest published instructions?"],
    washroom: ["What details about the washroom would help my planning?", "Where might I ask about a different facility?", "Is there a contact who can answer a specific question?"],
    rest: ["Where might I ask about a place to pause?", "What facilities should I ask about?", "What alternative could I ask the venue to describe?"],
    departure: ["Where is the intended exit?", "What should I ask if the exit route changes?", "Who can describe other departure options?"],
    other: ["What is still UNKNOWN?", "What can I ask before making a decision?", "What possible alternative needs a source?"],
  },
  fr: {
    arrival: ["Où dois-je prévoir mon arrivée ?", "Y a-t-il un endroit où faire une pause avant l’entrée ?", "Qu’est-ce qui pourrait changer au point d’arrivée ?"],
    entrance: ["À propos de quelle entrée dois-je poser une question ?", "Que se passe-t-il si l’entrée prévue est fermée ?", "L’entrée peut-elle être examinée avant le départ ?"],
    path: ["À propos de quel segment du trajet dois-je poser une question ?", "Le fournisseur décrit-il un autre passage ?", "Qui peut décrire une modification temporaire du passage ?"],
    lift: ["Quel est l’état annoncé de l’ascenseur, s’il est connu ?", "Qui peut décrire un autre accès vertical ?", "Comment connaître un changement avant le départ ?"],
    transport: ["Quel est le point de correspondance prévu ?", "À qui demander une autre correspondance ?", "Où consulter les dernières consignes publiées par l’exploitant ?"],
    washroom: ["Quels renseignements sur les toilettes faciliteraient ma planification ?", "Où demander des renseignements sur une autre installation ?", "Un contact peut-il répondre à une question précise ?"],
    rest: ["Où demander des renseignements sur un lieu de repos ?", "À propos de quelles installations dois-je poser des questions ?", "Quelle autre possibilité demander au lieu de décrire ?"],
    departure: ["Quelle est la sortie prévue ?", "Que demander si le trajet de sortie change ?", "Qui peut décrire les autres possibilités de départ ?"],
    other: ["Qu’est-ce qui demeure UNKNOWN ?", "Que puis-je demander avant de prendre une décision ?", "Quelle solution éventuelle nécessite une source ?"],
  },
};
export const contingencyKindText = (value: CheckpointKind, language: Language): string => KIND_LABELS[language][value];
export const contingencySignalText = (value: CheckpointSignal, language: Language): string => SIGNAL_LABELS[language][value];
export const contingencyFollowupText = (value: FollowUp, language: Language): string => FOLLOWUP_LABELS[language][value];
export const contingencyFilterText = (value: PlanFilter, language: Language): string => FILTER_LABELS[language][value];
export const contingencySortText = (value: PlanSort, language: Language): string => SORT_LABELS[language][value];
export function auditContingencyCopy(): readonly string[] {
  const findings: string[] = [];
  for (const key of Object.keys(CONTINGENCY_COPY.en) as Array<keyof typeof CONTINGENCY_COPY.en>) {
    if (!CONTINGENCY_COPY.en[key].trim() || !CONTINGENCY_COPY.fr[key].trim()) findings.push(key);
  }
  for (const item of Object.values(CONTINGENCY_COPY.fr)) {
    if (item.includes("'")) findings.push("apostrophe");
    if (/(?<!\u00a0):/u.test(item)) findings.push("colon");
    if (/(?<!\u202f)[;!?]/u.test(item)) findings.push("punctuation");
  }
  return findings;
}

import type { Language } from "./regionDownload";
import {
  PREPARATION_FILTERS, PREPARATION_SORTS, PREPARATION_TOPICS,
  type PreparationEvidence, type PreparationFilter, type PreparationSort,
  type PreparationStatus, type PreparationTopic,
} from "./accessPreparation";

/** Copy describes the person's questions, not any assumed physical conditions. */
export const PREPARATION_COPY = {
  en: {
    title: "My access preparation notes",
    intro: "Keep questions and notes for an outing. Local copies and personal notes do not establish physical accessibility.",
    open: "Open preparation notes", close: "Close preparation notes",
    privacy: "Notes remain in this page until you export them. Exported files can contain private information. Store them carefully.",
    question: "Question to consider", topic: "Topic", add: "Add question",
    answer: "Your note", note: "A personal note is not a source statement.",
    source: "Source name", sourceDate: "Source date", evidence: "Note type",
    status: "Question status", cell: "Optional offline cell", noCell: "No linked cell",
    change: "Save changes", remove: "Delete question", confirmDelete: "Delete the selected question?",
    search: "Search notes", filter: "Filter by status", sort: "Sort notes",
    topicFilter: "Filter by topic", all: "All",
    total: "Questions", openCount: "Open", answered: "Answered", unknownCount: "UNKNOWN",
    notNeeded: "Not needed", sourceNotes: "Source notes", linked: "Linked local cells",
    localStatus: "Offline information state", saved: "Saved local copy", unknown: "UNKNOWN",
    refresh: "Review current local copies", start: "No notes yet. Add a question to begin.",
    noMatch: "No questions match this view.", select: "Choose a question",
    import: "Import a notes file", exportJson: "Export JSON notes", exportText: "Export text summary",
    imported: "Historical notes imported. Current local copies are not inferred.",
    savedLocally: "Notes changed in this page only.", removed: "Question removed from this page.",
    invalid: "The notes could not be accepted. Nothing was changed.",
    exportWarning: "File prepared. Keep exported notes private.",
    previous: "Previous questions", next: "Next questions", page: "Question pages",
    template: "Suggested question", custom: "Write my own question", addTemplate: "Add suggested question",
    busy: "Working with local data", none: "UNKNOWN", licence: "Source licence or terms",
    reminder: "UNKNOWN means no dependable local observation is available. It is not a statement about the place.",
    clear: "Clear answer", limit: "The notes limit has been reached.",
  },
  fr: {
    title: "Mes notes de préparation d’accès",
    intro: "Conservez vos questions et vos notes pour une sortie. Les copies locales et les notes personnelles n’établissent pas l’accessibilité physique.",
    open: "Ouvrir les notes de préparation", close: "Fermer les notes de préparation",
    privacy: "Les notes restent sur cette page jusqu’à leur exportation. Les fichiers exportés peuvent contenir des renseignements privés. Conservez-les avec soin.",
    question: "Question à examiner", topic: "Sujet", add: "Ajouter une question",
    answer: "Votre note", note: "Une note personnelle n’est pas une déclaration de source.",
    source: "Nom de la source", sourceDate: "Date de la source", evidence: "Type de note",
    status: "État de la question", cell: "Cellule hors ligne facultative", noCell: "Aucune cellule liée",
    change: "Enregistrer les modifications", remove: "Supprimer la question", confirmDelete: "Supprimer la question choisie ?",
    search: "Rechercher des notes", filter: "Filtrer par état", sort: "Trier les notes",
    topicFilter: "Filtrer par sujet", all: "Toutes",
    total: "Questions", openCount: "Ouvertes", answered: "Répondues", unknownCount: "UNKNOWN",
    notNeeded: "Non nécessaires", sourceNotes: "Notes de source", linked: "Cellules locales liées",
    localStatus: "État des renseignements hors ligne", saved: "Copie locale enregistrée", unknown: "UNKNOWN",
    refresh: "Examiner les copies locales actuelles", start: "Aucune note pour le moment. Ajoutez une question pour commencer.",
    noMatch: "Aucune question ne correspond à cette vue.", select: "Choisir une question",
    import: "Importer un fichier de notes", exportJson: "Exporter les notes JSON", exportText: "Exporter le résumé texte",
    imported: "Notes historiques importées. L’état actuel des copies locales n’est pas déduit.",
    savedLocally: "Notes modifiées sur cette page uniquement.", removed: "Question supprimée de cette page.",
    invalid: "Les notes n’ont pas pu être acceptées. Rien n’a été modifié.",
    exportWarning: "Fichier préparé. Conservez les notes exportées de manière privée.",
    previous: "Questions précédentes", next: "Questions suivantes", page: "Pages des questions",
    template: "Question suggérée", custom: "Rédiger ma propre question", addTemplate: "Ajouter la question suggérée",
    busy: "Traitement des données locales", none: "UNKNOWN", licence: "Licence ou conditions de la source",
    reminder: "UNKNOWN signifie qu’aucune observation locale fiable n’est disponible. Cela ne décrit pas le lieu.",
    clear: "Effacer la réponse", limit: "La limite de notes est atteinte.",
  },
} as const;

export const TOPIC_LABELS: Readonly<Record<Language, Record<PreparationTopic, string>>> = {
  en: { entry: "Entrance", route: "Approach", washroom: "Washroom", rest: "Rest stops",
    transport: "Transport", communication: "Communication", storage: "Offline information",
    contact: "Contact", other: "Other" },
  fr: { entry: "Entrée", route: "Approche", washroom: "Toilettes", rest: "Pauses",
    transport: "Transport", communication: "Communication", storage: "Information hors ligne",
    contact: "Contact", other: "Autre" },
};
export const STATUS_LABELS: Readonly<Record<Language, Record<PreparationStatus, string>>> = {
  en: { open: "Open", answered: "Answered", UNKNOWN: "UNKNOWN", "not-needed": "Not needed" },
  fr: { open: "Ouverte", answered: "Répondue", UNKNOWN: "UNKNOWN", "not-needed": "Non nécessaire" },
};
export const EVIDENCE_LABELS: Readonly<Record<Language, Record<PreparationEvidence, string>>> = {
  en: { "personal-note": "My observation", "source-note": "Named source note", UNKNOWN: "UNKNOWN" },
  fr: { "personal-note": "Mon observation", "source-note": "Note avec source", UNKNOWN: "UNKNOWN" },
};
export const SORT_LABELS: Readonly<Record<Language, Record<PreparationSort, string>>> = {
  en: { created: "Listed order", updated: "Recently changed", topic: "Topic", status: "Status" },
  fr: { created: "Ordre de saisie", updated: "Modifications récentes", topic: "Sujet", status: "État" },
};
export const FILTER_LABELS: Readonly<Record<Language, Record<PreparationFilter, string>>> = {
  en: { all: "All", open: "Open", answered: "Answered", UNKNOWN: "UNKNOWN", "not-needed": "Not needed" },
  fr: { all: "Toutes", open: "Ouvertes", answered: "Répondues", UNKNOWN: "UNKNOWN", "not-needed": "Non nécessaires" },
};
export function preparationCopy(language: Language) { return PREPARATION_COPY[language]; }
export function topicLabel(value: PreparationTopic, language: Language): string { return TOPIC_LABELS[language][value]; }
export function statusLabel(value: PreparationStatus, language: Language): string { return STATUS_LABELS[language][value]; }
export function evidenceLabel(value: PreparationEvidence, language: Language): string { return EVIDENCE_LABELS[language][value]; }
export function sortLabel(value: PreparationSort, language: Language): string { return SORT_LABELS[language][value]; }
export function filterLabel(value: PreparationFilter, language: Language): string { return FILTER_LABELS[language][value]; }

/** Fail closed on incomplete copy, unsupported language, or typography regressions. */
export function auditPreparationCopy(): readonly string[] {
  const errors: string[] = [];
  const en = PREPARATION_COPY.en;
  const fr = PREPARATION_COPY.fr;
  const englishKeys = Object.keys(en).sort();
  const frenchKeys = Object.keys(fr).sort();
  if (englishKeys.join("|") !== frenchKeys.join("|")) errors.push("copy-keys");
  for (const [key, value] of Object.entries(fr)) {
    if (!value.trim()) errors.push(`empty-fr:${key}`);
    if (value.includes("'")) errors.push(`apostrophe:${key}`);
    if (/(?<!\u00a0):/u.test(value)) errors.push(`colon:${key}`);
    if (/(?<!\u202f)[;!?]/u.test(value)) errors.push(`punctuation:${key}`);
  }
  for (const [key, value] of Object.entries(en)) if (!value.trim()) errors.push(`empty-en:${key}`);
  for (const set of [PREPARATION_TOPICS, PREPARATION_SORTS, PREPARATION_FILTERS]) {
    for (const key of set) {
      for (const lang of ["en", "fr"] as const) {
        const labels = set === PREPARATION_TOPICS ? TOPIC_LABELS[lang] :
          set === PREPARATION_SORTS ? SORT_LABELS[lang] : FILTER_LABELS[lang];
        if (!(labels as Record<string, string>)[key]) errors.push(`missing-label:${lang}:${key}`);
      }
    }
  }
  if (STATUS_LABELS.en.UNKNOWN !== "UNKNOWN" || STATUS_LABELS.fr.UNKNOWN !== "UNKNOWN") errors.push("unknown");
  return errors;
}

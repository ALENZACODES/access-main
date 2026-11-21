import type { Language } from "./regionDownload";
import type { SheetCategory, SheetPriority, SheetReply, SheetAssessment } from "./offlineQuestionSheet";

export const SHEET_COPY = {
  en: {
    title: "Personal offline question sheet", intro: "Prepare questions and a printed handout for an outing. Saved data and recorded replies do not prove physical accessibility.",
    open: "Open question sheet", close: "Close question sheet", name: "Sheet title", question: "Question to ask", note: "Personal follow-up note",
    replyText: "Reply as recorded by you", category: "Topic", priority: "Importance", cell: "Related offline cell", add: "Add question",
    update: "Save edits", remove: "Remove", up: "Move up", down: "Move down", status: "Reply status", questionList: "Prepared questions",
    privacy: "Exports can contain private notes. Review the handout before sharing it.", exportText: "Save text handout", exportJson: "Save JSON backup",
    exportPrint: "Print handout", importJson: "Import JSON backup", importPreview: "Preview import", applyImport: "Replace with this backup",
    cancelImport: "Cancel import", confirm: "An imported backup will replace your current questions; inspect the preview first.",
    noRows: "No questions match the current filters.", empty: "Add a question to prepare your handout.", filter: "Show", sort: "Order",
    search: "Find a question", previous: "Previous page", next: "Next page", source: "Source", licence: "Licence", date: "Source date",
    physical: "Physical access", storage: "Saved data", reason: "Data state", unknown: "UNKNOWN", saved: "Saved",
    totals: "Questions", unanswered: "Still need replies", recorded: "Replies recorded", changed: "Your question sheet was updated.",
    failed: "The change could not be completed. Your current questions were not replaced.", imported: "Backup imported. Physical conditions remain UNKNOWN.",
    review: "Import preview", printGuide: "A printed copy is a personal planning aid, not evidence of current access conditions.",
    includeNotes: "Include personal notes in export", noCell: "No linked cell", readOnly: "This is a manually prepared question, not a source claim.",
    choiceAll: "All questions", choiceUnknown: "Local data UNKNOWN", choiceSaved: "Saved local data", choiceNeeds: "Needs reply", choiceEssential: "Essential questions",
    sortOrdered: "Your order", sortPriority: "Importance", sortCategory: "Topic", sortCell: "Cell reference",
    noteEmpty: "No personal note", replyEmpty: "No reply recorded", requested: "Asked", notAsked: "Not asked", replied: "Reply recorded",
    fileProblem: "Backup cannot be read.", format: "Export format", region: "Region", copy: "Copy handout text",
  },
  fr: {
    title: "Fiche de questions hors ligne", intro: "Préparez des questions et un document imprimable pour une sortie. Les données enregistrées et les réponses notées ne prouvent pas l’accessibilité physique.",
    open: "Ouvrir la fiche de questions", close: "Fermer la fiche de questions", name: "Titre de la fiche", question: "Question à poser", note: "Note personnelle de suivi",
    replyText: "Réponse notée par vous", category: "Sujet", priority: "Importance", cell: "Cellule hors ligne associée", add: "Ajouter une question",
    update: "Enregistrer les modifications", remove: "Retirer", up: "Monter", down: "Descendre", status: "État de la réponse", questionList: "Questions préparées",
    privacy: "Les exports peuvent contenir des notes privées. Relisez le document avant de le partager.", exportText: "Enregistrer la fiche texte", exportJson: "Enregistrer la copie JSON",
    exportPrint: "Imprimer la fiche", importJson: "Importer la copie JSON", importPreview: "Aperçu de l’import", applyImport: "Remplacer avec cette copie",
    cancelImport: "Annuler l’import", confirm: "Une copie importée remplace vos questions actuelles\u202f; examinez l’aperçu d’abord.",
    noRows: "Aucune question ne correspond aux filtres.", empty: "Ajoutez une question pour préparer votre fiche.", filter: "Afficher", sort: "Ordre",
    search: "Rechercher une question", previous: "Page précédente", next: "Page suivante", source: "Source", licence: "Licence", date: "Date de la source",
    physical: "Accès physique", storage: "Données enregistrées", reason: "État des données", unknown: "UNKNOWN", saved: "Enregistrées",
    totals: "Questions", unanswered: "Réponses encore nécessaires", recorded: "Réponses notées", changed: "Votre fiche a été mise à jour.",
    failed: "La modification n’a pas pu être effectuée. Vos questions actuelles ont été conservées.", imported: "Copie importée. Les conditions physiques restent UNKNOWN.",
    review: "Aperçu de l’import", printGuide: "Une copie imprimée aide à planifier\u202f; elle ne prouve pas les conditions d’accès actuelles.",
    includeNotes: "Inclure les notes personnelles dans l’export", noCell: "Aucune cellule associée", readOnly: "Question préparée manuellement, pas une affirmation de source.",
    choiceAll: "Toutes les questions", choiceUnknown: "Données locales UNKNOWN", choiceSaved: "Données locales enregistrées", choiceNeeds: "Réponse nécessaire", choiceEssential: "Questions essentielles",
    sortOrdered: "Votre ordre", sortPriority: "Importance", sortCategory: "Sujet", sortCell: "Référence de cellule",
    noteEmpty: "Aucune note personnelle", replyEmpty: "Aucune réponse notée", requested: "Posée", notAsked: "Non posée", replied: "Réponse notée",
    fileProblem: "La copie ne peut pas être lue.", format: "Format d’export", region: "Région", copy: "Copier la fiche texte",
  },
} as const;
export const SHEET_TOPIC_COPY: Record<Language, Record<SheetCategory, string>> = {
  en: { arrival: "Arrival", entrance: "Entrance", route: "Indoor route", washroom: "Washroom", rest: "Rest", communication: "Communication", departure: "Departure", other: "Other" },
  fr: { arrival: "Arrivée", entrance: "Entrée", route: "Parcours intérieur", washroom: "Toilettes", rest: "Repos", communication: "Communication", departure: "Départ", other: "Autre" },
};
export const SHEET_PRIORITY_COPY: Record<Language, Record<SheetPriority, string>> = {
  en: { essential: "Essential", helpful: "Helpful", optional: "Optional" },
  fr: { essential: "Essentiel", helpful: "Utile", optional: "Facultatif" },
};
export const SHEET_REPLY_COPY: Record<Language, Record<SheetReply, string>> = {
  en: { "not-asked": "Not asked", asked: "Asked", "reply-noted": "Reply recorded" },
  fr: { "not-asked": "Non posée", asked: "Posée", "reply-noted": "Réponse notée" },
};
export const SHEET_REASON_COPY: Record<Language, Record<SheetAssessment["reason"], string>> = {
  en: { present: "Local copy saved", missing: "Not downloaded", stale: "Source changed", unreadable: "Local copy unreadable", unlisted: "No source cell linked", "inventory-unavailable": "Inventory UNKNOWN", "source-conflict": "Stored source does not match" },
  fr: { present: "Copie locale enregistrée", missing: "Non téléchargée", stale: "Source modifiée", unreadable: "Copie locale illisible", unlisted: "Aucune cellule liée", "inventory-unavailable": "Inventaire UNKNOWN", "source-conflict": "La source enregistrée ne correspond pas" },
};
export function questionSheetCopy(language: Language) { return SHEET_COPY[language]; }
export function auditSheetCopy(): readonly string[] {
  const errors: string[] = [];
  const en = SHEET_COPY.en;
  const fr = SHEET_COPY.fr;
  for (const key of Object.keys(en) as Array<keyof typeof en>) {
    if (!en[key].trim() || !fr[key].trim()) errors.push(key);
  }
  for (const text of Object.values(fr)) {
    if (text.includes("'")) errors.push("apostrophe");
    if (/(?<!\u00a0):/u.test(text)) errors.push("colon");
    if (/(?<!\u202f)[;!?]/u.test(text)) errors.push("punctuation");
  }
  return errors;
}

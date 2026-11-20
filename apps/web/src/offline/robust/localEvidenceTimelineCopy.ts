import type { Language } from "./regionDownload";
import type { TimelineCause, TimelineChange, TimelineFilter, TimelineOrder, TimelineNoteStatus } from "./localEvidenceTimeline";
export const TIMELINE_COPY = {
  en: {
    title: "Offline evidence timeline",
    intro: "Compare device-local records from two explicit readings. This does not describe access at a physical place.",
    capture: "Capture local records", compare: "Compare latest readings", reset: "Clear local history",
    exportJson: "Export history JSON", exportText: "Export text summary", importJson: "Import history JSON",
    notes: "Historical observations may contain personal notes. Keep exported files private.",
    noHistory: "No local readings have been captured.", onlyOne: "Capture another reading to compare changes.",
    unknown: "UNKNOWN", reading: "Reading local records…", captured: "Reading recorded in this page.",
    importDone: "Historical notes imported. Check current copies separately.", invalid: "File could not be read safely.",
    exportDone: "Save exported history in a private location.", noResults: "No matching cells.",
    source: "Source", licence: "Licence", date: "Source date", size: "Expected bytes", state: "Local state",
    change: "Change", cause: "Reason", before: "Earlier reading", after: "Later reading", noteCount: "Notes",
    search: "Search cell or source", filter: "Filter changes", order: "Sort results", page: "Review pages",
    previous: "Previous page", next: "Next page", noteCell: "Cell for note", noteText: "Add a manual note",
    noteSave: "Save note", noteStatus: "Note status", noteUpdate: "Update note status", noteList: "Manual notes",
    noteSelect: "Select note", removeWarning: "Clearing this page does not delete downloaded files.",
    full: "The history has reached its limit.", noSelection: "Select a listed cell first.",
    status: "History status", total: "Listed cells", saved: "Saved copies", unknownCount: "UNKNOWN copies",
    lost: "Copies no longer present", gained: "New local copies", changed: "Changed local readings",
    emptyNote: "Enter a note before saving.", error: "The action could not be completed.",
  },
  fr: {
    title: "Historique des preuves hors ligne",
    intro: "Comparez les enregistrements locaux de deux lectures explicites. Cela ne décrit pas l’accès à un lieu physique.",
    capture: "Relever les enregistrements locaux", compare: "Comparer les dernières lectures", reset: "Effacer l’historique local",
    exportJson: "Exporter l’historique JSON", exportText: "Exporter le résumé texte", importJson: "Importer l’historique JSON",
    notes: "Les observations historiques peuvent contenir des notes personnelles. Conservez les fichiers exportés dans un lieu privé.",
    noHistory: "Aucune lecture locale n’a été enregistrée.", onlyOne: "Relevez une autre lecture pour comparer les changements.",
    unknown: "UNKNOWN", reading: "Lecture des enregistrements locaux…", captured: "Lecture enregistrée sur cette page.",
    importDone: "Notes historiques importées. Contrôlez séparément les copies actuelles.", invalid: "Le fichier ne peut pas être lu de manière sûre.",
    exportDone: "Conservez l’historique exporté dans un lieu privé.", noResults: "Aucune cellule correspondante.",
    source: "Source", licence: "Licence", date: "Date de la source", size: "Octets prévus", state: "État local",
    change: "Changement", cause: "Raison", before: "Lecture précédente", after: "Lecture suivante", noteCount: "Notes",
    search: "Chercher une cellule ou une source", filter: "Filtrer les changements", order: "Trier les résultats", page: "Pages de révision",
    previous: "Page précédente", next: "Page suivante", noteCell: "Cellule de la note", noteText: "Ajouter une note manuelle",
    noteSave: "Enregistrer la note", noteStatus: "État de la note", noteUpdate: "Modifier l’état de la note", noteList: "Notes manuelles",
    noteSelect: "Choisir une note", removeWarning: "Effacer cette page ne supprime pas les fichiers téléchargés.",
    full: "L’historique a atteint sa limite.", noSelection: "Choisissez d’abord une cellule répertoriée.",
    status: "État de l’historique", total: "Cellules répertoriées", saved: "Copies enregistrées", unknownCount: "Copies UNKNOWN",
    lost: "Copies devenues absentes", gained: "Nouvelles copies locales", changed: "Lectures locales modifiées",
    emptyNote: "Saisissez une note avant de l’enregistrer.", error: "L’action n’a pas pu être effectuée.",
  },
} as const;
export const TIMELINE_FILTERS: readonly TimelineFilter[] = ["all", "changed", "lost", "gained", "UNKNOWN"];
export const TIMELINE_ORDERS: readonly TimelineOrder[] = ["listed", "recent", "source", "size"];
export const TIMELINE_NOTE_STATUSES: readonly TimelineNoteStatus[] = ["open", "reviewing", "closed"];
const CHANGES: Readonly<Record<Language, Readonly<Record<TimelineChange, string>>>> = {
  en: { unchanged: "No local change", lost: "Previously saved copy is missing", gained: "Newly saved local copy", changed: "Local reading changed", UNKNOWN: "UNKNOWN" },
  fr: { unchanged: "Aucun changement local", lost: "Copie enregistrée auparavant absente", gained: "Nouvelle copie locale enregistrée", changed: "Lecture locale modifiée", UNKNOWN: "UNKNOWN" },
};
const CAUSES: Readonly<Record<Language, Readonly<Record<TimelineCause, string>>>> = {
  en: { present: "Stored copy listed", missing: "Not downloaded", stale: "Older source record", unreadable: "Local copy could not be read", UNKNOWN: "UNKNOWN", "source-change": "Source metadata changed", "not-listed": "Not in this reading" },
  fr: { present: "Copie locale répertoriée", missing: "Non téléchargée", stale: "Enregistrement d’une source ancienne", unreadable: "Impossible de lire la copie locale", UNKNOWN: "UNKNOWN", "source-change": "Métadonnées de la source modifiées", "not-listed": "Absente de cette lecture" },
};
const FILTERS: Readonly<Record<Language, Readonly<Record<TimelineFilter, string>>>> = {
  en: { all: "All changes", changed: "Needs review", lost: "Missing after reading", gained: "Newly saved", UNKNOWN: "UNKNOWN" },
  fr: { all: "Tous les changements", changed: "À examiner", lost: "Absente après la lecture", gained: "Nouvellement enregistrée", UNKNOWN: "UNKNOWN" },
};
const ORDERS: Readonly<Record<Language, Readonly<Record<TimelineOrder, string>>>> = {
  en: { listed: "Manifest order", recent: "Reverse order", source: "Source name", size: "Largest first" },
  fr: { listed: "Ordre de la liste", recent: "Ordre inversé", source: "Nom de la source", size: "Plus volumineuses d’abord" },
};
const STATUSES: Readonly<Record<Language, Readonly<Record<TimelineNoteStatus, string>>>> = {
  en: { open: "Open", reviewing: "In review", closed: "Note closed" },
  fr: { open: "Ouverte", reviewing: "En cours d’examen", closed: "Note close" },
};
export function timelineCopy(language: Language) { return TIMELINE_COPY[language]; }
export function timelineChangeText(value: TimelineChange, language: Language): string { return CHANGES[language][value]; }
export function timelineCauseText(value: TimelineCause, language: Language): string { return CAUSES[language][value]; }
export function timelineFilterText(value: TimelineFilter, language: Language): string { return FILTERS[language][value]; }
export function timelineOrderText(value: TimelineOrder, language: Language): string { return ORDERS[language][value]; }
export function timelineNoteStatusText(value: TimelineNoteStatus, language: Language): string { return STATUSES[language][value]; }
export function auditTimelineCopy(): readonly string[] {
  const problems: string[] = [];
  const en = TIMELINE_COPY.en;
  const fr = TIMELINE_COPY.fr;
  for (const name of Object.keys(en) as Array<keyof typeof en>) {
    if (!en[name].trim() || !fr[name].trim()) problems.push(name);
  }
  for (const value of Object.values(fr)) {
    if (value.includes("'")) problems.push("french-apostrophe");
    if (/(?<!\u00a0):/u.test(value)) problems.push("french-colon");
    if (/(?<!\u202f)[;!?]/u.test(value)) problems.push("french-punctuation");
  }
  return problems;
}

import type { Language } from "./regionDownload";
import type { HandoffChange, HandoffFilter, HandoffNoteKind, HandoffOrder, HandoffResolution } from "./handoffRehearsal";

export interface HandoffCopy {
  readonly title: string;
  readonly intro: string;
  readonly privacy: string;
  readonly before: string;
  readonly after: string;
  readonly reset: string;
  readonly download: string;
  readonly import: string;
  readonly current: string;
  readonly unknown: string;
  readonly saved: string;
  readonly noCapture: string;
  readonly noComparison: string;
  readonly initialRecorded: string;
  readonly comparisonRecorded: string;
  readonly invalid: string;
  readonly exported: string;
  readonly imported: string;
  readonly fileWarning: string;
  readonly noteLabel: string;
  readonly cellLabel: string;
  readonly noteKind: string;
  readonly addNote: string;
  readonly noteSaved: string;
  readonly noteRequired: string;
  readonly noteStatus: string;
  readonly changeNote: string;
  readonly noteChanged: string;
  readonly notes: string;
  readonly noNotes: string;
  readonly search: string;
  readonly filter: string;
  readonly order: string;
  readonly results: string;
  readonly previous: string;
  readonly next: string;
  readonly empty: string;
  readonly source: string;
  readonly licence: string;
  readonly date: string;
  readonly bytes: string;
  readonly cause: string;
  readonly change: string;
  readonly page: string;
  readonly busy: string;
  readonly unknownNotice: string;
}

export const HANDOFF_COPY: Readonly<Record<Language, HandoffCopy>> = {
  en: {
    title: "Offline handoff rehearsal",
    intro: "Record a starting inventory, then compare it with a later, explicitly requested reading. This only concerns files on this device.",
    privacy: "Notes stay in page memory unless you choose to export. Exported files can include your notes. Store them privately.",
    before: "Record starting inventory", after: "Compare with current inventory", reset: "Clear handoff",
    download: "Export handoff JSON", import: "Import handoff JSON", current: "Current reading",
    unknown: "UNKNOWN", saved: "Saved local copy", noCapture: "No starting inventory recorded.",
    noComparison: "Record a starting inventory and compare it before viewing changes.",
    initialRecorded: "Starting inventory recorded locally.", comparisonRecorded: "Comparison recorded locally.",
    invalid: "The action could not be completed. The earlier record is unchanged.",
    exported: "Handoff export requested. Check where you save the file.", imported: "Handoff imported as historical notes.",
    fileWarning: "Imported notes and snapshots do not establish current offline availability.",
    noteLabel: "Note text", cellLabel: "Choose cell", noteKind: "Note category", addNote: "Add note",
    noteSaved: "Note added locally.", noteRequired: "Enter note text and choose a cell.", noteStatus: "Note status",
    changeNote: "Change note status", noteChanged: "Note status changed locally.", notes: "Handoff notes",
    noNotes: "No notes yet.", search: "Search cells", filter: "Show changes", order: "Sort changes",
    results: "Comparison results", previous: "Previous page", next: "Next page", empty: "No matching cells.",
    source: "Source", licence: "Licence", date: "Source date", bytes: "Expected bytes", cause: "Local observation",
    change: "Change", page: "Comparison pages", busy: "Reading the current local inventory.",
    unknownNotice: "UNKNOWN means this reading does not support a definite conclusion.",
  },
  fr: {
    title: "Exercice de transfert hors ligne",
    intro: "Consignez l’inventaire initial, puis comparez-le à une lecture demandée explicitement. Cela concerne uniquement les fichiers sur cet appareil.",
    privacy: "Les notes restent en mémoire de la page, sauf si vous les exportez. Un fichier exporté peut contenir vos notes. Conservez-le en privé.",
    before: "Consigner l’inventaire initial", after: "Comparer avec l’inventaire actuel", reset: "Effacer le transfert",
    download: "Exporter le transfert JSON", import: "Importer un transfert JSON", current: "Lecture actuelle",
    unknown: "UNKNOWN", saved: "Copie locale enregistrée", noCapture: "Aucun inventaire initial consigné.",
    noComparison: "Consignez un inventaire initial, puis lancez une comparaison pour afficher les changements.",
    initialRecorded: "Inventaire initial consigné localement.", comparisonRecorded: "Comparaison consignée localement.",
    invalid: "L’action n’a pas abouti. Le dossier précédent reste inchangé.",
    exported: "Exportation demandée. Choisissez un emplacement privé pour le fichier.",
    imported: "Transfert importé comme notes historiques.",
    fileWarning: "Les notes et relevés importés ne démontrent pas la disponibilité hors ligne actuelle.",
    noteLabel: "Texte de la note", cellLabel: "Choisir une cellule", noteKind: "Catégorie de note", addNote: "Ajouter une note",
    noteSaved: "Note ajoutée localement.", noteRequired: "Saisissez une note et choisissez une cellule.",
    noteStatus: "État de la note", changeNote: "Modifier l’état de la note", noteChanged: "État de la note modifié localement.",
    notes: "Notes du transfert", noNotes: "Aucune note.", search: "Rechercher des cellules", filter: "Afficher les changements",
    order: "Trier les changements", results: "Résultats de la comparaison", previous: "Page précédente",
    next: "Page suivante", empty: "Aucune cellule correspondante.", source: "Source", licence: "Licence",
    date: "Date de la source", bytes: "Octets attendus", cause: "Observation locale", change: "Changement",
    page: "Pages de comparaison", busy: "Lecture de l’inventaire local actuel.",
    unknownNotice: "UNKNOWN signifie que cette lecture ne permet pas de conclure avec certitude.",
  },
};
export const HANDOFF_CHANGE: Readonly<Record<Language, Record<HandoffChange, string>>> = {
  en: { unchanged: "No recorded change", lost: "Previously saved, now missing", gained: "Previously missing, now saved", changed: "Different local observation", UNKNOWN: "UNKNOWN" },
  fr: { unchanged: "Aucun changement consigné", lost: "Copie auparavant enregistrée, maintenant absente", gained: "Copie auparavant absente, maintenant enregistrée", changed: "Observation locale différente", UNKNOWN: "UNKNOWN" },
};
export const HANDOFF_FILTER: Readonly<Record<Language, Record<HandoffFilter, string>>> = {
  en: { all: "All cells", attention: "Needs attention", lost: "Missing since start", UNKNOWN: "UNKNOWN" },
  fr: { all: "Toutes les cellules", attention: "À examiner", lost: "Absentes depuis le début", UNKNOWN: "UNKNOWN" },
};
export const HANDOFF_ORDER: Readonly<Record<Language, Record<HandoffOrder, string>>> = {
  en: { manifest: "Original order", state: "Change category", size: "Largest expected file" },
  fr: { manifest: "Ordre initial", state: "Catégorie de changement", size: "Taille prévue décroissante" },
};
export const HANDOFF_NOTE_KIND: Readonly<Record<Language, Record<HandoffNoteKind, string>>> = {
  en: { observation: "Observation", action: "Action taken", question: "Question" },
  fr: { observation: "Observation", action: "Action effectuée", question: "Question" },
};
export const HANDOFF_RESOLUTION: Readonly<Record<Language, Record<HandoffResolution, string>>> = {
  en: { open: "Open", reviewing: "Under review", closed: "Closed note" },
  fr: { open: "Ouverte", reviewing: "En cours d’examen", closed: "Note close" },
};

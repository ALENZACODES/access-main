import type { BoardIssue, TaskKind, TaskRisk, TaskState } from "./recoveryTaskBoard";
import type { RecoveryLocale } from "./index";

export interface TaskBoardCopy {
  readonly heading: string;
  readonly intro: string;
  readonly pack: string;
  readonly kind: string;
  readonly note: string;
  readonly source: string;
  readonly licence: string;
  readonly date: string;
  readonly tier: string;
  readonly add: string;
  readonly save: string;
  readonly load: string;
  readonly merge: string;
  readonly clear: string;
  readonly cancel: string;
  readonly status: string;
  readonly empty: string;
  readonly invalid: string;
  readonly saved: string;
  readonly readError: string;
  readonly conflict: string;
  readonly preview: string;
  readonly accepted: string;
  readonly identical: string;
  readonly conflicts: string;
  readonly noAutomatic: string;
  readonly taskStates: Readonly<Record<TaskState, string>>;
  readonly taskKinds: Readonly<Record<TaskKind, string>>;
  readonly risks: Readonly<Record<TaskRisk, string>>;
  readonly reasons: Readonly<Record<string, string>>;
  readonly issue: Readonly<Record<BoardIssue, string>>;
  readonly tierOptions: Readonly<Record<"public" | "self-reported" | "operator-note" | "unknown", string>>;
}

const en: TaskBoardCopy = {
  heading: "Local recovery task board",
  intro: "Create manual steps for local pack problems. Tasks describe intentions only and never change saved files.",
  pack: "Pack ID", kind: "Step", note: "Note", source: "Source", licence: "Licence", date: "Source date", tier: "Evidence tier",
  add: "Add task", save: "Save local JSON", load: "Choose a local JSON file", merge: "Add non-conflicting tasks",
  clear: "Clear local tasks", cancel: "Discard file preview", status: "Task status", empty: "No tasks in this session.",
  invalid: "This file could not be accepted. No tasks were changed.", saved: "File saved.",
  readError: "The local file could not be read.", conflict: "This file has conflicting task IDs. Nothing was added.",
  preview: "File preview", accepted: "New tasks", identical: "Already present", conflicts: "Conflicts",
  noAutomatic: "This board does not start downloads or remove files. A task marked closed does not change a pack's status.",
  taskStates: { pending: "Not started", "in-progress": "In progress", paused: "Paused", closed: "Closed" },
  taskKinds: { inspect: "Inspect local pack", download: "Download again", source: "Review source", storage: "Review storage", export: "Prepare export" },
  risks: { blocked: "Blocked", attention: "Needs attention", unknown: "UNKNOWN" },
  reasons: {
    "pack-unknown": "The local pack status is UNKNOWN.", "pack-damaged": "The saved pack is damaged.",
    "pack-absent": "The pack is not saved.", "source-unknown": "Source information is UNKNOWN.", "tier-unknown": "The evidence tier is UNKNOWN.",
  },
  issue: {
    json: "Invalid JSON", size: "File too large", shape: "Unexpected file structure", format: "Unsupported format",
    date: "Invalid date", future: "Future date", limit: "Too many entries", duplicate: "Repeated task ID",
    id: "Invalid task ID", pack: "Invalid pack ID", kind: "Unsupported task type", state: "Unsupported task state",
    chronology: "Dates are out of order", text: "Invalid text", source: "Incomplete source",
    licence: "Unsupported licence", tier: "Unsupported evidence tier", "unknown-field": "Unexpected field",
  },
  tierOptions: { public: "Public source", "self-reported": "Self-reported", "operator-note": "Operator note", unknown: "UNKNOWN" },
};

const fr: TaskBoardCopy = {
  heading: "Tableau local de récupération",
  intro: "Créez des étapes manuelles pour les ensembles locaux. Ces étapes ne modifient jamais les fichiers enregistrés.",
  pack: "Identifiant de l’ensemble", kind: "Étape", note: "Note", source: "Source", licence: "Licence", date: "Date de la source", tier: "Niveau de preuve",
  add: "Ajouter une étape", save: "Enregistrer le JSON local", load: "Choisir un fichier JSON local", merge: "Ajouter les étapes sans conflit",
  clear: "Effacer les étapes locales", cancel: "Ignorer l’aperçu", status: "État de l’étape", empty: "Aucune étape dans cette session.",
  invalid: "Ce fichier ne peut pas être accepté. Aucune étape n’a été modifiée.", saved: "Fichier enregistré.",
  readError: "Lecture du fichier local impossible.", conflict: "Le fichier contient des identifiants en conflit. Aucun ajout n’a été effectué.",
  preview: "Aperçu du fichier", accepted: "Nouvelles étapes", identical: "Déjà présentes", conflicts: "Conflits",
  noAutomatic: "Ce tableau ne lance aucun téléchargement et ne supprime aucun fichier. Fermer une étape ne modifie pas l’état d’un ensemble.",
  taskStates: { pending: "Non commencée", "in-progress": "En cours", paused: "En pause", closed: "Terminée" },
  taskKinds: { inspect: "Examiner l’ensemble local", download: "Télécharger de nouveau", source: "Examiner la source", storage: "Examiner le stockage", export: "Préparer l’exportation" },
  risks: { blocked: "Bloquée", attention: "À examiner", unknown: "INCONNU" },
  reasons: {
    "pack-unknown": "L’état local de l’ensemble est INCONNU.", "pack-damaged": "L’ensemble enregistré est endommagé.",
    "pack-absent": "L’ensemble n’est pas enregistré.", "source-unknown": "Les renseignements sur la source sont INCONNUS.", "tier-unknown": "Le niveau de preuve est INCONNU.",
  },
  issue: {
    json: "JSON invalide", size: "Fichier trop volumineux", shape: "Structure inattendue", format: "Format non pris en charge",
    date: "Date invalide", future: "Date future", limit: "Trop d’entrées", duplicate: "Identifiant répété",
    id: "Identifiant de tâche invalide", pack: "Identifiant d’ensemble invalide", kind: "Type d’étape non pris en charge", state: "État non pris en charge",
    chronology: "Dates dans le mauvais ordre", text: "Texte invalide", source: "Source incomplète",
    licence: "Licence non prise en charge", tier: "Niveau de preuve non pris en charge", "unknown-field": "Champ inattendu",
  },
  tierOptions: { public: "Source publique", "self-reported": "Déclaration personnelle", "operator-note": "Note de l’opérateur", unknown: "INCONNU" },
};

export function taskBoardCopy(locale: RecoveryLocale): TaskBoardCopy {
  return locale === "fr" ? fr : en;
}

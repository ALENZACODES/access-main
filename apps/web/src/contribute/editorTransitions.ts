import type { Draft } from "../../../../packages/contribute/src/schema";

export type EditorAction =
  | { type: "new" }
  | { type: "mapping" }
  | { type: "import"; items: Draft[] }
  | { type: "edit"; item: Draft }
  | { type: "delete"; item: Draft };

type Prompt = {
  title: string;
  body: string;
  confirm: string;
  cancel: string;
};

export { draftHasEdits } from "../../../../packages/contribute/src/draftComparison";

const messages = {
  en: {
    unsaved: "Discard unsaved changes?",
    fresh: "Starting a new draft will discard your unsaved edits, including any unfinished field.",
    open: (record: string) => `Opening ${record} will discard your unsaved edits, including any unfinished field.`,
    reopen: "Reopening this draft will restore its saved version and discard your unsaved edits.",
    mapping: "Leaving for Mapping day will discard your unsaved changes to this draft.",
    leave: "Discard and open Mapping day",
    importBody: "This file includes the draft you are editing. Importing it will replace the saved version and discard your unsaved edits.",
    importDrafts: "Discard and import",
    start: "Discard and start new draft",
    edit: "Discard and open draft",
    keep: "Keep editing",
    deleteTitle: "Delete local draft?",
    deleteBody: (record: string) => `The saved draft for ${record} and its photos will be deleted from this device.`,
    lose: "Your unsaved edits to this draft will also be discarded.",
    remove: "Delete draft",
    cancel: "Cancel",
    newPlace: "New place",
    deleted: "Draft deleted from this device",
    changedElsewhere: "This draft changed on this device. Your edits are still here. Export a copy or use Edit in Local drafts to open the latest version.",
    deletedElsewhere: "This draft was deleted on this device. Your edits are still here. Export a copy before starting a new draft.",
  },
  fr: {
    unsaved: "Abandonner les modifications non enregistrées ?",
    fresh: "La création d’un nouveau brouillon effacera vos modifications non enregistrées, y compris tout champ en cours de saisie.",
    open: (record: string) => `L’ouverture du brouillon pour ${record} effacera vos modifications non enregistrées, y compris tout champ en cours de saisie.`,
    reopen: "La réouverture du brouillon rétablira sa version enregistrée et effacera vos modifications en cours.",
    mapping: "L’ouverture de la journée de cartographie effacera vos modifications non enregistrées à ce brouillon.",
    leave: "Abandonner et ouvrir la journée de cartographie",
    importBody: "Ce fichier contient le brouillon en cours. L’importation remplacera sa version enregistrée et effacera vos modifications non enregistrées.",
    importDrafts: "Abandonner et importer",
    start: "Abandonner et créer un brouillon",
    edit: "Abandonner et ouvrir le brouillon",
    keep: "Continuer la saisie",
    deleteTitle: "Supprimer le brouillon local ?",
    deleteBody: (record: string) => `Le brouillon enregistré pour ${record} et ses photos seront supprimés de cet appareil.`,
    lose: "Vos modifications non enregistrées à ce brouillon seront également perdues.",
    remove: "Supprimer le brouillon",
    cancel: "Annuler",
    newPlace: "Nouveau lieu",
    deleted: "Brouillon supprimé de cet appareil",
    changedElsewhere: "Ce brouillon a été modifié sur cet appareil. Vos modifications sont encore disponibles. Exportez une copie ou utilisez Modifier dans Brouillons locaux pour ouvrir la dernière version.",
    deletedElsewhere: "Ce brouillon a été supprimé sur cet appareil. Vos modifications sont encore disponibles. Exportez une copie avant de créer un nouveau brouillon.",
  },
};

export type EditorLanguage = keyof typeof messages;

export function conflictMessage(locale: EditorLanguage, exists: boolean): string {
  const t = messages[locale];
  return exists ? t.changedElsewhere : t.deletedElsewhere;
}

export function deletionMessage(locale: EditorLanguage): string {
  return messages[locale].deleted;
}

/** One decision for each user action, including deletion of a different saved row. */
export function transitionPrompt(
  action: EditorAction,
  activeId: string,
  dirty: boolean,
  locale: EditorLanguage,
): Prompt | null {
  const t = messages[locale];
  if (action.type === "import") {
    if (!dirty || !action.items.some(item => item.id === activeId)) return null;
    return { title: t.unsaved, body: t.importBody, confirm: t.importDrafts, cancel: t.keep };
  }
  if (action.type === "mapping") {
    return dirty ? { title: t.unsaved, body: t.mapping, confirm: t.leave, cancel: t.keep } : null;
  }
  if (action.type === "new") {
    return dirty ? { title: t.unsaved, body: t.fresh, confirm: t.start, cancel: t.keep } : null;
  }

  const { item } = action;
  const record = [item.kind === "new-place" ? t.newPlace : item.target, item.observed, item.event]
    .filter(Boolean)
    .join(" · ");
  const active = item.id === activeId;
  if (action.type === "edit") {
    if (!dirty) return null;
    return { title: t.unsaved, body: active ? t.reopen : t.open(record), confirm: t.edit, cancel: t.keep };
  }

  const body = t.deleteBody(record);
  return {
    title: t.deleteTitle,
    body: active && dirty ? `${body} ${t.lose}` : body,
    confirm: t.remove,
    cancel: t.cancel,
  };
}

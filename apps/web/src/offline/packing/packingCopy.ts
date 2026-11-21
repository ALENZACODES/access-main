import type { PackingFilter, StageStatus } from "./model";

export type PackingLanguage = "en" | "fr";

export const packingCopy = {
  en: {
    heading: "Packing list",
    initialTitle: "My outing",
    listTitle: "List title",
    renameList: "Rename list",
    bagName: "Bag name",
    addBag: "Add bag",
    bagSelect: "Current bag",
    renameBag: "Rename bag",
    moveBagUp: "Move bag earlier",
    moveBagDown: "Move bag later",
    removeBag: "Remove bag",
    removeBagPrompt: (name: string, count: number) =>
      count === 0 ? `Remove the empty bag “${name}”?` :
      `Remove “${name}” and its ${count} ${count === 1 ? "item" : "items"}?`,
    noBags: "Add your first bag, then list what goes inside.",
    emptyBag: "This bag has no items yet.",
    noMatches: "No items in this bag match the filter.",
    review: "Checklist view",
    departure: "Packing for departure",
    arrival: "Bringing items back",
    filter: "Show items",
    bagLimit: "The bag limit has been reached.",
    itemLimit: "The item limit has been reached.",
    summary: "All bags",
    summaryItems: "Item entries",
    expectedPacking: "Units to pack",
    expectedReturn: "Units packed for the outing",
    knownPacking: "Units recorded as packed",
    knownReturn: "Units recorded as returned",
    remainingPacking: "Units left to pack",
    remainingReturn: "Units left to bring back",
    unrecorded: "Entries with no count recorded",
    addItem: "Add item",
    name: "Item name",
    note: "Item note",
    planned: "Quantity to bring",
    packed: "Quantity packed",
    returned: "Quantity returned",
    countHelp: "Leave a count blank for UNKNOWN. Enter 0 when you have counted none.",
    saveItem: "Save item",
    editItem: "Edit item",
    moveItem: "Move to another bag",
    destination: "Destination bag",
    move: "Move item",
    earlier: "Move item earlier",
    later: "Move item later",
    removeItem: "Remove item",
    removeItemPrompt: (name: string) => `Remove “${name}” from this bag?`,
    keep: "Keep",
    cancel: "Cancel",
    save: "Save name",
    requiredName: "Enter a name with at least one visible character.",
    plannedInvalid: (limit: number) => `Enter a whole quantity from 1 to ${limit}.`,
    packedInvalid: "Enter a whole packed count from 0 to the quantity to bring, or leave it blank.",
    returnedInvalid: "Record a packed count first. The returned count must be a whole number between 0 and the packed count.",
    invalidEntry: "Review the names, notes and counts. The change could not be saved.",
    changedName: "Name saved.",
    addedBag: "Bag added.",
    removedBag: "Bag removed.",
    movedBag: "Bag order updated.",
    addedItem: "Item added.",
    savedItem: "Item saved.",
    removedItem: "Item removed.",
    movedItem: "Item order updated.",
    movedTo: (bag: string) => `Item moved to ${bag}.`,
  },
  fr: {
    heading: "Liste de bagages",
    initialTitle: "Ma sortie",
    listTitle: "Titre de la liste",
    renameList: "Renommer la liste",
    bagName: "Nom du sac",
    addBag: "Ajouter un sac",
    bagSelect: "Sac sélectionné",
    renameBag: "Renommer le sac",
    moveBagUp: "Avancer le sac",
    moveBagDown: "Reculer le sac",
    removeBag: "Retirer le sac",
    removeBagPrompt: (name: string, count: number) =>
      count === 0 ? `Retirer le sac vide «\u202f${name}\u202f»\u202f?` :
      `Retirer «\u202f${name}\u202f» et ${count === 1 ? "son article" : `ses ${count} articles`}\u202f?`,
    noBags: "Ajoutez votre premier sac, puis indiquez ce qu’il contient.",
    emptyBag: "Ce sac ne contient encore aucun article.",
    noMatches: "Aucun article de ce sac ne correspond au filtre.",
    review: "Vue de la liste",
    departure: "Préparation du départ",
    arrival: "Retour des articles",
    filter: "Articles à afficher",
    bagLimit: "La limite de sacs est atteinte.",
    itemLimit: "La limite d’articles est atteinte.",
    summary: "Ensemble des sacs",
    summaryItems: "Articles inscrits",
    expectedPacking: "Unités à emballer",
    expectedReturn: "Unités emballées pour la sortie",
    knownPacking: "Unités comptées à l’emballage",
    knownReturn: "Unités comptées au retour",
    remainingPacking: "Unités restant à emballer",
    remainingReturn: "Unités restant à rapporter",
    unrecorded: "Articles sans quantité inscrite",
    addItem: "Ajouter un article",
    name: "Nom de l’article",
    note: "Note sur l’article",
    planned: "Quantité à emporter",
    packed: "Quantité emballée",
    returned: "Quantité rapportée",
    countHelp: "Laissez la quantité vide pour afficher UNKNOWN. Inscrivez 0 si vous n’en avez compté aucune.",
    saveItem: "Enregistrer l’article",
    editItem: "Modifier l’article",
    moveItem: "Changer de sac",
    destination: "Sac de destination",
    move: "Déplacer l’article",
    earlier: "Avancer l’article",
    later: "Reculer l’article",
    removeItem: "Retirer l’article",
    removeItemPrompt: (name: string) => `Retirer «\u202f${name}\u202f» de ce sac\u202f?`,
    keep: "Conserver",
    cancel: "Annuler",
    save: "Enregistrer le nom",
    requiredName: "Saisissez un nom contenant au moins un caractère visible.",
    plannedInvalid: (limit: number) => `Saisissez un nombre entier entre 1 et ${limit}.`,
    packedInvalid: "Saisissez un nombre entier entre 0 et la quantité à emporter ou laissez la quantité vide.",
    returnedInvalid: "Inscrivez d’abord la quantité emballée. La quantité rapportée doit être un nombre entier entre 0 et la quantité emballée.",
    invalidEntry: "Revoyez les noms, les notes et les quantités. La modification n’a pas pu être enregistrée.",
    changedName: "Nom enregistré.",
    addedBag: "Sac ajouté.",
    removedBag: "Sac retiré.",
    movedBag: "Ordre des sacs modifié.",
    addedItem: "Article ajouté.",
    savedItem: "Article enregistré.",
    removedItem: "Article retiré.",
    movedItem: "Ordre des articles modifié.",
    movedTo: (bag: string) => `Article déplacé dans le sac «\u202f${bag}\u202f».`,
  },
} as const;

export const filterLabels: Record<PackingLanguage, Record<PackingFilter, string>> = {
  en: {
    all: "All items",
    outstanding: "Unfinished or uncounted",
    UNKNOWN: "UNKNOWN",
    pending: "None counted",
    partial: "Partly counted",
    complete: "Complete",
  },
  fr: {
    all: "Tous les articles",
    outstanding: "À terminer ou à compter",
    UNKNOWN: "UNKNOWN",
    pending: "Aucune unité comptée",
    partial: "Quantité partielle",
    complete: "Terminé",
  },
};

export function statusLabel(value: StageStatus, language: PackingLanguage): string {
  return filterLabels[language][value];
}

export function numberedNames(entries: ReadonlyArray<{ id: string; name: string }>): Map<string, string> {
  const totals = new Map<string, number>();
  const seen = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const { name } of entries) {
    const key = name.trim();
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }
  for (const { id, name } of entries) {
    const key = name.trim();
    const total = totals.get(key) ?? 1;
    const position = (seen.get(key) ?? 0) + 1;
    seen.set(key, position);
    labels.set(id, total === 1 ? name : name + " (" + position + "/" + total + ")");
  }
  return labels;
}

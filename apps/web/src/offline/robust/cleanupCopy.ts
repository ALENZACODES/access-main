import { type Language } from "./regionDownload";

/** Visible text used by the device-local cleanup workspace. */
export const CLEANUP_COPY = {
  en: {
    title: "Manage saved offline cells",
    intro: "Review a saved copy before choosing to remove it. Removing a copy does not change a place’s accessibility information.",
    privacy: "This workspace reads this device’s offline storage. It does not upload your selected cells.",
    search: "Search cells and source details",
    filter: "Show cells",
    all: "All cells",
    saved: "Saved copies",
    unknown: "UNKNOWN cells",
    stale: "Copies that differ",
    unreadable: "Unreadable copies",
    order: "Sort cells",
    manifest: "Listed order",
    largest: "Largest first",
    smallest: "Smallest first",
    sourceSort: "Source name",
    select: "Select cell for cleanup",
    selected: "Selected cells",
    none: "No matching cells",
    empty: "No cells are listed in this region.",
    missing: "No stored copy; nothing to remove",
    present: "A saved copy is present",
    differs: "A saved copy differs from the current listing",
    unreadableStatus: "The saved copy could not be read",
    size: "Listed size",
    source: "Source",
    licence: "Licence",
    date: "Source date",
    previous: "Previous page",
    next: "Next page",
    page: "Page",
    selectPage: "Select removable cells on this page",
    selectStale: "Select copies that differ",
    clear: "Clear selection",
    preview: "Review removal",
    cancel: "Cancel removal",
    dismiss: "Close result",
    confirm: "Remove selected saved copies",
    headingPreview: "Review before removing",
    previewHint: "Only listed copies in this region can be removed. This action cannot be undone from the App. You can download copies again when connected.",
    impact: "Copies selected for removal",
    possibleBytes: "Listed bytes associated with these copies",
    estimate: "This is not a measurement of space that will be released.",
    affectedSaved: "Currently saved copies selected",
    affectedUnknown: "UNKNOWN copies selected",
    working: "Reviewing device storage…",
    removing: "Removing selected copies…",
    waiting: "Ready for your decision. No copies have been removed.",
    removed: "Saved copies removed",
    retained: "Copies not removed",
    changed: "A stored copy changed. Removal stopped.",
    failed: "Storage could not complete this action. Unremoved copies keep their earlier status.",
    interrupted: "Removal stopped at your request.",
    done: "Removal finished. Refresh the inventory to inspect what remains.",
    unsafe: "This selection cannot be removed. Refresh the inventory and review the listed cells.",
    selectionLimit: "Selection limit reached. Choose fewer cells.",
    unavailable: "Cleanup is unavailable because this device does not expose the required storage action.",
    busy: "Finish the current offline action before managing stored copies.",
    auditBlocked: "Source and licence checks must pass before cleanup is offered.",
    offlineReminder: "A removed or missing offline cell remains UNKNOWN until a listed copy is saved again. Offline availability does not describe physical accessibility.",
    refresh: "Refresh offline inventory",
    noRemoval: "No saved copy was selected for removal.",
    count: "Matching cells",
  },
  fr: {
    title: "Gérer les cellules hors ligne enregistrées",
    intro: "Examinez une copie enregistrée avant de choisir de la supprimer. La suppression ne modifie pas les renseignements sur l’accessibilité d’un lieu.",
    privacy: "Cet espace consulte le stockage hors ligne de cet appareil. Il ne transmet pas les cellules sélectionnées.",
    search: "Rechercher des cellules et des sources",
    filter: "Afficher les cellules",
    all: "Toutes les cellules",
    saved: "Copies enregistrées",
    unknown: "Cellules INCONNUES",
    stale: "Copies différentes",
    unreadable: "Copies illisibles",
    order: "Trier les cellules",
    manifest: "Ordre de la liste",
    largest: "Plus grandes d’abord",
    smallest: "Plus petites d’abord",
    sourceSort: "Nom de la source",
    select: "Sélectionner la cellule à supprimer",
    selected: "Cellules sélectionnées",
    none: "Aucune cellule correspondante",
    empty: "Aucune cellule n’est inscrite pour cette région.",
    missing: "Aucune copie enregistrée à supprimer",
    present: "Une copie enregistrée est présente",
    differs: "Une copie enregistrée diffère de la liste actuelle",
    unreadableStatus: "La copie enregistrée est illisible",
    size: "Taille indiquée",
    source: "Source",
    licence: "Licence",
    date: "Date de la source",
    previous: "Page précédente",
    next: "Page suivante",
    page: "Page",
    selectPage: "Sélectionner les copies supprimables de cette page",
    selectStale: "Sélectionner les copies différentes",
    clear: "Effacer la sélection",
    preview: "Examiner la suppression",
    cancel: "Annuler la suppression",
    dismiss: "Fermer le résultat",
    confirm: "Supprimer les copies enregistrées sélectionnées",
    headingPreview: "Examiner avant la suppression",
    previewHint: "Seules les copies inscrites pour cette région peuvent être supprimées. Cette action est irréversible dans l’App. Vous pourrez télécharger les copies de nouveau lorsque vous serez connecté.",
    impact: "Copies sélectionnées pour la suppression",
    possibleBytes: "Octets indiqués pour ces copies",
    estimate: "Il ne s’agit pas d’une mesure de l’espace qui sera libéré.",
    affectedSaved: "Copies enregistrées sélectionnées",
    affectedUnknown: "Copies INCONNUES sélectionnées",
    working: "Examen du stockage de l’appareil…",
    removing: "Suppression des copies sélectionnées…",
    waiting: "En attente de votre décision. Aucune copie n’a été supprimée.",
    removed: "Copies enregistrées supprimées",
    retained: "Copies non supprimées",
    changed: "Une copie enregistrée a changé. La suppression est arrêtée.",
    failed: "Le stockage n’a pas pu terminer cette action. Les copies non supprimées conservent leur état précédent.",
    interrupted: "Suppression arrêtée à votre demande.",
    done: "Suppression terminée. Actualisez l’inventaire pour examiner les copies restantes.",
    unsafe: "Cette sélection ne peut pas être supprimée. Actualisez l’inventaire et examinez les cellules inscrites.",
    selectionLimit: "Limite de sélection atteinte. Choisissez moins de cellules.",
    unavailable: "La suppression n’est pas disponible, car cet appareil ne propose pas l’action de stockage nécessaire.",
    busy: "Terminez l’action hors ligne actuelle avant de gérer les copies enregistrées.",
    auditBlocked: "Les contrôles des sources et des licences doivent réussir avant la suppression.",
    offlineReminder: "Une cellule hors ligne supprimée ou absente reste INCONNUE jusqu’à l’enregistrement d’une nouvelle copie inscrite. La disponibilité hors ligne ne décrit pas l’accessibilité physique.",
    refresh: "Actualiser l’inventaire hors ligne",
    noRemoval: "Aucune copie enregistrée n’est sélectionnée pour la suppression.",
    count: "Cellules correspondantes",
  },
} as const;

export function cleanupCopy(language: Language): typeof CLEANUP_COPY["en"] | typeof CLEANUP_COPY["fr"] {
  return CLEANUP_COPY[language];
}

export type CleanupCopyFailure = "missing-translation" | "unsupported-claim" | "french-spacing" | "french-apostrophe";
export function auditCleanupCopy(): readonly CleanupCopyFailure[] {
  const failures: CleanupCopyFailure[] = [];
  for (const key of new Set([...Object.keys(CLEANUP_COPY.en), ...Object.keys(CLEANUP_COPY.fr)])) {
    const en = CLEANUP_COPY.en[key as keyof typeof CLEANUP_COPY.en];
    const fr = CLEANUP_COPY.fr[key as keyof typeof CLEANUP_COPY.fr];
    if (!en?.trim() || !fr?.trim()) failures.push("missing-translation");
  }
  for (const language of [CLEANUP_COPY.en, CLEANUP_COPY.fr]) {
    for (const value of Object.values(language)) {
      if (/\b(?:verified|verify|vérifié(?:e|s|es)?|real-time|partnership|guarantee|aaa-conformant)\b/iu.test(value)) {
        failures.push("unsupported-claim");
      }
    }
  }
  for (const value of Object.values(CLEANUP_COPY.fr)) {
    if (/(?<!\u00a0):|(?<!\u202f)[;!?]|«(?!\u202f)|(?<!\u202f)»/u.test(value)) failures.push("french-spacing");
    if (value.includes("'")) failures.push("french-apostrophe");
  }
  return failures;
}

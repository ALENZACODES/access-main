import type { Language } from "./regionDownload";
import type { ChangeKind, ChangeSort, FollowUpPriority } from "./packChangeImpact";

/** UI strings never imply that source metadata proves physical accessibility. */
export const PACK_CHANGE_COPY = {
  en: {
    title: "Offline pack change review",
    intro: "Compare a second listing with this region's current listing. No files are downloaded, replaced or deleted.",
    caution: "Data changes do not establish physical accessibility. Physical conditions remain UNKNOWN.",
    open: "Open change review",
    close: "Close change review",
    paste: "Paste the second region listing (JSON)",
    example: "This region's listed source cells are shown below. Paste a second listing for a comparison.",
    compare: "Compare listings",
    clear: "Clear comparison",
    help: "A second listing must contain regionId and cells with id, bytes, source, licence and date.",
    error: "The second listing could not be read. Check the source metadata and try again.",
    wrongRegion: "The two listings refer to different regions. Availability remains UNKNOWN.",
    noResult: "No comparison has been made.",
    noChanges: "No source-listing changes were found. Physical conditions remain UNKNOWN.",
    result: "Data comparison",
    saved: "Saved local copy",
    unknown: "UNKNOWN",
    added: "Added cells",
    removed: "Removed cells",
    modified: "Modified cells",
    unchanged: "Unchanged cells",
    localUnknown: "Local copies UNKNOWN",
    beforeBytes: "Previous listed bytes",
    afterBytes: "New listed bytes",
    deltaBytes: "Difference in listed bytes",
    filter: "Show cells",
    sort: "Sort by",
    search: "Search ID or source",
    all: "All cells",
    changed: "Changed cells",
    savedOnly: "Saved local copies",
    unknownOnly: "Local copies UNKNOWN",
    noMatches: "No cells match these filters.",
    previous: "Previous page",
    next: "Next page",
    exportText: "Save text report",
    exportJson: "Save JSON report",
    source: "Source",
    licence: "Licence",
    date: "Source date",
    before: "Current listing",
    after: "Second listing",
    bytes: "Listed size",
    changes: "Changed fields",
    priority: "Review priority",
    question: "Question to follow up",
    physical: "Physical accessibility",
    privacy: "Exports contain source metadata. They do not include downloaded files.",
    saveFailed: "The browser could not save this report.",
    savedReport: "The report was offered for download.",
    region: "Region",
    rowCount: "Matching cells",
    note: "A local saved copy is a storage observation, never a statement about a venue or route.",
  },
  fr: {
    title: "Examen des changements du pack hors ligne",
    intro: "Comparez une deuxième liste à celle de cette région. Aucun fichier n’est téléchargé, remplacé ou supprimé.",
    caution: "Les changements de données ne prouvent pas l’accessibilité physique. Les conditions physiques restent UNKNOWN.",
    open: "Ouvrir l’examen des changements",
    close: "Fermer l’examen des changements",
    paste: "Coller la deuxième liste régionale (JSON)",
    example: "Les cellules de données de cette région sont répertoriées ci-dessous. Collez une deuxième liste pour les comparer.",
    compare: "Comparer les listes",
    clear: "Effacer la comparaison",
    help: "La deuxième liste doit contenir regionId et cells, avec id, bytes, source, licence et date.",
    error: "La deuxième liste est illisible. Examinez les métadonnées de source et réessayez.",
    wrongRegion: "Les deux listes concernent des régions différentes. La disponibilité reste UNKNOWN.",
    noResult: "Aucune comparaison n’a été faite.",
    noChanges: "Aucun changement de liste de sources. Les conditions physiques restent UNKNOWN.",
    result: "Comparaison des données",
    saved: "Copie locale enregistrée",
    unknown: "UNKNOWN",
    added: "Cellules ajoutées",
    removed: "Cellules retirées",
    modified: "Cellules modifiées",
    unchanged: "Cellules inchangées",
    localUnknown: "Copies locales UNKNOWN",
    beforeBytes: "Octets indiqués auparavant",
    afterBytes: "Octets indiqués ensuite",
    deltaBytes: "Différence d’octets indiqués",
    filter: "Afficher les cellules",
    sort: "Trier par",
    search: "Rechercher un identifiant ou une source",
    all: "Toutes les cellules",
    changed: "Cellules modifiées",
    savedOnly: "Copies locales enregistrées",
    unknownOnly: "Copies locales UNKNOWN",
    noMatches: "Aucune cellule ne correspond à ces filtres.",
    previous: "Page précédente",
    next: "Page suivante",
    exportText: "Enregistrer le rapport texte",
    exportJson: "Enregistrer le rapport JSON",
    source: "Source",
    licence: "Licence",
    date: "Date de la source",
    before: "Liste actuelle",
    after: "Deuxième liste",
    bytes: "Taille indiquée",
    changes: "Champs modifiés",
    priority: "Priorité de l’examen",
    question: "Question à approfondir",
    physical: "Accessibilité physique",
    privacy: "Les exports contiennent des métadonnées de source, sans fichiers téléchargés.",
    saveFailed: "Le navigateur n’a pas pu enregistrer ce rapport.",
    savedReport: "Le téléchargement du rapport a été proposé.",
    region: "Région",
    rowCount: "Cellules correspondantes",
    note: "Une copie locale enregistrée indique seulement son état de stockage, pas celui d’un lieu ou d’un itinéraire.",
  },
} as const;
export const PACK_CHANGE_KIND: Record<Language, Record<ChangeKind, string>> = {
  en: { added: "Added", removed: "Removed", source: "Source changed", licence: "Licence changed",
    date: "Source date changed", bytes: "Listed size changed", unchanged: "Unchanged" },
  fr: { added: "Ajouté", removed: "Retiré", source: "Source modifiée", licence: "Licence modifiée",
    date: "Date de source modifiée", bytes: "Taille indiquée modifiée", unchanged: "Inchangé" },
};
export const PACK_CHANGE_SORT: Record<Language, Record<ChangeSort, string>> = {
  en: { listed: "Listing order", id: "Cell ID", largest: "Largest listed first",
    source: "Source name", priority: "Review priority" },
  fr: { listed: "Ordre de la liste", id: "Identifiant de cellule", largest: "Taille indiquée décroissante",
    source: "Nom de la source", priority: "Priorité de l’examen" },
};
export const PACK_CHANGE_PRIORITY: Record<Language, Record<FollowUpPriority, string>> = {
  en: { "review-first": "Review first", review: "Review", "no-change": "No listing change" },
  fr: { "review-first": "Examiner d’abord", review: "Examiner", "no-change": "Aucun changement de liste" },
};
export function packChangeCopy(language: Language) { return PACK_CHANGE_COPY[language]; }
export function auditPackChangeCopy(): readonly string[] {
  const errors: string[] = [];
  const english = PACK_CHANGE_COPY.en;
  const french = PACK_CHANGE_COPY.fr;
  for (const key of Object.keys(english) as Array<keyof typeof english>) {
    if (!english[key].trim() || !french[key].trim()) errors.push(key);
  }
  for (const value of Object.values(french)) {
    if (value.includes("'")) errors.push("apostrophe");
    if (/(?<!\u00a0):/u.test(value)) errors.push("colon");
    if (/(?<!\u202f)[;!?]/u.test(value)) errors.push("punctuation");
  }
  return errors;
}

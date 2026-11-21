import type { Language } from "./regionDownload";
import type { SnapshotChange, SnapshotFilter, SnapshotOrder } from "./snapshotComparison";

export const SNAPSHOT_COPY = {
  en: {
    title: "Compare local region listings", intro: "Compare up to three data snapshots. These are source listings, not a survey of physical accessibility.",
    open: "Open snapshot comparison", close: "Close snapshot comparison", baseline: "Current region listing",
    optionA: "Comparison A JSON", optionB: "Comparison B JSON", compare: "Compare snapshots", clearA: "Clear comparison A", clearB: "Clear comparison B",
    invalid: "The supplied snapshot could not be read. No comparison was changed.", mismatch: "The comparison must use the same region identifier.",
    paste: "Paste a snapshot exported in the versioned format. No network request is made.",
    source: "Source", licence: "Licence", date: "Source date", changed: "Changed cells", unchanged: "No declared change",
    summary: "Comparison summary", listed: "Listed cells", local: "Saved metadata match", unknown: "UNKNOWN", physical: "Physical accessibility: UNKNOWN",
    notProof: "Saved source bytes do not establish conditions at a real place.", privacy: "Exports contain region identifiers and source details. Review them before sharing.",
    filter: "Filter cell changes", sort: "Sort cells", search: "Search cell identifier", previous: "Previous page", next: "Next page",
    noRows: "No matching cells", detail: "Source changes and follow-up questions", size: "Declared bytes", exportJson: "Export comparison JSON", exportBaseline: "Export current snapshot JSON",
    exportText: "Export comparison text", downloadError: "The browser could not save the report.", exported: "Comparison export requested.",
    status: "Comparison status", optionsMissing: "Add comparison A or B to examine changes. UNKNOWN remains UNKNOWN.",
    ready: "Comparison ready. Data only; conditions at places remain UNKNOWN.", missing: "No comparison supplied", reason: "Local observation", question: "Question to ask",
    done: "Close results", placeholder: "No snapshot supplied", statusLabel: "Local data status", bytes: "Declared bytes",
  },
  fr: {
    title: "Comparer les listes régionales locales", intro: "Comparez jusqu’à trois instantanés de données. Il s’agit de listes de sources, pas d’une enquête sur l’accessibilité physique.",
    open: "Ouvrir la comparaison des instantanés", close: "Fermer la comparaison des instantanés", baseline: "Liste régionale actuelle",
    optionA: "JSON de comparaison A", optionB: "JSON de comparaison B", compare: "Comparer les instantanés", clearA: "Effacer la comparaison A", clearB: "Effacer la comparaison B",
    invalid: "L’instantané fourni est illisible. La comparaison n’a pas changé.", mismatch: "La comparaison doit utiliser le même identifiant régional.",
    paste: "Collez un instantané exporté dans le format versionné. Aucune demande réseau n’est envoyée.",
    source: "Source", licence: "Licence", date: "Date de la source", changed: "Cellules modifiées", unchanged: "Aucune modification déclarée",
    summary: "Résumé de la comparaison", listed: "Cellules répertoriées", local: "Métadonnées de copie concordantes", unknown: "UNKNOWN", physical: "Accessibilité physique\u00a0: UNKNOWN",
    notProof: "Les données enregistrées ne démontrent pas les conditions réelles d’un lieu.", privacy: "Les exports contiennent des identifiants régionaux et des sources. Relisez-les avant le partage.",
    filter: "Filtrer les changements", sort: "Trier les cellules", search: "Chercher un identifiant de cellule", previous: "Page précédente", next: "Page suivante",
    noRows: "Aucune cellule correspondante", detail: "Modifications des sources et questions à poser", size: "Octets déclarés", exportJson: "Exporter le JSON de comparaison", exportBaseline: "Exporter le JSON de la liste actuelle",
    exportText: "Exporter le texte de comparaison", downloadError: "Le navigateur n’a pas pu enregistrer le rapport.", exported: "Export de comparaison demandé.",
    status: "État de la comparaison", optionsMissing: "Ajoutez la comparaison A ou B pour examiner les changements. UNKNOWN reste UNKNOWN.",
    ready: "Comparaison prête. Les conditions des lieux restent UNKNOWN.", missing: "Aucune comparaison fournie", reason: "Observation locale", question: "Question à poser",
    done: "Fermer les résultats", placeholder: "Aucun instantané fourni", statusLabel: "État des données locales", bytes: "Octets déclarés",
  },
} as const;
export const SNAPSHOT_CHANGE_LABELS: Record<Language, Record<SnapshotChange, string>> = {
  en: { same: "Unchanged", added: "Added", removed: "Removed", metadata: "Source metadata changed", bytes: "Declared bytes changed", "missing-snapshot": "UNKNOWN comparison" },
  fr: { same: "Inchangé", added: "Ajouté", removed: "Retiré", metadata: "Métadonnées de source modifiées", bytes: "Octets déclarés modifiés", "missing-snapshot": "Comparaison UNKNOWN" },
};
export const SNAPSHOT_FILTER_LABELS: Record<Language, Record<SnapshotFilter, string>> = {
  en: { all: "All cells", changed: "Any change", UNKNOWN: "UNKNOWN local copy", saved: "Saved metadata match", same: "Unchanged", added: "Added", removed: "Removed", metadata: "Metadata changed", bytes: "Bytes changed", "missing-snapshot": "Missing comparison" },
  fr: { all: "Toutes les cellules", changed: "Tout changement", UNKNOWN: "Copie locale UNKNOWN", saved: "Métadonnées concordantes", same: "Inchangé", added: "Ajouté", removed: "Retiré", metadata: "Métadonnées modifiées", bytes: "Octets modifiés", "missing-snapshot": "Comparaison manquante" },
};
export const SNAPSHOT_ORDER_LABELS: Record<Language, Record<SnapshotOrder, string>> = {
  en: { listed: "Listing order", cell: "Cell identifier", "largest-change": "Largest byte difference", uncertainty: "UNKNOWN first" },
  fr: { listed: "Ordre de liste", cell: "Identifiant de cellule", "largest-change": "Plus grande différence d’octets", uncertainty: "UNKNOWN d’abord" },
};
export function snapshotCopy(language: Language) { return SNAPSHOT_COPY[language]; }
export function auditSnapshotCopy(): string[] {
  const problems: string[] = [];
  for (const key of Object.keys(SNAPSHOT_COPY.en) as Array<keyof typeof SNAPSHOT_COPY.en>) {
    if (!SNAPSHOT_COPY.en[key].trim() || !SNAPSHOT_COPY.fr[key].trim()) problems.push(key);
  }
  for (const value of Object.values(SNAPSHOT_COPY.fr)) {
    if (value.includes("'")) problems.push("apostrophe");
    if (/(?<!\u00a0):/u.test(value)) problems.push("colon");
    if (/(?<!\u202f)[;!?]/u.test(value)) problems.push("punctuation");
  }
  return problems;
}

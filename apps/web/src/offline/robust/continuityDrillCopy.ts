import type { Language } from "./regionDownload";
export const CONTINUITY_COPY = {
  en: { title: "Offline continuity rehearsal", intro: "Explore a hypothetical change to local copies. This does not change stored files or describe physical accessibility.", scenario: "Scenario", count: "Affected copies", reduction: "Hypothetical reduction in bytes", reserve: "Storage reserve in bytes", run: "Run local rehearsal", unknown: "UNKNOWN", initial: "No rehearsal has been run.", result: "Hypothetical result", before: "Before", after: "After", source: "Source", licence: "Licence", date: "Source date", affected: "Affected", export: "Export metadata report", saved: "Saved copy", noRows: "No listed cells", note: "This planning exercise is hypothetical.", used: "This rehearsal never modifies stored copies.", privacy: "This rehearsal does not describe access at a physical place.", unknownQuota: "Available capacity is UNKNOWN.", exportText: "Export text report", exportJson: "Export JSON report", previous: "Previous page", next: "Next page" },
  fr: { title: "Exercice de continuité hors ligne", intro: "Explorez une modification hypothétique des copies locales. Cela ne change aucun fichier et ne décrit pas l’accessibilité physique.", scenario: "Scénario", count: "Copies concernées", reduction: "Réduction hypothétique en octets", reserve: "Réserve de stockage en octets", run: "Lancer l’exercice local", unknown: "UNKNOWN", initial: "Aucun exercice n’a été lancé.", result: "Résultat hypothétique", before: "Avant", after: "Après", source: "Source", licence: "Licence", date: "Date de la source", affected: "Concernées", export: "Exporter le rapport de métadonnées", saved: "Copie enregistrée", noRows: "Aucune cellule répertoriée", note: "Cet exercice de planification est hypothétique.", used: "Cet exercice ne modifie jamais les copies enregistrées.", privacy: "L’exercice ne décrit pas l’accessibilité à un lieu physique.", unknownQuota: "La capacité disponible est UNKNOWN.", exportText: "Exporter le rapport texte", exportJson: "Exporter le rapport JSON", previous: "Page précédente", next: "Page suivante" },
} as const;
export function continuityCopy(language: Language) { return CONTINUITY_COPY[language]; }

/** Stable public choices for the bilingual continuity controls. */
export const DRILL_SCENARIOS = ["baseline", "evict-largest", "evict-oldest", "source-change", "quota-reduction"] as const;
export const DRILL_FILTERS = ["all", "saved", "UNKNOWN", "affected", "unaffected"] as const;
export const DRILL_SORTS = ["listed", "id", "bytes-desc", "status", "source"] as const;
const SCENARIO_LABELS = {
  en: {
    baseline: "Keep the current local records",
    "evict-largest": "Simulate loss of the largest saved copies",
    "evict-oldest": "Simulate loss of the oldest saved copies",
    "source-change": "Simulate a changed source record",
    "quota-reduction": "Simulate reduced device capacity",
  },
  fr: {
    baseline: "Conserver les enregistrements locaux",
    "evict-largest": "Simuler la perte des plus grandes copies",
    "evict-oldest": "Simuler la perte des copies les plus anciennes",
    "source-change": "Simuler une modification des sources",
    "quota-reduction": "Simuler une capacité réduite de l’appareil",
  },
} as const;
const FILTER_LABELS = {
  en: { all: "All listed copies", saved: "Saved copies", UNKNOWN: "UNKNOWN", affected: "Affected copies", unaffected: "Unaffected copies" },
  fr: { all: "Toutes les copies", saved: "Copies enregistrées", UNKNOWN: "UNKNOWN", affected: "Copies touchées", unaffected: "Copies non touchées" },
} as const;
const SORT_LABELS = {
  en: { listed: "Manifest order", id: "Cell ID", "bytes-desc": "Largest first", status: "Local status", source: "Source name" },
  fr: { listed: "Ordre de la liste", id: "Identifiant", "bytes-desc": "Plus volumineuses d’abord", status: "État local", source: "Nom de la source" },
} as const;
const REASON_LABELS = {
  en: {
    present: "Copy saved locally", missing: "Not downloaded", stale: "Out of date",
    unreadable: "Could not read local copy", unlisted: "Not listed", "inventory-unavailable": "UNKNOWN inventory",
    "inventory-conflict": "Source conflict", "invalid-manifest": "Invalid listing",
    "simulated-eviction": "Hypothetical loss of a local copy",
    "simulated-source-change": "Hypothetical source change",
    "simulated-capacity": "Hypothetical storage capacity reduction",
  },
  fr: {
    present: "Copie enregistrée localement", missing: "Non téléchargée", stale: "Périmée",
    unreadable: "Impossible de lire la copie locale", unlisted: "Non répertoriée", "inventory-unavailable": "Inventaire UNKNOWN",
    "inventory-conflict": "Conflit de source", "invalid-manifest": "Liste incorrecte",
    "simulated-eviction": "Perte hypothétique d’une copie locale",
    "simulated-source-change": "Modification hypothétique de source",
    "simulated-capacity": "Réduction hypothétique de la capacité de stockage",
  },
} as const;
export function continuityScenarioLabel(value: keyof typeof SCENARIO_LABELS.en, language: Language): string {
  return SCENARIO_LABELS[language][value];
}
export function continuityFilterLabel(value: keyof typeof FILTER_LABELS.en, language: Language): string {
  return FILTER_LABELS[language][value];
}
export function continuitySortLabel(value: keyof typeof SORT_LABELS.en, language: Language): string {
  return SORT_LABELS[language][value];
}
export function continuityReasonLabel(value: keyof typeof REASON_LABELS.en, language: Language): string {
  return REASON_LABELS[language][value];
}
export function continuityFormatBytes(value: number | null, language: Language): string {
  if (value === null || !Number.isSafeInteger(value) || value < 0) return "UNKNOWN";
  if (value < 1000) return `${value} B`;
  return `${new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA").format(value / 1000)} kB`;
}
export function auditContinuityCopy(): readonly string[] {
  const errors: string[] = [];
  const english = CONTINUITY_COPY.en;
  const french = CONTINUITY_COPY.fr;
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

import type { Language } from "./regionDownload";
import type { EvidenceTier, LedgerReason, LedgerState } from "./sourceLedger";

/** English and French text for source metadata and device storage states. */
export const SOURCE_LEDGER_COPY = {
  en: {
    title: "Offline source ledger",
    intro: "Review source records and what this device can read. A source tier does not describe a place's accessibility.",
    open: "Show source ledger",
    close: "Hide source ledger",
    refresh: "Refresh source ledger",
    search: "Search cell or source",
    filter: "Filter cells",
    sort: "Sort cells",
    all: "All listed cells",
    saved: "Saved on this device",
    unknown: "UNKNOWN",
    tierUnknown: "Tier UNKNOWN",
    sourceIssues: "Source issues",
    listed: "Listed order",
    byId: "Cell ID",
    bySize: "Largest listed size",
    byDate: "Newest source date",
    countSaved: "Saved copies",
    countUnknown: "UNKNOWN copies",
    countTier: "UNKNOWN source tiers",
    countListed: "Cells in this ledger",
    size: "Listed bytes",
    source: "Source",
    licence: "Licence",
    date: "Source date",
    tier: "Recorded source tier",
    basis: "Tier basis",
    observed: "Device record source",
    state: "Offline copy status",
    reason: "Why this status appears",
    noRows: "No cells match these filters.",
    next: "Next page",
    previous: "Previous page",
    page: "Ledger page",
    export: "Save source ledger as JSON",
    error: "The source ledger could not be saved.",
    working: "Reading local source records…",
    unavailable: "Local source records cannot be read. Status UNKNOWN.",
    disclaimer: "A saved file is not evidence of physical accessibility. UNKNOWN is retained when source or device information is missing.",
    pending: "No source tier is recorded for this cell.",
    tierSubmitted: "Submitted",
    tierDocumented: "Documented source",
    tierReviewed: "Source review recorded",
    reasonPresent: "Local copy matches listed metadata",
    reasonMissing: "Local copy not downloaded",
    reasonStale: "Local copy is out of date",
    reasonUnreadable: "Local copy cannot be read",
    reasonUnavailable: "Local inventory unavailable",
    reasonConflict: "Source or size differs from the listing",
    reasonUnlisted: "Device cell absent from listing",
    reasonDuplicate: "Repeated or conflicting record",
    reasonInvalid: "Required source, licence or date missing or unsupported",
  },
  fr: {
    title: "Registre des sources hors ligne",
    intro: "Consultez les sources et ce que cet appareil peut lire. Le niveau d’une source ne décrit pas l’accessibilité d’un lieu.",
    open: "Afficher le registre des sources",
    close: "Masquer le registre des sources",
    refresh: "Actualiser le registre des sources",
    search: "Rechercher une cellule ou une source",
    filter: "Filtrer les cellules",
    sort: "Trier les cellules",
    all: "Toutes les cellules répertoriées",
    saved: "Enregistrée sur cet appareil",
    unknown: "INCONNU",
    tierUnknown: "Niveau INCONNU",
    sourceIssues: "Problèmes de source",
    listed: "Ordre de la liste",
    byId: "Identifiant de cellule",
    bySize: "Plus grande taille répertoriée",
    byDate: "Date de source la plus récente",
    countSaved: "Copies enregistrées",
    countUnknown: "Copies à état INCONNU",
    countTier: "Niveaux de source INCONNUS",
    countListed: "Cellules dans ce registre",
    size: "Octets répertoriés",
    source: "Source",
    licence: "Licence",
    date: "Date de la source",
    tier: "Niveau de source consigné",
    basis: "Fondement du niveau",
    observed: "Source de l’enregistrement local",
    state: "État de la copie hors ligne",
    reason: "Raison de cet état",
    noRows: "Aucune cellule ne correspond à ces filtres.",
    next: "Page suivante",
    previous: "Page précédente",
    page: "Page du registre",
    export: "Enregistrer le registre des sources en JSON",
    error: "Impossible d’enregistrer le registre des sources.",
    working: "Lecture des sources locales…",
    unavailable: "Les sources locales sont illisibles. État INCONNU.",
    disclaimer: "Une copie enregistrée ne prouve pas l’accessibilité physique. L’état INCONNU est conservé en l’absence de données locales ou de sources.",
    pending: "Aucun niveau de source n’est consigné pour cette cellule.",
    tierSubmitted: "Soumise",
    tierDocumented: "Source documentée",
    tierReviewed: "Examen de source consigné",
    reasonPresent: "La copie locale correspond aux métadonnées répertoriées",
    reasonMissing: "Copie locale non téléchargée",
    reasonStale: "Copie locale périmée",
    reasonUnreadable: "Copie locale illisible",
    reasonUnavailable: "Inventaire local indisponible",
    reasonConflict: "La source ou la taille diffère de la liste",
    reasonUnlisted: "Cellule de l’appareil absente de la liste",
    reasonDuplicate: "Enregistrement répété ou contradictoire",
    reasonInvalid: "Source, licence ou date obligatoire manquante ou non admise",
  },
} as const;

export type LedgerCopyKey = keyof typeof SOURCE_LEDGER_COPY.en;

export function sourceLedgerCopy(language: Language): Readonly<Record<LedgerCopyKey, string>> {
  return SOURCE_LEDGER_COPY[language];
}

export function tierLabel(tier: EvidenceTier, language: Language): string {
  const copy = sourceLedgerCopy(language);
  if (tier === "submitted") return copy.tierSubmitted;
  if (tier === "documented") return copy.tierDocumented;
  if (tier === "reviewed-source") return copy.tierReviewed;
  return copy.unknown;
}

export function reasonLabel(reason: LedgerReason, language: Language): string {
  const copy = sourceLedgerCopy(language);
  switch (reason) {
    case "present": return copy.reasonPresent;
    case "missing": return copy.reasonMissing;
    case "stale": return copy.reasonStale;
    case "unreadable": return copy.reasonUnreadable;
    case "inventory-unavailable": return copy.reasonUnavailable;
    case "metadata-conflict": return copy.reasonConflict;
    case "unlisted": return copy.reasonUnlisted;
    case "duplicate": return copy.reasonDuplicate;
    case "invalid-source": return copy.reasonInvalid;
  }
}

export function stateLabel(state: LedgerState, language: Language): string {
  return state === "saved" ? sourceLedgerCopy(language).saved : sourceLedgerCopy(language).unknown;
}

/** Guard against missing translations, unsafe copy, and French punctuation regressions. */
export function auditSourceLedgerCopy(): readonly string[] {
  const issues: string[] = [];
  const keys = new Set([...Object.keys(SOURCE_LEDGER_COPY.en), ...Object.keys(SOURCE_LEDGER_COPY.fr)]);
  for (const key of keys) {
    const en = (SOURCE_LEDGER_COPY.en as Record<string, string>)[key];
    const fr = (SOURCE_LEDGER_COPY.fr as Record<string, string>)[key];
    if (!en?.trim() || !fr?.trim()) issues.push(`missing:${key}`);
  }
  for (const [language, strings] of Object.entries(SOURCE_LEDGER_COPY)) {
    for (const [key, value] of Object.entries(strings)) {
      if (/(?<![\p{L}\p{N}])(?:verified|verify|vérifi\p{L}*|real-time|partnership|guarantee)(?![\p{L}\p{N}])/iu.test(value)) {
        issues.push(`claim:${language}:${key}`);
      }
      if (language === "fr") {
        if (value.includes("'")) issues.push(`apostrophe:${key}`);
        if (/(?<!\u00a0):/u.test(value)) issues.push(`colon:${key}`);
        if (/(?<!\u202f)[;!?]/u.test(value)) issues.push(`punctuation:${key}`);
      }
    }
  }
  return issues;
}

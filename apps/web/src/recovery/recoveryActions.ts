import type { RegionStatus } from "../../../../packages/data-client/src/index.ts";

/** User-initiated actions only. A downloaded flag is not a byte integrity check. */
export type RecoveryItem = Readonly<{ id: string; label: string; state: "downloaded" | "missing" | "unknown" }>;

export function recoveryItems(regions: readonly RegionStatus[], locale: "en" | "fr"): RecoveryItem[] {
  return regions.map((region) => ({
    id: region.id,
    label: region.label[locale],
    state: region.downloaded && region.missingCells.length === 0
      ? "downloaded"
      : region.missingCells.length > 0
        ? "missing"
        : "unknown",
  }));
}

export const RECOVERY_COPY = {
  en: {
    title: "Local recovery", inventory: "Saved regions", queue: "Actions to review",
    check: "Check again", download: "Download missing files", missing: "Files missing",
    downloaded: "Saved; byte status UNKNOWN", unknown: "UNKNOWN", empty: "No missing regions listed",
    explanation: "Saved status alone does not confirm file integrity. Check again to review the available information.",
  },
  fr: {
    title: "Récupération locale", inventory: "Régions enregistrées", queue: "Étapes à examiner",
    check: "Contrôler de nouveau", download: "Télécharger les fichiers manquants", missing: "Fichiers manquants",
    downloaded: "Enregistré ; état des octets INCONNU", unknown: "INCONNU", empty: "Aucune région manquante indiquée",
    explanation: "Le statut enregistré ne confirme pas l’intégrité des fichiers. Contrôlez de nouveau les renseignements disponibles.",
  },
} as const;

import type { RecoveryLocale } from "./index";
import type { EvidenceTier, TransferCondition, TransferDecision, TransferIssue, TransferKind, TransferStage } from "./recoveryTransferPreflight";

export interface PreflightCopy {
  readonly heading: string;
  readonly introduction: string;
  readonly disclaimer: string;
  readonly entry: string;
  readonly packId: string;
  readonly kind: string;
  readonly condition: string;
  readonly stage: string;
  readonly source: string;
  readonly licence: string;
  readonly date: string;
  readonly tier: string;
  readonly reference: string;
  readonly note: string;
  readonly expected: string;
  readonly available: string;
  readonly unknownBytes: string;
  readonly search: string;
  readonly add: string;
  readonly export: string;
  readonly import: string;
  readonly apply: string;
  readonly review: string;
  readonly discard: string;
  readonly cancel: string;
  readonly saved: string;
  readonly failed: string;
  readonly empty: string;
  readonly pending: string;
  readonly inspected: string;
  readonly counts: string;
  readonly findings: string;
  readonly next: string;
  readonly noAction: string;
  readonly collisions: string;
  readonly additions: string;
  readonly unchanged: string;
  readonly kinds: Readonly<Record<TransferKind, string>>;
  readonly conditions: Readonly<Record<TransferCondition, string>>;
  readonly stages: Readonly<Record<TransferStage, string>>;
  readonly tiers: Readonly<Record<EvidenceTier, string>>;
  readonly decisions: Readonly<Record<TransferDecision, string>>;
  readonly issues: Readonly<Record<TransferIssue, string>>;
}

const en: PreflightCopy = {
  heading: "Local transfer preflight",
  introduction: "Record the problem before deciding what to do next.",
  disclaimer: "This is a manual note. It does not inspect bytes, change a downloaded pack, or start a transfer.",
  entry: "New transfer note", packId: "Pack ID", kind: "Operation", condition: "Reported problem",
  stage: "Review stage", source: "Source", licence: "Open licence", date: "Source date",
  tier: "Evidence tier", reference: "Source reference", note: "Note", expected: "Expected bytes",
  available: "Available bytes", unknownBytes: "Leave a byte field blank to keep it UNKNOWN.",
  search: "Filter notes", add: "Record note", export: "Save JSON file", import: "Choose local JSON file",
  apply: "Add non-conflicting notes", review: "Mark reviewed", discard: "Discard note", cancel: "Cancel import",
  saved: "Local file saved.", failed: "Could not complete the local action.",
  empty: "No transfer notes recorded.", pending: "Inspect the local packs before recording a note.",
  inspected: "Pack inspection is required for this entry.", counts: "Transfer notes", findings: "Manual next step",
  next: "Review next", noAction: "No action was started.", collisions: "Conflicting IDs", additions: "New notes", unchanged: "Unchanged notes",
  kinds: { pack: "Pack", download: "Download", export: "Export" },
  conditions: { unknown: "UNKNOWN", interrupted: "Interrupted", damaged: "Damaged", missing: "Missing", permission: "Permission issue", storage: "Storage issue" },
  stages: { draft: "Draft", reviewed: "Reviewed", discarded: "Discarded" },
  tiers: { UNKNOWN: "UNKNOWN", "file-metadata": "File metadata", "user-observation": "User observation", "source-document": "Source document" },
  decisions: {
    UNKNOWN: "UNKNOWN", "review-input": "Inspect the source file", "review-space": "Review storage capacity",
    "review-permissions": "Review local permissions", "review-source": "Review the source and licence", "manual-retry": "Choose whether to retry manually",
  },
  issues: {
    format: "Unsupported local file", limit: "Local file exceeds the size limit", identifier: "Invalid identifier",
    duplicate: "Duplicate entry ID", date: "Invalid timestamp or date", source: "Source details incomplete",
    licence: "An open licence is required", tier: "Unsupported evidence tier", text: "Text contains unsupported characters",
    condition: "Unsupported failure type", bytes: "Invalid byte quantity", kind: "Unsupported operation",
    stage: "Unsupported review stage", transition: "A finished note cannot be changed", conflict: "Conflicting entry IDs",
    unexpected: "Unexpected property", "future-date": "Date is later than the selected reference",
  },
};
const fr: PreflightCopy = {
  heading: "Préparation locale à la récupération",
  introduction: "Consignez le problème avant de choisir une prochaine étape.",
  disclaimer: "Il s’agit d’une note manuelle. Aucun octet n’est examiné, aucun ensemble téléchargé n’est modifié et aucun transfert n’est lancé.",
  entry: "Nouvelle note", packId: "Identifiant de l’ensemble", kind: "Opération", condition: "Problème signalé",
  stage: "Étape d’examen", source: "Source", licence: "Licence ouverte", date: "Date de la source",
  tier: "Niveau de preuve", reference: "Référence de la source", note: "Note", expected: "Octets attendus",
  available: "Octets disponibles", unknownBytes: "Laissez le champ vide pour conserver la valeur UNKNOWN.",
  search: "Filtrer les notes", add: "Consigner la note", export: "Enregistrer le fichier JSON", import: "Choisir un fichier JSON local",
  apply: "Ajouter les notes sans conflit", review: "Marquer comme examinée", discard: "Écarter la note", cancel: "Annuler l’importation",
  saved: "Fichier local enregistré.", failed: "L’action locale n’a pas pu aboutir.",
  empty: "Aucune note sur les transferts.", pending: "Examinez les ensembles locaux avant de consigner une note.",
  inspected: "L’examen de l’ensemble est nécessaire pour cette entrée.", counts: "Notes de transfert", findings: "Prochaine étape manuelle",
  next: "Examiner ensuite", noAction: "Aucune action n’a été lancée.", collisions: "Identifiants en conflit", additions: "Nouvelles notes", unchanged: "Notes inchangées",
  kinds: { pack: "Ensemble", download: "Téléchargement", export: "Exportation" },
  conditions: { unknown: "UNKNOWN", interrupted: "Interrompu", damaged: "Endommagé", missing: "Manquant", permission: "Problème d’autorisation", storage: "Problème de stockage" },
  stages: { draft: "Brouillon", reviewed: "Examiné", discarded: "Écarté" },
  tiers: { UNKNOWN: "UNKNOWN", "file-metadata": "Métadonnées du fichier", "user-observation": "Observation personnelle", "source-document": "Document source" },
  decisions: {
    UNKNOWN: "UNKNOWN", "review-input": "Examiner le fichier source", "review-space": "Examiner le stockage",
    "review-permissions": "Examiner les autorisations locales", "review-source": "Examiner la source et sa licence", "manual-retry": "Décider d’une nouvelle tentative manuelle",
  },
  issues: {
    format: "Fichier local non pris en charge", limit: "Le fichier dépasse la limite", identifier: "Identifiant invalide",
    duplicate: "Identifiant en double", date: "Horodatage ou date invalide", source: "Renseignements sur la source incomplets",
    licence: "Une licence ouverte est nécessaire", tier: "Niveau de preuve non pris en charge", text: "Texte contenant des caractères non pris en charge",
    condition: "Type de problème non pris en charge", bytes: "Quantité d’octets invalide", kind: "Opération non prise en charge",
    stage: "Étape d’examen non prise en charge", transition: "Une note terminée ne peut pas être modifiée", conflict: "Identifiants en conflit",
    unexpected: "Propriété inattendue", "future-date": "Date postérieure à la date choisie",
  },
};

export function recoveryTransferCopy(locale: RecoveryLocale): PreflightCopy {
  return locale === "fr" ? fr : en;
}

import type { RecoveryLocale } from "./index";
import type { LedgerIssue, LedgerPhase, LedgerTier, LedgerValue } from "./recoveryProvenanceLedger";

export interface LedgerCopy {
  readonly heading: string;
  readonly intro: string;
  readonly pack: string;
  readonly field: string;
  readonly value: string;
  readonly phase: string;
  readonly note: string;
  readonly source: string;
  readonly licence: string;
  readonly sourceDate: string;
  readonly reference: string;
  readonly tier: string;
  readonly add: string;
  readonly inspectFirst: string;
  readonly empty: string;
  readonly summary: string;
  readonly conflicts: string;
  readonly reported: string;
  readonly fieldOverview: string;
  readonly sourceCount: string;
  readonly latestSourceDate: string;
  readonly count: string;
  readonly search: string;
  readonly all: string;
  readonly review: string;
  readonly dispute: string;
  readonly check: string;
  readonly import: string;
  readonly export: string;
  readonly stage: string;
  readonly apply: string;
  readonly cancel: string;
  readonly added: string;
  readonly unchanged: string;
  readonly collisions: string;
  readonly saved: string;
  readonly failed: string;
  readonly readError: string;
  readonly localOnly: string;
  readonly result: Readonly<Record<LedgerValue, string>>;
  readonly phases: Readonly<Record<LedgerPhase, string>>;
  readonly tiers: Readonly<Record<LedgerTier, string>>;
  readonly issues: Readonly<Record<LedgerIssue, string>>;
}

const en: LedgerCopy = {
  heading: "Local source reconciliation",
  intro: "Compare manually supplied statements about downloaded data. A statement does not change pack status or establish accessibility at a place.",
  pack: "Pack", field: "Field key", value: "Reported value", phase: "Review state",
  note: "Context note", source: "Source name", licence: "Open licence", sourceDate: "Source date",
  reference: "Source reference", tier: "Evidence tier", add: "Add source statement",
  inspectFirst: "Inspect saved packs first to select a pack.",
  empty: "No local source statements yet.", summary: "Local statements", conflicts: "Disputed fields",
  count: "Count", reported: "One reported value", fieldOverview: "Field source overview", sourceCount: "Sources", latestSourceDate: "Latest supplied source date", search: "Find statements", all: "All statements", review: "Mark reviewed",
  dispute: "Mark disputed", check: "Compare statements", import: "Choose a local JSON file",
  export: "Save local JSON", stage: "Import preview", apply: "Add without conflicts",
  cancel: "Cancel import", added: "New statements", unchanged: "Already present",
  collisions: "Conflicting IDs", saved: "Local file saved.", failed: "The operation could not finish.",
  readError: "The selected file could not be read.", localOnly: "No network request or automatic pack change is made.",
  result: { UNKNOWN: "UNKNOWN", present: "Present (reported)", absent: "Absent (reported)", conflicting: "Conflicting" },
  phases: { draft: "Draft", reviewed: "Reviewed", disputed: "Disputed" },
  tiers: { UNKNOWN: "UNKNOWN", "source-document": "Source document", "personal-observation": "Personal observation", "third-party-report": "Third-party report" },
  issues: {
    format: "Unsupported document shape", limit: "Local size or count limit exceeded",
    text: "Text contains unsupported characters", identifier: "Pack, field or item ID is invalid",
    duplicate: "The statement ID is already present", date: "Invalid date",
    source: "Source information is incomplete", licence: "An open licence is required",
    tier: "Unsupported evidence tier", value: "Unsupported value", phase: "Unsupported review state",
    transition: "A completed review cannot be changed", conflict: "The selected file has conflicting IDs",
    order: "Date order is invalid",
  },
};

const fr: LedgerCopy = {
  heading: "Rapprochement local des sources",
  intro: "Comparez les déclarations sur les données téléchargées. Une déclaration ne modifie ni l’état d’un ensemble ni l’accessibilité d’un lieu.",
  pack: "Ensemble", field: "Clé du champ", value: "Valeur déclarée", phase: "État de l’examen",
  note: "Note de contexte", source: "Nom de la source", licence: "Licence ouverte", sourceDate: "Date de la source",
  reference: "Référence de la source", tier: "Niveau de preuve", add: "Ajouter une déclaration",
  inspectFirst: "Examinez les ensembles enregistrés avant de choisir un ensemble.",
  empty: "Aucune déclaration locale enregistrée.", summary: "Déclarations locales", conflicts: "Champs contestés",
  count: "Nombre", reported: "Une valeur déclarée", fieldOverview: "Aperçu des sources par champ", sourceCount: "Sources", latestSourceDate: "Dernière date de source fournie", search: "Chercher des déclarations", all: "Toutes les déclarations", review: "Marquer comme examiné",
  dispute: "Marquer comme contesté", check: "Comparer les déclarations", import: "Choisir un fichier JSON local",
  export: "Enregistrer le fichier JSON local", stage: "Aperçu de l’importation", apply: "Ajouter sans conflit",
  cancel: "Annuler l’importation", added: "Nouvelles déclarations", unchanged: "Déjà présentes",
  collisions: "Identifiants en conflit", saved: "Fichier local enregistré.", failed: "L’opération n’a pas pu se terminer.",
  readError: "Le fichier sélectionné n’a pas pu être lu.", localOnly: "Aucune requête réseau ni modification automatique des ensembles.",
  result: { UNKNOWN: "UNKNOWN", present: "Présent (déclaré)", absent: "Absent (déclaré)", conflicting: "Contradictoire" },
  phases: { draft: "Brouillon", reviewed: "Examiné", disputed: "Contesté" },
  tiers: { UNKNOWN: "UNKNOWN", "source-document": "Document source", "personal-observation": "Observation personnelle", "third-party-report": "Rapport tiers" },
  issues: {
    format: "Structure de document non prise en charge", limit: "Limite locale de taille ou de nombre atteinte",
    text: "Le texte contient des caractères non pris en charge", identifier: "Identifiant d’ensemble, de champ ou d’élément invalide",
    duplicate: "Identifiant de déclaration déjà présent", date: "Date invalide",
    source: "Renseignements sur la source incomplets", licence: "Une licence ouverte est nécessaire",
    tier: "Niveau de preuve non pris en charge", value: "Valeur non prise en charge", phase: "État d’examen non pris en charge",
    transition: "Un examen terminé ne peut pas être modifié", conflict: "Le fichier contient des identifiants contradictoires",
    order: "Ordre des dates invalide",
  },
};

export function provenanceCopy(locale: RecoveryLocale): LedgerCopy {
  return locale === "fr" ? fr : en;
}
